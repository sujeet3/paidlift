import {
  AdminStats,
  AdminUser,
  AdminVehicle,
  AdminRide,
  AdminBooking,
  AdminPayout,
  AdminSos,
  AdminPlatformSettings,
} from './types';

const STORAGE_KEY = 'paidlift_admin_secret_key';
export const DEFAULT_ADMIN_KEY = 'paidlift_superadmin_secret_2026';

export const getStoredAdminKey = (): string => {
  return sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || DEFAULT_ADMIN_KEY;
};

export const setStoredAdminKey = (key: string, persist: boolean = true) => {
  sessionStorage.setItem(STORAGE_KEY, key);
  if (persist) {
    localStorage.setItem(STORAGE_KEY, key);
  }
};

export const clearStoredAdminKey = () => {
  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
};

const getBaseUrl = (): string => {
  if ((import.meta as any).env?.VITE_BACKEND_URL) {
    return (import.meta as any).env.VITE_BACKEND_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://paidlift.onrender.com';
  }
  // Uses local Vite proxy /api
  return '';
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const adminKey = getStoredAdminKey();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (adminKey) {
    headers.set('X-Admin-Key', adminKey);
  }

  const url = `${getBaseUrl()}/api/admin${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.message || errJson.error || errJson.detail?.message || errJson.detail || errorMsg;
      if (typeof errorMsg === 'object') {
        errorMsg = JSON.stringify(errorMsg);
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export const adminApi = {
  // Auth
  async login(adminKey: string) {
    try {
      const res = await fetch(`${getBaseUrl()}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_key: adminKey }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Invalid Super Admin credentials.');
        }
        throw new Error(`Backend returned HTTP ${res.status}. Check backend status.`);
      }
      const data = await res.json();
      setStoredAdminKey(adminKey, true);
      return data;
    } catch (err: any) {
      if (err.message && err.message.includes('Failed to fetch')) {
        throw new Error('Cannot connect to backend server. Please verify backend is running.');
      }
      throw err;
    }
  },

  async verifyAuth(): Promise<boolean> {
    try {
      await request('/auth/verify');
      return true;
    } catch {
      return false;
    }
  },

  // Stats
  async getStats(): Promise<AdminStats> {
    return request<AdminStats>('/stats');
  },

  // Users
  async getUsers(params: { search?: string; role?: string; status?: string; page?: number; limit?: number } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.role && params.role !== 'all') query.set('role', params.role);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<{ users: AdminUser[]; total: number; page: number; limit: number }>(`/users${qs}`);
  },

  async getUserDetails(userId: string) {
    return request<{
      user: AdminUser;
      vehicles: AdminVehicle[];
      rides_offered: AdminRide[];
      bookings: AdminBooking[];
      wallet_transactions: any[];
    }>(`/users/${userId}`);
  },

  async createUser(payload: Partial<AdminUser>) {
    return request<AdminUser>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateUser(userId: string, data: Partial<AdminUser>) {
    return request<AdminUser>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async adjustWallet(userId: string, amountDelta: number, reason: string) {
    return request<{ user_id: string; previous_balance: number; new_balance: number; adjustment: number }>(
      `/users/${userId}/wallet-adjust`,
      {
        method: 'POST',
        body: JSON.stringify({ amount_delta: amountDelta, reason }),
      }
    );
  },

  async deleteUser(userId: string) {
    return request<{ success: boolean; message: string }>(`/users/${userId}`, {
      method: 'DELETE',
    });
  },

  // Vehicles
  async getVehicles(status: 'all' | 'pending' | 'approved' | 'rejected' = 'all') {
    const qs = status ? `?status=${status}` : '';
    return request<{ vehicles: AdminVehicle[]; count: number }>(`/vehicles${qs}`);
  },

  async getVehicleDetails(vehicleId: string) {
    return request<AdminVehicle>(`/vehicles/${vehicleId}`);
  },

  async reviewVehicle(vehicleId: string, approved: boolean, rejectionReason?: string) {
    return request<AdminVehicle>(`/vehicles/${vehicleId}/review`, {
      method: 'POST',
      body: JSON.stringify({ approved, rejection_reason: rejectionReason || '' }),
    });
  },

  async deleteVehicle(vehicleId: string) {
    return request<{ success: boolean; message: string }>(`/vehicles/${vehicleId}`, {
      method: 'DELETE',
    });
  },

  // Rides
  async getRides(status: string = 'all', page: number = 1, limit: number = 50) {
    const query = new URLSearchParams();
    if (status && status !== 'all') query.set('status', status);
    query.set('page', String(page));
    query.set('limit', String(limit));
    return request<{ rides: AdminRide[]; total: number; page: number; limit: number }>(`/rides?${query.toString()}`);
  },

  async getRideDetails(rideId: string) {
    return request<{ ride: AdminRide; passengers: any[]; bookings: AdminBooking[] }>(`/rides/${rideId}`);
  },

  async forceCancelRide(rideId: string, reason: string) {
    return request<{ success: boolean; refunds_issued: any[]; message: string }>(`/rides/${rideId}/force-cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async deleteRide(rideId: string) {
    return request<{ success: boolean; message: string }>(`/rides/${rideId}`, {
      method: 'DELETE',
    });
  },

  // Bookings
  async getBookings(status: string = 'all', page: number = 1, limit: number = 50) {
    const query = new URLSearchParams();
    if (status && status !== 'all') query.set('status', status);
    query.set('page', String(page));
    query.set('limit', String(limit));
    return request<{ bookings: AdminBooking[]; total: number; page: number; limit: number }>(`/bookings?${query.toString()}`);
  },

  async refundBooking(bookingId: string, reason: string) {
    return request<{ success: boolean; refunded_amount: number; message: string }>(`/bookings/${bookingId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // Payouts
  async getPayouts(status: string = 'all') {
    const qs = status && status !== 'all' ? `?status=${status}` : '';
    return request<AdminPayout[]>(`/payouts${qs}`);
  },

  async processPayout(payoutId: string, action: 'approve' | 'reject', transactionReference?: string, notes?: string) {
    return request<AdminPayout>(`/payouts/${payoutId}/process`, {
      method: 'POST',
      body: JSON.stringify({
        action,
        transaction_reference: transactionReference || `IMPS-${Date.now().toString().slice(-8)}`,
        notes: notes || '',
      }),
    });
  },

  // SOS
  async getSos(status: string = 'all') {
    const qs = status && status !== 'all' ? `?status=${status}` : '';
    return request<AdminSos[]>(`/sos${qs}`);
  },

  async updateSos(sosId: string, status: 'acknowledged' | 'resolved' | 'open', resolutionNotes?: string) {
    return request<AdminSos>(`/sos/${sosId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, resolution_notes: resolutionNotes || '' }),
    });
  },

  // Settings & Maintenance
  async getSettings(): Promise<AdminPlatformSettings> {
    return request<AdminPlatformSettings>('/settings');
  },

  async updateSettings(data: Partial<AdminPlatformSettings>) {
    return request<AdminPlatformSettings>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async cleanupExpiredRides() {
    return request<{ success: boolean; expired_rides_count: number; message: string }>('/maintenance/cleanup-expired-rides', {
      method: 'POST',
    });
  },

  async fixSeatCounts() {
    return request<{ success: boolean; rides_checked: number; rides_reconciled: number; message: string }>('/maintenance/fix-seat-counts', {
      method: 'POST',
    });
  },
};
