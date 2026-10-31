export interface AdminStats {
  counts: {
    users: number;
    vehicles: number;
    pending_vehicles: number;
    active_rides: number;
    total_rides: number;
    bookings: number;
    open_sos: number;
  };
  financials: {
    total_gmv_inr: number;
    platform_revenue_inr: number;
    pending_payouts_inr: number;
    currency: string;
  };
  server_time: string;
}

export interface AdminUser {
  id: string;
  phone: string;
  name: string;
  email?: string;
  role: 'passenger' | 'owner' | 'both' | 'admin';
  aadhaar_last4?: string;
  aadhaar_verified: boolean;
  wallet_balance: number;
  status: 'active' | 'suspended' | 'banned';
  created_at: string;
  profile_photo?: string;
  gender?: string;
  bio?: string;
  vehicles_count?: number;
  rides_count?: number;
  bookings_count?: number;
}

export interface AdminVehicle {
  id: string;
  user_id: string;
  owner_name?: string;
  owner_phone?: string;
  make: string;
  model: string;
  color: string;
  number_plate: string;
  seats: number;
  vehicle_type?: string;
  fuel_type?: string;
  has_ac?: boolean;
  approved: boolean;
  rejection_reason?: string;
  created_at: string;
  photo_urls?: string[];
  documents?: {
    rc_number?: string;
    rc_photo_url?: string;
    dl_number?: string;
    dl_photo_url?: string;
    insurance_valid_till?: string;
  };
}

export interface AdminRide {
  id: string;
  driver_id: string;
  driver_name?: string;
  driver_phone?: string;
  vehicle_id?: string;
  vehicle_model?: string;
  vehicle_number?: string;
  origin: string;
  destination: string;
  origin_city?: string;
  destination_city?: string;
  departure_time: string;
  seats_offered: number;
  seats_available: number;
  fare_per_seat: number;
  luggage_allowed?: boolean;
  smoking_allowed?: boolean;
  status: 'open' | 'departed' | 'completed' | 'cancelled' | 'expired';
  created_at: string;
  passengers?: Array<{
    booking_id: string;
    user_id: string;
    passenger_name: string;
    seats_booked: number;
    fare_paid: number;
    payment_status: string;
  }>;
}

export interface AdminBooking {
  id: string;
  ride_id: string;
  user_id: string;
  passenger_name?: string;
  passenger_phone?: string;
  driver_id?: string;
  driver_name?: string;
  seats: number;
  total_fare: number;
  status: 'confirmed' | 'completed' | 'cancelled';
  payment_method: 'wallet' | 'cash' | 'razorpay' | 'upi';
  pickup_point?: string;
  drop_point?: string;
  created_at: string;
  refunded?: boolean;
  refund_amount?: number;
}

export interface AdminPayout {
  id: string;
  user_id: string;
  driver_name?: string;
  driver_phone?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected';
  method: 'upi' | 'bank_transfer';
  upi_id?: string;
  bank_account?: {
    account_number: string;
    ifsc: string;
    holder_name: string;
    bank_name?: string;
  };
  transaction_reference?: string;
  notes?: string;
  created_at: string;
  processed_at?: string;
}

export interface AdminSos {
  id: string;
  user_id: string;
  reporter_name?: string;
  reporter_phone?: string;
  reporter_role?: 'passenger' | 'driver';
  ride_id?: string;
  ride_summary?: string;
  latitude: number;
  longitude: number;
  status: 'open' | 'acknowledged' | 'resolved';
  trigger_time: string;
  resolution_notes?: string;
  created_at: string;
}

export interface AdminPlatformSettings {
  commission_percentage: number;
  emergency_contact_number: string;
  support_phone: string;
  auto_expire_hours_after_departure: number;
  maintenance_mode: boolean;
}
