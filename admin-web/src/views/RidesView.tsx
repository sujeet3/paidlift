import React, { useState, useEffect } from 'react';
import {
  Car,
  MapPin,
  Calendar,
  Users,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  Search,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { AdminRide } from '../types';
import { adminApi } from '../api';
import { Modal } from '../components/Modal';

interface RidesViewProps {
  onRefreshParent: () => void;
}

export const RidesView: React.FC<RidesViewProps> = ({ onRefreshParent }) => {
  const [rides, setRides] = useState<AdminRide[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals
  const [selectedRide, setSelectedRide] = useState<AdminRide | null>(null);
  const [rideDetails, setRideDetails] = useState<any | null>(null);
  const [cancelModalRide, setCancelModalRide] = useState<AdminRide | null>(null);
  const [cancelReason, setCancelReason] = useState('Admin safety / schedule intervention');

  const loadRides = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getRides(statusFilter);
      setRides(res.rides || []);
    } catch (err) {
      console.error('Failed to load rides:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRides();
  }, [statusFilter]);

  const handleOpenPassengers = async (ride: AdminRide) => {
    setSelectedRide(ride);
    setRideDetails(null);
    try {
      const details = await adminApi.getRideDetails(ride.id);
      setRideDetails(details);
    } catch (err) {
      console.error('Failed to fetch ride details:', err);
    }
  };

  const handleForceCancelConfirm = async () => {
    if (!cancelModalRide) return;
    setActionLoading(cancelModalRide.id);
    try {
      const res = await adminApi.forceCancelRide(cancelModalRide.id, cancelReason);
      alert(`Ride cancelled successfully. Issued ${res.refunds_issued?.length || 0} passenger refund(s).`);
      setCancelModalRide(null);
      await loadRides();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to force-cancel ride');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteRide = async (rideId: string) => {
    if (!confirm('Are you sure you want to permanently delete this ride?')) return;
    setActionLoading(rideId);
    try {
      await adminApi.deleteRide(rideId);
      await loadRides();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to delete ride');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredRides = rides.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.origin?.toLowerCase().includes(q) ||
      r.destination?.toLowerCase().includes(q) ||
      r.driver_name?.toLowerCase().includes(q) ||
      r.driver_phone?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Top Filter and Search */}
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
            All Rides ({rides.length})
          </button>
          <button
            className={`tab-btn ${statusFilter === 'open' ? 'active' : ''}`}
            onClick={() => setStatusFilter('open')}
          >
            Open & Active
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
            Cancelled
          </button>
        </div>

        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="input-control"
            placeholder="Search route or driver..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Rides Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Corridor Route</th>
                <th>Driver & Vehicle</th>
                <th>Departure</th>
                <th>Seat Inventory</th>
                <th>Fare / Seat</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Loading rides telemetry...</div>
                  </td>
                </tr>
              ) : filteredRides.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '50px' }}>
                    <Car size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No rides found</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                      No corridor rides match the selected filters.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRides.map((ride) => (
                  <tr key={ride.id}>
                    <td>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#fff', fontSize: 14 }}>
                          <span>{ride.origin}</span>
                          <ArrowRight size={14} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
                          <span>{ride.destination}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                          ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{ride.id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 13.5 }}>
                        {ride.driver_name || 'Driver'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                        {ride.driver_phone || ride.driver_id}
                      </div>
                      {ride.vehicle_number && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          Plate: {ride.vehicle_number}
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fff' }}>
                        <Calendar size={13} style={{ color: 'var(--brand-primary)' }} />
                        <span>{new Date(ride.departure_time).toLocaleString()}</span>
                      </div>
                    </td>

                    <td>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                          {ride.seats_available} / {ride.seats_offered} Available
                        </div>
                        <div
                          style={{
                            width: '100px',
                            height: '5px',
                            background: 'var(--bg-input)',
                            borderRadius: '3px',
                            marginTop: '5px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, ((ride.seats_offered - ride.seats_available) / (ride.seats_offered || 1)) * 100))}%`,
                              height: '100%',
                              background: 'var(--brand-primary)',
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                        ₹{ride.fare_per_seat}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          ride.status === 'open'
                            ? 'badge-success'
                            : ride.status === 'completed'
                            ? 'badge-info'
                            : 'badge-danger'
                        }`}
                      >
                        {ride.status}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => handleOpenPassengers(ride)}
                          className="btn btn-secondary btn-sm"
                          title="View Booked Passengers"
                        >
                          <Eye size={13} />
                          <span>Passengers</span>
                        </button>

                        {ride.status === 'open' && (
                          <button
                            onClick={() => {
                              setCancelModalRide(ride);
                              setCancelReason('Admin safety / schedule intervention');
                            }}
                            disabled={actionLoading === ride.id}
                            className="btn btn-danger-outline btn-sm"
                            title="Force cancel ride and refund all passengers"
                          >
                            <XCircle size={13} />
                            <span>Force Cancel</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteRide(ride.id)}
                          disabled={actionLoading === ride.id}
                          className="btn-icon"
                          style={{ color: 'var(--text-muted)' }}
                          title="Delete ride record"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Passengers Inspection Modal */}
      {selectedRide && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedRide(null)}
          title={`Passengers: ${selectedRide.origin} ➔ ${selectedRide.destination}`}
          maxWidth="680px"
          footer={
            <button onClick={() => setSelectedRide(null)} className="btn btn-secondary">
              Close
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                background: 'var(--bg-surface)',
                padding: 14,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Driver</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{selectedRide.driver_name || 'Driver'}</div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fare / Seat</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                  ₹{selectedRide.fare_per_seat}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Status</span>
                <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize', color: '#fff' }}>
                  {selectedRide.status}
                </div>
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10 }}>
                Confirmed Passenger Bookings
              </h4>
              {rideDetails?.bookings && rideDetails.bookings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rideDetails.bookings.map((b: any) => (
                    <div
                      key={b.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: 13.5 }}>
                          {b.passenger_name || 'Passenger'} ({b.seats} Seat{b.seats > 1 ? 's' : ''})
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                          {b.passenger_phone || b.user_id}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                          ₹{b.total_fare}
                        </div>
                        <span className="badge badge-success" style={{ marginTop: 4 }}>
                          {b.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 13 }}>
                  No passenger bookings found on this ride.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Force Cancel Confirmation Modal */}
      {cancelModalRide && (
        <Modal
          isOpen={true}
          onClose={() => setCancelModalRide(null)}
          title="Force Cancel Ride & Auto-Refund"
          footer={
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCancelModalRide(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleForceCancelConfirm} className="btn btn-danger">
                Confirm Cancellation & Issue Refunds
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13.5, color: '#fca5a5' }}>
              ⚠️ You are force-cancelling ride <strong>{cancelModalRide.origin} ➔ {cancelModalRide.destination}</strong>.
              All booked passengers will automatically receive an instant 100% refund into their PaidLift wallets.
            </p>

            <div className="input-group">
              <label className="input-label">Reason for Force Cancellation</label>
              <input
                type="text"
                className="input-control"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason provided to passengers and driver"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
