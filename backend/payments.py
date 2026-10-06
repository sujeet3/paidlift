"""
Payment integration for PAID LIFT — supports Razorpay + PhonePe (India).

Two-mode design:
  1. REAL mode — activated when RAZORPAY_KEY_ID / PHONEPE_CLIENT_ID are set
     to real values (not the *_REPLACE placeholder). Uses gateway hosted checkout.
  2. SIMULATION mode — activated automatically when keys are still the
     placeholder. Backend serves a mock checkout HTML page so the whole flow
     (order create → hosted checkout → callback → status polling → wallet credit)
     is fully testable without any real keys.

Server is the source of truth: amount is recomputed server-side, wallet/booking
mutations are done from finalise_payment() after webhook / status polling
returns a confirmed COMPLETED state.
"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime, timezone
import os
import uuid
import hmac
import hashlib
import json
import logging

import httpx

logger = logging.getLogger(__name__)

# ---------- Config helpers ----------
RZP_PLACEHOLDER = "rzp_test_REPLACE"
PP_PLACEHOLDER = "REPLACE"


def rzp_configured() -> bool:
    kid = os.environ.get("RAZORPAY_KEY_ID", "")
    return bool(kid) and kid != RZP_PLACEHOLDER


def phonepe_configured() -> bool:
    mid = os.environ.get("PHONEPE_MERCHANT_ID", "")
    return bool(mid) and mid != PP_PLACEHOLDER


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- Models ----------
class OrderIn(BaseModel):
    provider: Literal["razorpay", "phonepe"]
    purpose: Literal["wallet_topup", "ride", "subscription"]
    user_id: str
    amount: Optional[float] = None  # rupees; required for wallet_topup
    booking_id: Optional[str] = None  # required for ride


class StatusIn(BaseModel):
    payment_id: str


DRIVER_PLUS_PRICE = 99.0
DRIVER_PLUS_RIDES = 20
DRIVER_PLUS_DAYS = 30


# Simple in-memory rate limiting for order creation
_order_rate: dict = {}


def _rate_limit(key: str, limit: int, window_sec: int):
    import time
    now = time.time()
    hits = [t for t in _order_rate.get(key, []) if now - t < window_sec]
    if len(hits) >= limit:
        raise HTTPException(429, "Too many payment attempts. Please wait.")
    hits.append(now)
    _order_rate[key] = hits


# ---------- Router factory ----------
def build_router(db, base_url_from_env: str) -> APIRouter:
    router = APIRouter(prefix="/api/payments")

    async def _resolve_amount(body: OrderIn) -> int:
        """Returns amount in paise. Recomputed server-side (never trust client)."""
        if body.purpose == "wallet_topup":
            if not body.amount or body.amount <= 0:
                raise HTTPException(400, "amount is required for wallet_topup")
            return int(round(body.amount * 100))
        if body.purpose == "subscription":
            return int(round(DRIVER_PLUS_PRICE * 100))
        # ride
        if not body.booking_id:
            raise HTTPException(400, "booking_id is required for ride payment")
        b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Booking not found")
        if b.get("passenger_id") != body.user_id:
            raise HTTPException(403, "Only the passenger can pay for this booking")
        if b.get("paid"):
            raise HTTPException(400, "Booking is already paid")
        return int(round(b["total_price"] * 100))

    async def _finalise(payment_id: str, provider_payment_id: str, status: str):
        p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
        if not p:
            return
        if status != "paid":
            await db.payments.update_one(
                {"id": payment_id, "status": {"$nin": ["paid", "refunded"]}},
                {"$set": {"status": "failed", "updated_at": utcnow_iso()}},
            )
            return

        # atomic idempotent claim
        claim = await db.payments.update_one(
            {"id": payment_id, "credited": {"$ne": True}},
            {"$set": {
                "credited": True,
                "status": "paid",
                "provider_payment_id": provider_payment_id,
                "updated_at": utcnow_iso(),
            }},
        )
        if claim.modified_count != 1:
            logger.info(f"Payment {payment_id} already credited — duplicate callback ignored")
            return

        amount_rupees = p["amount_paise"] / 100.0
        if p["purpose"] == "subscription":
            # Activate Driver Plus: 0% commission on next N rides
            from datetime import timedelta as _td
            await db.users.update_one(
                {"id": p["user_id"]},
                {"$set": {"driver_plus": {
                    "active": True,
                    "rides_left": DRIVER_PLUS_RIDES,
                    "subscribed_at": utcnow_iso(),
                    "expires_at": (datetime.now(timezone.utc) + _td(days=DRIVER_PLUS_DAYS)).isoformat(),
                }}},
            )
            await db.wallet_txns.insert_one({
                "id": new_id(), "user_id": p["user_id"], "amount": -amount_rupees,
                "kind": "ride_payment", "note": "Driver Plus subscription (30 days)",
                "created_at": utcnow_iso(),
            })
        elif p["purpose"] == "wallet_topup":
            await db.users.update_one(
                {"id": p["user_id"]}, {"$inc": {"wallet_balance": amount_rupees}}
            )
            await db.wallet_txns.insert_one({
                "id": new_id(),
                "user_id": p["user_id"],
                "amount": amount_rupees,
                "kind": "topup",
                "note": f"Wallet top-up via {p['provider'].title()}",
                "created_at": utcnow_iso(),
            })
        else:  # ride
            booking = await db.bookings.find_one({"id": p["booking_id"]}, {"_id": 0})
            if not booking:
                logger.error(f"Booking gone at finalisation: {p['booking_id']}")
                return
            # Driver Plus: 0% commission while subscription rides remain
            owner = await db.users.find_one({"id": booking["owner_id"]}, {"_id": 0})
            dp = (owner or {}).get("driver_plus") or {}
            dp_active = bool(dp.get("active")) and dp.get("expires_at", "") > utcnow_iso() and dp.get("rides_left", 0) > 0
            commission = 0.0 if dp_active else round(amount_rupees * 0.10, 2)
            owner_amt = round(amount_rupees - commission, 2)
            await db.bookings.update_one(
                {"id": booking["id"]},
                {"$set": {"paid": True, "status": "accepted"}},
            )
            # Decrement seats only once per booking (guard against re-decrement).
            if not booking.get("seats_decremented"):
                await db.rides.update_one(
                    {"id": booking["ride_id"], "seats_available": {"$gte": booking["seats"]}},
                    {"$inc": {"seats_available": -booking["seats"]}},
                )
                await db.bookings.update_one(
                    {"id": booking["id"]}, {"$set": {"seats_decremented": True}}
                )
            await db.users.update_one(
                {"id": booking["owner_id"]}, {"$inc": {"wallet_balance": owner_amt}}
            )
            txns = [
                {
                    "id": new_id(),
                    "user_id": p["user_id"],
                    "amount": -amount_rupees,
                    "kind": "ride_payment",
                    "note": f"Booking {booking['id']} via {p['provider'].title()}",
                    "created_at": utcnow_iso(),
                },
                {
                    "id": new_id(),
                    "user_id": booking["owner_id"],
                    "amount": owner_amt,
                    "kind": "ride_earning",
                    "note": f"Booking {booking['id']}" + (" (Driver Plus: 0% fee)" if dp_active else ""),
                    "created_at": utcnow_iso(),
                },
            ]
            if commission > 0:
                txns.append({
                    "id": new_id(),
                    "user_id": booking["owner_id"],
                    "amount": -commission,
                    "kind": "commission",
                    "note": "Platform fee 10%",
                    "created_at": utcnow_iso(),
                })
            else:
                await db.users.update_one(
                    {"id": booking["owner_id"]}, {"$inc": {"driver_plus.rides_left": -1}}
                )
            await db.wallet_txns.insert_many(txns)

    # ---------- Create order ----------
    @router.post("/order")
    async def create_order(body: OrderIn):
        _rate_limit(f"order:{body.user_id}", 10, 60)
        amount_paise = await _resolve_amount(body)
        payment_id = new_id()

        # Decide simulation vs real per provider.
        simulate = (
            (body.provider == "razorpay" and not rzp_configured())
            or (body.provider == "phonepe" and not phonepe_configured())
        )

        provider_order_id = f"sim_{payment_id[:8]}"
        checkout_url = f"{base_url_from_env}/api/payments/simulator?payment_id={payment_id}"

        # ---- Razorpay real order ----
        if body.provider == "razorpay" and not simulate:
            try:
                import razorpay
                client = razorpay.Client(auth=(
                    os.environ["RAZORPAY_KEY_ID"],
                    os.environ["RAZORPAY_KEY_SECRET"],
                ))
                order = client.order.create({
                    "amount": amount_paise,
                    "currency": "INR",
                    "receipt": f"pay_{payment_id}",
                    "notes": {"payment_id": payment_id, "purpose": body.purpose},
                })
                provider_order_id = order["id"]
                # For mobile, we host a small HTML page that runs Razorpay Checkout.js
                # and posts result back to /razorpay/verify.
                checkout_url = f"{base_url_from_env}/api/payments/razorpay/checkout?payment_id={payment_id}"
            except Exception as e:
                logger.exception("Razorpay order creation failed, falling back to simulator")
                simulate = True

        # ---- PhonePe real order ----
        elif body.provider == "phonepe" and not simulate:
            try:
                token = await _phonepe_token()
                base = _phonepe_base()
                merchant_order_id = f"PP{payment_id.replace('-', '')[:24]}"
                payload = {
                    "merchantOrderId": merchant_order_id,
                    "amount": amount_paise,
                    "expireAfter": 1200,
                    "paymentFlow": {
                        "type": "PG_CHECKOUT",
                        "merchantUrls": {
                            "redirectUrl": f"{base_url_from_env}/api/payments/phonepe/return?payment_id={payment_id}"
                        },
                    },
                    "metaInfo": {"udf1": payment_id, "udf2": body.purpose},
                }
                async with httpx.AsyncClient(timeout=20) as c:
                    r = await c.post(
                        f"{base}/checkout/v2/pay",
                        json=payload,
                        headers={"Authorization": f"O-Bearer {token}", "Content-Type": "application/json"},
                    )
                    r.raise_for_status()
                    data = r.json()
                provider_order_id = merchant_order_id
                checkout_url = data.get("redirectUrl") or checkout_url
            except Exception:
                logger.exception("PhonePe order failed, falling back to simulator")
                simulate = True

        # ---- Persist payment doc ----
        await db.payments.insert_one({
            "id": payment_id,
            "user_id": body.user_id,
            "booking_id": body.booking_id,
            "purpose": body.purpose,
            "provider": body.provider,
            "amount_paise": amount_paise,
            "currency": "INR",
            "provider_order_id": provider_order_id,
            "provider_payment_id": None,
            "status": "created",
            "credited": False,
            "simulated": simulate,
            "created_at": utcnow_iso(),
            "updated_at": utcnow_iso(),
        })

        return {
            "payment_id": payment_id,
            "provider": body.provider,
            "amount_paise": amount_paise,
            "currency": "INR",
            "checkout_url": checkout_url,
            "simulated": simulate,
        }

    # ---------- Status polling ----------
    @router.post("/status")
    async def get_status(body: StatusIn):
        p = await db.payments.find_one({"id": body.payment_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Payment not found")

        # Real Razorpay: rely on client-side verify or webhook — status kept in DB.
        # Real PhonePe: poll gateway.
        if p["provider"] == "phonepe" and not p.get("simulated"):
            try:
                token = await _phonepe_token()
                base = _phonepe_base()
                async with httpx.AsyncClient(timeout=15) as c:
                    r = await c.get(
                        f"{base}/checkout/v2/order/{p['provider_order_id']}/status",
                        params={"details": "true"},
                        headers={"Authorization": f"O-Bearer {token}"},
                    )
                    r.raise_for_status()
                    data = r.json()
                state = data.get("state", "PENDING")
                if state == "COMPLETED" and data.get("amount") == p["amount_paise"]:
                    details = data.get("paymentDetails") or [{}]
                    await _finalise(p["id"], details[-1].get("transactionId", ""), "paid")
                elif state == "FAILED":
                    await _finalise(p["id"], "", "failed")
            except Exception:
                logger.exception("PhonePe status poll failed")

        p = await db.payments.find_one({"id": body.payment_id}, {"_id": 0})
        return {"payment_id": p["id"], "status": p["status"], "provider": p["provider"], "simulated": p.get("simulated", False)}

    # ---------- SIMULATOR (fallback) ----------
    @router.get("/simulator", response_class=HTMLResponse)
    async def simulator_page(payment_id: str):
        p = await db.payments.find_one({"id": payment_id}, {"_id": 0})
        if not p:
            return HTMLResponse("<h2>Unknown payment</h2>", status_code=404)
        amt = p["amount_paise"] / 100
        return HTMLResponse(f"""
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PAID LIFT — Sandbox Checkout</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#F5F6F8; margin:0; padding:24px; color:#1A1B1F; }}
  .card {{ max-width:420px; margin:60px auto; background:#fff; border-radius:20px; padding:32px; box-shadow:0 8px 32px rgba(0,0,0,0.08); }}
  h1 {{ margin:0 0 4px; font-size:24px; }}
  .sub {{ color:#71747E; font-size:13px; margin-bottom:24px; }}
  .amt {{ font-size:42px; font-weight:800; color:#EF6C00; margin:16px 0 4px; }}
  .badge {{ display:inline-block; background:#FFF3E0; color:#EF6C00; font-weight:700; padding:4px 10px; border-radius:99px; font-size:11px; text-transform:uppercase; letter-spacing:1px; }}
  .mode {{ background:#FFECB3; border-left:4px solid #F57C00; padding:12px; border-radius:8px; font-size:12px; margin:16px 0; color:#5D4037; }}
  .method {{ display:flex; align-items:center; gap:12px; padding:14px; border:1px solid #E0E2E7; border-radius:12px; margin-bottom:8px; cursor:pointer; }}
  .method:hover {{ border-color:#EF6C00; background:#FFF3E0; }}
  .method .ico {{ width:32px; height:32px; background:#F5F6F8; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:16px; }}
  .btn {{ display:block; width:100%; padding:16px; border:none; border-radius:12px; font-weight:800; font-size:15px; cursor:pointer; margin-top:12px; }}
  .btn-pay {{ background:#EF6C00; color:#fff; }}
  .btn-fail {{ background:#fff; color:#D32F2F; border:1px solid #D32F2F; }}
</style></head>
<body>
  <div class="card">
    <span class="badge">{p['provider']}</span>
    <h1>PAID LIFT</h1>
    <div class="sub">Secure Sandbox Checkout</div>

    <div class="mode">
      🧪 <b>Simulation mode</b> — real gateway keys not configured yet. Set
      <code>RAZORPAY_KEY_ID</code>/<code>PHONEPE_CLIENT_ID</code> in backend .env
      to switch to live checkout.
    </div>

    <div style="text-align:center;">
      <div class="sub">Amount payable</div>
      <div class="amt">₹{amt:.2f}</div>
    </div>

    <div style="margin-top:20px">
      <div class="method"><div class="ico">🏦</div> UPI / GPay / PhonePe</div>
      <div class="method"><div class="ico">💳</div> Credit / Debit Card</div>
      <div class="method"><div class="ico">🏛️</div> Netbanking</div>
    </div>

    <button class="btn btn-pay" onclick="pay('success')">✓ Pay ₹{amt:.2f}</button>
    <button class="btn btn-fail" onclick="pay('failed')">✕ Simulate Failure</button>
  </div>
<script>
async function pay(result) {{
  await fetch('/api/payments/simulator/callback', {{
    method:'POST', headers:{{'Content-Type':'application/json'}},
    body: JSON.stringify({{payment_id:'{payment_id}', result}})
  }});
  document.body.innerHTML = '<div class="card"><h1>' +
    (result==='success' ? '✓ Payment Successful' : '✕ Payment Cancelled') +
    '</h1><p class="sub">Return to the app…</p></div>';
  setTimeout(()=>{{ try {{ window.close(); }} catch(e){{}} }}, 800);
}}
</script>
</body></html>
""")

    class SimCallback(BaseModel):
        payment_id: str
        result: Literal["success", "failed"]

    @router.post("/simulator/callback")
    async def simulator_callback(body: SimCallback):
        await _finalise(
            body.payment_id,
            f"sim_pay_{body.payment_id[:8]}",
            "paid" if body.result == "success" else "failed",
        )
        return {"ok": True}

    # ---------- Razorpay real: hosted checkout page ----------
    @router.get("/razorpay/checkout", response_class=HTMLResponse)
    async def razorpay_checkout(payment_id: str):
        p = await db.payments.find_one({"id": payment_id, "provider": "razorpay"}, {"_id": 0})
        if not p:
            return HTMLResponse("<h2>Unknown</h2>", 404)
        u = await db.users.find_one({"id": p["user_id"]}, {"_id": 0})
        key_id = os.environ.get("RAZORPAY_KEY_ID", "")
        return HTMLResponse(f"""
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body style="font-family:-apple-system,sans-serif;text-align:center;padding:40px;">
<h3>Opening Razorpay…</h3>
<script>
const options = {{
  "key": "{key_id}",
  "amount": {p['amount_paise']},
  "currency": "INR",
  "name": "PAID LIFT",
  "description": "{p['purpose']}",
  "order_id": "{p['provider_order_id']}",
  "prefill": {{"contact": "{u.get('phone','') if u else ''}", "name": "{u.get('name','') if u else ''}"}},
  "theme": {{"color": "#EF6C00"}},
  "handler": async function(resp) {{
    await fetch('/api/payments/razorpay/verify', {{
      method:'POST', headers:{{'Content-Type':'application/json'}},
      body: JSON.stringify({{
        payment_id: '{payment_id}',
        razorpay_order_id: resp.razorpay_order_id,
        razorpay_payment_id: resp.razorpay_payment_id,
        razorpay_signature: resp.razorpay_signature
      }})
    }});
    document.body.innerHTML = '<h2>✓ Success. Return to app…</h2>';
    setTimeout(()=>{{ try{{window.close();}}catch(e){{}} }}, 800);
  }}
}};
new Razorpay(options).open();
</script></body></html>""")

    class RazorpayVerify(BaseModel):
        payment_id: str
        razorpay_order_id: str
        razorpay_payment_id: str
        razorpay_signature: str

    @router.post("/razorpay/verify")
    async def razorpay_verify(body: RazorpayVerify):
        p = await db.payments.find_one({"id": body.payment_id, "provider": "razorpay"}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Unknown payment")
        secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
        msg = f"{p['provider_order_id']}|{body.razorpay_payment_id}"
        expected = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, body.razorpay_signature):
            raise HTTPException(400, "Invalid signature")
        await _finalise(body.payment_id, body.razorpay_payment_id, "paid")
        return {"ok": True}

    # ---------- Razorpay webhook ----------
    @router.post("/razorpay/webhook")
    async def razorpay_webhook(request: Request):
        raw = await request.body()
        secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
        sig = request.headers.get("x-razorpay-signature", "")
        expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        if not secret or not hmac.compare_digest(expected, sig):
            raise HTTPException(400, "Invalid webhook signature")
        event = json.loads(raw)
        if event.get("event") in ("payment.captured", "payment.authorized"):
            ent = event["payload"]["payment"]["entity"]
            p = await db.payments.find_one({"provider_order_id": ent.get("order_id")}, {"_id": 0})
            if p:
                await _finalise(p["id"], ent.get("id", ""), "paid")
        return {"ok": True}

    # ---------- PhonePe redirect + webhook ----------
    @router.get("/phonepe/return")
    async def phonepe_return(payment_id: str):
        # After returning we just close the window; app is already polling status.
        return HTMLResponse(
            f"<h3>Returning to app…</h3><script>setTimeout(()=>{{try{{window.close();}}catch(e){{}}}},500);</script>"
        )

    @router.post("/phonepe/webhook")
    async def phonepe_webhook(request: Request):
        raw = await request.body()
        # PhonePe V2 webhook validation varies by account. Provide a basic HMAC using SALT_KEY.
        sig = request.headers.get("phonepe-checksum-signature", "") or request.headers.get("x-verify", "")
        key = os.environ.get("PHONEPE_SALT_KEY", "")
        if key:
            expected = hmac.new(key.encode(), raw, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, sig.split("###")[0] if "###" in sig else sig):
                raise HTTPException(400, "Invalid PhonePe webhook")
        event = json.loads(raw)
        payload = event.get("payload", {})
        p = await db.payments.find_one({"provider_order_id": payload.get("merchantOrderId")}, {"_id": 0})
        if p:
            state = payload.get("state")
            if state == "COMPLETED":
                details = payload.get("paymentDetails") or [{}]
                await _finalise(p["id"], details[-1].get("transactionId", ""), "paid")
            elif state == "FAILED":
                await _finalise(p["id"], "", "failed")
        return {"ok": True}

    return router


# ---------- PhonePe helpers ----------
def _phonepe_base() -> str:
    return "https://api-preprod.phonepe.com/apis/pg-sandbox" if os.environ.get("PHONEPE_ENV", "sandbox") == "sandbox" else "https://api.phonepe.com/apis/pg"


async def _phonepe_token() -> str:
    """Fetch OAuth token for PhonePe V2. Kept simple — no caching."""
    base = _phonepe_base()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            f"{base}/v1/oauth/token",
            data={
                "client_id": os.environ["PHONEPE_CLIENT_ID"],
                "client_secret": os.environ["PHONEPE_CLIENT_SECRET"],
                "client_version": os.environ.get("PHONEPE_CLIENT_VERSION", "1"),
                "grant_type": "client_credentials",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        r.raise_for_status()
        return r.json()["access_token"]
