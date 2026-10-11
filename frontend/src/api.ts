const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const ADMIN_SECRET = "paidlift_superadmin_secret_2026";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": ADMIN_SECRET,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  sendOtp: (phone: string) =>
    request<{ ok: boolean; mock_otp: string }>("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  verifyOtp: (phone: string, otp: string) =>
    request<{ user: any; is_new: boolean }>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, otp }),
    }),
  upsertUser: (data: any) =>
    request<any>("/users/upsert", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getUser: (id: string) => request<any>(`/users/${id}`),
  createVehicle: (data: any) =>
    request<any>("/vehicles", { method: "POST", body: JSON.stringify(data) }),
  listVehicles: (owner_id: string) =>
    request<any[]>(`/vehicles?owner_id=${owner_id}`),
  createRide: (data: any) =>
    request<any>("/rides", { method: "POST", body: JSON.stringify(data) }),
  searchRides: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return request<any[]>(`/rides?${q}`);
  },
  getRide: (id: string) => request<any>(`/rides/${id}`),
  createBooking: (data: any) =>
    request<any>("/bookings", { method: "POST", body: JSON.stringify(data) }),
  listBookings: (user_id: string, role: "passenger" | "owner") =>
    request<any[]>(`/bookings?user_id=${user_id}&role=${role}`),
  updateBooking: (id: string, data: any) =>
    request<any>(`/bookings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  getBooking: (id: string) => request<any>(`/bookings/${id}`),
  listChat: (booking_id: string) =>
    request<any[]>(`/chat/${booking_id}`),
  sendChat: (data: any) =>
    request<any>("/chat", { method: "POST", body: JSON.stringify(data) }),
  getWallet: (user_id: string) =>
    request<{ balance: number; transactions: any[] }>(`/wallet/${user_id}`),
  topUp: (user_id: string, amount: number) =>
    request<any>(`/wallet/${user_id}/topup?amount=${amount}`, { method: "POST" }),
  rate: (data: any) =>
    request<any>("/ratings", { method: "POST", body: JSON.stringify(data) }),
  sos: (data: any) =>
    request<any>("/sos", { method: "POST", body: JSON.stringify(data) }),
  createPaymentOrder: (data: {
    provider: "razorpay" | "phonepe";
    purpose: "wallet_topup" | "ride";
    user_id: string;
    amount?: number;
    booking_id?: string;
  }) =>
    request<{
      payment_id: string;
      provider: string;
      amount_paise: number;
      checkout_url: string;
      simulated: boolean;
    }>("/payments/order", { method: "POST", body: JSON.stringify(data) }),
  getPaymentStatus: (payment_id: string) =>
    request<{ payment_id: string; status: string; provider: string; simulated: boolean }>(
      "/payments/status",
      { method: "POST", body: JSON.stringify({ payment_id }) },
    ),

  uploadDocument: async (data: { base64_data?: string; doc_type: string; user_id?: string }) => {
    const formData = new FormData();
    if (data.base64_data) formData.append("base64_data", data.base64_data);
    formData.append("doc_type", data.doc_type);
    if (data.user_id) formData.append("user_id", data.user_id);
    const res = await fetch(`${BASE}/api/upload/document`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ ok: boolean; url: string; filename: string }>;
  },
  cancelRide: (rideId: string, reason?: string) =>
    request<any>(`/rides/${rideId}/cancel?reason=${encodeURIComponent(reason || "Driver cancelled")}`, {
      method: "POST",
    }),
  updateRideLocation: (
    rideId: string,
    location: { latitude: number; longitude: number; heading?: number; speed?: number }
  ) =>
    request<any>(`/rides/${rideId}/location`, {
      method: "PATCH",
      body: JSON.stringify(location),
    }),
  requestPayout: (data: {
    user_id: string;
    amount: number;
    payout_method: "upi" | "bank_account";
    upi_id?: string;
    account_number?: string;
    ifsc?: string;
    beneficiary_name?: string;
  }) => request<any>("/payments/payout-request", { method: "POST", body: JSON.stringify(data) }),
  listPayouts: (userId: string) => request<any[]>(`/payments/payouts/${userId}`),
  savePushToken: (userId: string, token: string) =>
    request<any>(`/users/${userId}/push-token`, { method: "POST", body: JSON.stringify({ token }) }),
  getSubscriptionPlans: () => request<any[]>("/subscriptions/plans"),
  getUserSubscription: (userId: string) =>
    request<{ has_driver_plus: boolean; subscription: any }>(`/subscriptions/${userId}`),
  getReferrals: (userId: string) => request<any>(`/referrals/${userId}`),
  applyReferral: (userId: string, code: string) =>
    request<any>(`/referrals/apply?user_id=${userId}`, { method: "POST", body: JSON.stringify({ code }) }),
  getCorridors: (from?: string, to?: string) =>
    request<any[]>(`/corridors${from && to ? `?from_location=${from}&to_location=${to}` : ""}`),
  getCorridorStops: (city: string) =>
    request<string[]>(`/corridors/stops?city=${encodeURIComponent(city)}`),

  // Super Admin CRUD
  adminStats: () => request<any>("/admin/stats"),
  adminUsers: (query?: string, role?: string, status?: string) => {
    const p = new URLSearchParams();
    if (query) p.append("query", query);
    if (role) p.append("role", role);
    if (status) p.append("status", status);
    return request<{ total: number; users: any[] }>(`/admin/users?${p.toString()}`);
  },
  adminUpdateUser: (userId: string, data: any) =>
    request<any>(`/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(data) }),
  adminWalletAdjust: (userId: string, amount: number, reason: string) =>
    request<any>(`/admin/users/${userId}/wallet-adjust`, {
      method: "POST",
      body: JSON.stringify({ amount, reason }),
    }),
  adminVehicles: (status: "all" | "pending" | "approved" | "rejected" = "all") =>
    request<{ total: number; vehicles: any[] }>(`/admin/vehicles?status=${status}`),
  adminReviewVehicle: (vehicleId: string, approved: boolean, reason?: string) =>
    request<any>(`/admin/vehicles/${vehicleId}/review`, {
      method: "POST",
      body: JSON.stringify({ approved, rejection_reason: reason }),
    }),
  adminRides: (status?: string) => {
    const p = status ? `?status=${status}` : "";
    return request<{ total: number; rides: any[] }>(`/admin/rides${p}`);
  },
  adminForceCancelRide: (rideId: string, reason: string) =>
    request<any>(`/admin/rides/${rideId}/force-cancel`, {
      method: "POST",
      body: JSON.stringify({ reason, refund_passengers: true }),
    }),
  adminSos: (status?: string) => {
    const p = status ? `?status=${status}` : "";
    return request<any[]>(`/admin/sos${p}`);
  },
  adminUpdateSos: (sosId: string, status: string, notes?: string) =>
    request<any>(`/admin/sos/${sosId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolution_notes: notes }),
    }),
  adminPayouts: (status: "all" | "pending" | "settled" | "rejected" = "all") =>
    request<any[]>(`/admin/payouts?status=${status}`),
  adminProcessPayout: (payoutId: string, action: "approve" | "reject", reasonOrRef?: string) =>
    request<any>(`/admin/payouts/${payoutId}/process`, {
      method: "POST",
      body: JSON.stringify({
        action: action === "approve" ? "approve" : "reject",
        transaction_ref: action === "approve" ? reasonOrRef || "IMPS_SETTLED_AUTO" : undefined,
        rejection_reason: action === "reject" ? reasonOrRef || "Declined by Admin" : undefined,
      }),
    }),
  adminCleanupExpiredRides: () =>
    request<any>("/admin/maintenance/cleanup-expired-rides", { method: "POST" }),
  adminFixSeats: () =>
    request<any>("/admin/maintenance/fix-seat-counts", { method: "POST" }),
};

