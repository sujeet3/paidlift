const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
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
  adminStats: () => request<any>("/admin/stats"),
  adminUsers: () => request<any[]>("/admin/users"),
  adminRides: () => request<any[]>("/admin/rides"),
  adminSos: () => request<any[]>("/admin/sos"),
};
