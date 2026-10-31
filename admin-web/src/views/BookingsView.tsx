import React, { useState, useEffect } from 'react';
import {
  Ticket,
  Search,
  IndianRupee,
  CreditCard,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { AdminBooking } from '../types';
import { adminApi } from '../api';
import { Modal } from '../components/Modal';

interface BookingsViewProps {
  onRefreshParent: () => void;
}

export const BookingsView: React.FC<BookingsViewProps> = ({ onRefreshParent }) => {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Refund Modal
  const [refundBooking, setRefundBooking] = useState<AdminBooking | null>(null);
  const [refundReason, setRefundReason] = useState('Super admin direct customer refund');

  const loadBookings = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getBookings(statusFilter);
      setBookings(res.bookings || []);
    } catch (err) {
      console.error('Failed to load bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, [statusFilter]);

  const handleRefundConfirm = async () => {
    if (!refundBooking) return;
    setActionLoading(refundBooking.id);
    try {
      const res = await adminApi.refundBooking(refundBooking.id, refundReason);
      alert(`Refund of ₹${res.refunded_amount || refundBooking.total_fare} issued to passenger wallet successfully.`);
      setRefundBooking(null);
      await loadBookings();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to refund booking');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredBookings = bookings.filter((b) => {
    const q = search.toLowerCase();
    return (
      b.id?.toLowerCase().includes(q) ||
      b.passenger_name?.toLowerCase().includes(q) ||
      b.passenger_phone?.toLowerCase().includes(q) ||
      b.ride_id?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Filters and Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div className="tabs-header" style={{ marginBottom: 0 }}>
          <button
            className={`tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Bookings ({bookings.length})
          </button>
          <button
            className={`tab-btn ${statusFilter === 'confirmed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('confirmed')}
          >
            Confirmed
          </button>
          <button
            className={`tab-btn ${statusFilter === 'completed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('completed')}
          >
            Completed
          </button>
          <button
            className={`tab-btn ${statusFilter === 'cancelled' ? 'active' : ''}`}
            onClick={() => setStatusFilter('cancelled')}
          >
            Cancelled & Refunded
          </button>
        </div>

        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="input-control"
            placeholder="Search booking ID, passenger..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Bookings Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Passenger</th>
                <th>Seats</th>
                <th>Total Fare</th>
                <th>Payment Mode</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Loading bookings transactions...</div>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '50px' }}>
                    <Ticket size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No bookings found</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                      No seat reservations match the current criteria.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#fff' }}>
                        {b.id.slice(0, 8)}...
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Ride: {b.ride_id?.slice(0, 8)}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 13.5 }}>
                        {b.passenger_name || 'Passenger'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                        {b.passenger_phone || b.user_id}
                      </div>
                    </td>

                    <td>
                      <span style={{ fontWeight: 600, color: '#fff' }}>
                        {b.seats} Seat{b.seats > 1 ? 's' : ''}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                        ₹{b.total_fare}
                      </div>
                    </td>

                    <td>
                      <span className="badge badge-muted" style={{ textTransform: 'uppercase' }}>
                        <CreditCard size={11} /> {b.payment_method || 'wallet'}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          b.status === 'confirmed'
                            ? 'badge-success'
                            : b.status === 'completed'
                            ? 'badge-info'
                            : 'badge-danger'
                        }`}
                      >
                        {b.status}
                      </span>
                      {b.refunded && (
                        <div style={{ fontSize: 11, color: 'var(--status-danger)', marginTop: 3 }}>
                          Refunded (₹{b.refund_amount || b.total_fare})
                        </div>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {b.status !== 'cancelled' && !b.refunded && (
                        <button
                          onClick={() => {
                            setRefundBooking(b);
                            setRefundReason('Super admin direct customer refund');
                          }}
                          disabled={actionLoading === b.id}
                          className="btn btn-danger-outline btn-sm"
                          title="Refund booking to passenger wallet"
                        >
                          <RotateCcw size={13} />
                          <span>Force Refund</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Force Refund Modal */}
      {refundBooking && (
        <Modal
          isOpen={true}
          onClose={() => setRefundBooking(null)}
          title={`Force Refund Booking: ₹${refundBooking.total_fare}`}
          footer={
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRefundBooking(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleRefundConfirm} className="btn btn-danger">
                Confirm & Issue Refund
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13.5, color: '#fca5a5' }}>
              Are you sure you want to refund ₹{refundBooking.total_fare} to{' '}
              <strong>{refundBooking.passenger_name || refundBooking.passenger_phone}</strong>'s wallet?
              The booking status will be updated to cancelled.
            </p>

            <div className="input-group">
              <label className="input-label">Refund Audit Reason</label>
              <input
                type="text"
                className="input-control"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
