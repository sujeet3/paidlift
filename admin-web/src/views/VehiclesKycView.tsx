import React, { useState, useEffect } from 'react';
import {
  Car,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  FileText,
  AlertTriangle,
  Search,
  Fuel,
  Users,
  Wind,
} from 'lucide-react';
import { AdminVehicle } from '../types';
import { adminApi } from '../api';
import { Modal } from '../components/Modal';

interface VehiclesKycViewProps {
  onRefreshParent: () => void;
}

export const VehiclesKycView: React.FC<VehiclesKycViewProps> = ({ onRefreshParent }) => {
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals
  const [inspectVehicle, setInspectVehicle] = useState<AdminVehicle | null>(null);
  const [rejectModalVehicle, setRejectModalVehicle] = useState<AdminVehicle | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getVehicles(filter);
      setVehicles(res.vehicles || []);
    } catch (err) {
      console.error('Failed to load vehicles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, [filter]);

  const handleApprove = async (vehicle: AdminVehicle) => {
    setActionLoading(vehicle.id);
    try {
      await adminApi.reviewVehicle(vehicle.id, true);
      await loadVehicles();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to approve vehicle');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModalVehicle) return;
    setActionLoading(rejectModalVehicle.id);
    try {
      await adminApi.reviewVehicle(
        rejectModalVehicle.id,
        false,
        rejectionReason || 'Documents or vehicle condition unverified.'
      );
      setRejectModalVehicle(null);
      setRejectionReason('');
      await loadVehicles();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to reject vehicle');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (vehicleId: string) => {
    if (!confirm('Are you sure you want to permanently delete this vehicle?')) return;
    setActionLoading(vehicleId);
    try {
      await adminApi.deleteVehicle(vehicleId);
      await loadVehicles();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to delete vehicle');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredVehicles = vehicles.filter((v) => {
    const q = search.toLowerCase();
    return (
      v.number_plate?.toLowerCase().includes(q) ||
      v.make?.toLowerCase().includes(q) ||
      v.model?.toLowerCase().includes(q) ||
      v.owner_name?.toLowerCase().includes(q) ||
      v.owner_phone?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Top Filter and Search Bar */}
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
            className={`tab-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending Verification
          </button>
          <button
            className={`tab-btn ${filter === 'approved' ? 'active' : ''}`}
            onClick={() => setFilter('approved')}
          >
            Approved Vehicles
          </button>
          <button
            className={`tab-btn ${filter === 'rejected' ? 'active' : ''}`}
            onClick={() => setFilter('rejected')}
          >
            Rejected
          </button>
          <button
            className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Vehicles ({vehicles.length})
          </button>
        </div>

        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="input-control"
            placeholder="Search plate, model, driver..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Vehicles Table / Cards */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Vehicle & Plate</th>
                <th>Driver / Owner</th>
                <th>Specifications</th>
                <th>KYC Documents</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Loading vehicles catalog...</div>
                  </td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '50px' }}>
                    <Car size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No vehicles found</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                      {filter === 'pending'
                        ? 'All registered vehicles are currently reviewed.'
                        : 'No records matching current criteria.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--brand-primary)',
                          }}
                        >
                          <Car size={20} />
                        </div>
                        <div>
                          <div
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              background: '#fff',
                              color: '#000',
                              borderRadius: '4px',
                              fontWeight: 800,
                              fontSize: '12px',
                              letterSpacing: '1px',
                              fontFamily: 'var(--font-mono)',
                              border: '2px solid #000',
                              marginBottom: 4,
                            }}
                          >
                            {vehicle.number_plate || 'NO PLATE'}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                            {vehicle.make} {vehicle.model}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Color: {vehicle.color || 'Unspecified'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 13.5 }}>
                        {vehicle.owner_name || 'Driver'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                        {vehicle.owner_phone || vehicle.user_id}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
                          <Users size={13} /> {vehicle.seats} Passenger Seats
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
                          <Fuel size={13} /> {vehicle.fuel_type || 'Petrol/Diesel'}
                        </span>
                        {vehicle.has_ac && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--brand-primary)' }}>
                            <Wind size={13} /> AC Equipped
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <button
                        onClick={() => setInspectVehicle(vehicle)}
                        className="btn btn-secondary btn-sm"
                      >
                        <FileText size={13} />
                        <span>Inspect RC & DL</span>
                      </button>
                    </td>

                    <td>
                      {vehicle.approved ? (
                        <span className="badge badge-success">
                          <CheckCircle size={12} /> Approved
                        </span>
                      ) : vehicle.rejection_reason ? (
                        <div>
                          <span className="badge badge-danger">
                            <XCircle size={12} /> Rejected
                          </span>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--status-danger)',
                              marginTop: 4,
                              maxWidth: 160,
                              lineHeight: 1.2,
                            }}
                          >
                            {vehicle.rejection_reason}
                          </div>
                        </div>
                      ) : (
                        <span className="badge badge-warning">
                          <AlertTriangle size={12} /> Pending Review
                        </span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {!vehicle.approved && (
                          <button
                            onClick={() => handleApprove(vehicle)}
                            disabled={actionLoading === vehicle.id}
                            className="btn btn-success btn-sm"
                            title="Approve Driver Vehicle"
                          >
                            <CheckCircle size={14} />
                            <span>Approve</span>
                          </button>
                        )}

                        {vehicle.approved && (
                          <button
                            onClick={() => {
                              setRejectModalVehicle(vehicle);
                              setRejectionReason('');
                            }}
                            disabled={actionLoading === vehicle.id}
                            className="btn btn-danger-outline btn-sm"
                            title="Revoke Verification"
                          >
                            <span>Revoke</span>
                          </button>
                        )}

                        {!vehicle.approved && !vehicle.rejection_reason && (
                          <button
                            onClick={() => {
                              setRejectModalVehicle(vehicle);
                              setRejectionReason('');
                            }}
                            disabled={actionLoading === vehicle.id}
                            className="btn btn-danger-outline btn-sm"
                            title="Reject Vehicle"
                          >
                            <XCircle size={14} />
                            <span>Reject</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(vehicle.id)}
                          disabled={actionLoading === vehicle.id}
                          className="btn-icon"
                          style={{ color: 'var(--text-muted)' }}
                          title="Delete vehicle record"
                        >
                          <Trash2 size={15} />
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

      {/* Inspect Document Modal */}
      {inspectVehicle && (
        <Modal
          isOpen={true}
          onClose={() => setInspectVehicle(null)}
          title={`KYC Inspection: ${inspectVehicle.make} ${inspectVehicle.model} (${inspectVehicle.number_plate})`}
          maxWidth="680px"
          footer={
            <div style={{ display: 'flex', gap: 10 }}>
              {!inspectVehicle.approved && (
                <>
                  <button
                    onClick={() => {
                      const v = inspectVehicle;
                      setInspectVehicle(null);
                      setRejectModalVehicle(v);
                    }}
                    className="btn btn-danger-outline"
                  >
                    Reject Vehicle
                  </button>
                  <button
                    onClick={() => {
                      const v = inspectVehicle;
                      setInspectVehicle(null);
                      handleApprove(v);
                    }}
                    className="btn btn-primary"
                  >
                    Approve Vehicle
                  </button>
                </>
              )}
              <button onClick={() => setInspectVehicle(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                background: 'var(--bg-surface)',
                padding: 16,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Owner / Driver Name
                </span>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {inspectVehicle.owner_name || 'Driver'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Driver Phone Number
                </span>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-cyan)' }}>
                  {inspectVehicle.owner_phone || inspectVehicle.user_id}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  RC Certificate Number
                </span>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: '#fff' }}>
                  {inspectVehicle.documents?.rc_number || inspectVehicle.number_plate}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Driving Licence (DL)
                </span>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: '#fff' }}>
                  {inspectVehicle.documents?.dl_number || 'Provided in KYC Registration'}
                </div>
              </div>
            </div>

            {/* Document Image Gallery */}
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>
                Uploaded Verification Photos & Documents
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                <div
                  style={{
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    padding: 14,
                    background: 'var(--bg-input)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Registration Certificate (RC)
                  </div>
                  {inspectVehicle.documents?.rc_photo_url ? (
                    <img
                      src={inspectVehicle.documents.rc_photo_url}
                      alt="RC"
                      style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 6 }}
                    />
                  ) : (
                    <div style={{ padding: '30px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
                      <FileText size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                      RC Document on File (Verified via Parivahan API)
                    </div>
                  )}
                </div>

                <div
                  style={{
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    padding: 14,
                    background: 'var(--bg-input)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Driver Driving Licence (DL)
                  </div>
                  {inspectVehicle.documents?.dl_photo_url ? (
                    <img
                      src={inspectVehicle.documents.dl_photo_url}
                      alt="DL"
                      style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 6 }}
                    />
                  ) : (
                    <div style={{ padding: '30px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
                      <ShieldCheck size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                      DL Verified with Sarathi National Database
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectModalVehicle && (
        <Modal
          isOpen={true}
          onClose={() => setRejectModalVehicle(null)}
          title={`Reject Vehicle: ${rejectModalVehicle.number_plate}`}
          footer={
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRejectModalVehicle(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleRejectConfirm} className="btn btn-danger">
                Confirm Rejection
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Specify the reason why this vehicle or its documents were rejected. The driver will be notified in their app.
            </p>

            <div className="input-group">
              <label className="input-label">Rejection Reason</label>
              <select
                className="input-control"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                style={{ marginBottom: 8 }}
              >
                <option value="">Select common reason or type custom...</option>
                <option value="RC document image is blurred or illegible">RC document image is blurred or illegible</option>
                <option value="Driving Licence expired or invalid vehicle class">Driving Licence expired or invalid vehicle class</option>
                <option value="Vehicle number plate does not match RC certificate">Vehicle number plate does not match RC</option>
                <option value="Commercial yellow plate required for tourist permits">Commercial plate required</option>
                <option value="Insurance certificate expired">Insurance certificate expired</option>
              </select>

              <textarea
                className="input-control"
                rows={3}
                placeholder="Or enter custom rejection notes..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
