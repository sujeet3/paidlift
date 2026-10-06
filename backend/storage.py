"""
Emergent Managed Object Storage for PAID LIFT — vehicle document photos.

App never talks to storage directly; all bytes flow through this backend.
- POST /api/upload  (multipart file)  -> stores object, returns path
- GET  /api/files/{path}              -> streams bytes back

Ownership is tracked in MongoDB (uploads collection). Object paths are
unguessable UUIDs; there is no delete API (soft-delete in DB only).
"""
import os
import uuid
import logging
import requests
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "paid-lift"

_storage_key = None


def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        # stale key — re-init once
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    if resp.status_code == 402:
        raise HTTPException(402, "Storage credits exhausted. Top up your Emergent balance.")
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        global _storage_key
        _storage_key = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code >= 400:
        raise HTTPException(404, "File not found")
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def build_router(db) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/upload")
    async def upload(
        file: UploadFile = File(...),
        user_id: str = Form(...),
        kind: str = Form("vehicle_doc"),  # vehicle_doc | profile
        ref_id: str = Form(""),           # vehicle id when kind=vehicle_doc
    ):
        data = await file.read()
        if len(data) > 5 * 1024 * 1024:
            raise HTTPException(413, "File too large (max 5 MB)")
        ext = (file.filename or "photo.jpg").rsplit(".", 1)[-1].lower()
        if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
            ext = "jpg"
        path = f"{APP_NAME}/uploads/{user_id}/{uuid.uuid4()}.{ext}"
        content_type = file.content_type or "image/jpeg"

        result = await run_in_threadpool(put_object, path, data, content_type)

        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "kind": kind,
            "ref_id": ref_id,
            "path": result["path"],
            "content_type": content_type,
            "size": result.get("size", len(data)),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.uploads.insert_one(doc)

        # Attach to vehicle when applicable
        if kind == "vehicle_doc" and ref_id:
            field = {
                "rc": "rc_photo",
                "dl": "dl_photo",
                "insurance": "insurance_photo",
            }
            # kind detail passed via ref? keep generic: attach to photos dict
            await db.vehicles.update_one(
                {"id": ref_id},
                {"$set": {f"doc_photos.{doc['id']}": result["path"]}},
            )
        return {"path": result["path"], "upload_id": doc["id"]}

    @router.get("/files/{path:path}")
    async def download(path: str):
        rec = await db.uploads.find_one({"path": path}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "File not found")
        data, content_type = await run_in_threadpool(get_object, path)
        return Response(content=data, media_type=content_type)

    return router
