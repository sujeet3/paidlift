import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  MapPin,
  ExternalLink,
  CheckCircle,
  Clock,
  PhoneCall,
  ShieldAlert,
  Send,
} from 'lucide-react';
import { AdminSos } from '../types';
import { adminApi } from '../api';
import { Modal } from '../components/Modal';

interface SosViewProps {
  onRefreshParent: () => void;
}

export const SosView: React.FC<SosViewProps> = ({ onRefreshParent }) => {
  const [sosList, setSosList] = useState<AdminSos[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('all');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Resolve Modal
  const [resolveSos, setResolveSos] = useState<AdminSos | null>(null);
  const [notes, setNotes] = useState('Safety team connected with passenger & emergency services dispatched');

  const loadSos = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getSos(filter);
      setSosList(res || []);
    } catch (err) {
      console.error('Failed to load SOS alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSos();
    // Auto-poll SOS radar every 15 seconds
    const interval = setInterval(loadSos, 15000);
    return () => clearInterval(interval);
  }, [filter]);

  const handleAcknowledge = async (sos: AdminSos) => {
    setActionLoading(sos.id);
    try {
      await adminApi.updateSos(sos.id, 'acknowledged', 'Super Admin acknowledged alert');
      await loadSos();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to acknowledge SOS');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveSubmit = async () => {
    if (!resolveSos) return;
    setActionLoading(resolveSos.id);
    try {
      await adminApi.updateSos(resolveSos.id, 'resolved', notes);
      setResolveSos(null);
      await loadSos();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to resolve SOS');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      {/* Top Banner */}
      <div
        style={{
          background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15), rgba(15, 23, 42, 0.6))',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-lg)',
          padding: '18px 24px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--status-danger)',
            }}
          >
            <ShieldAlert size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
              National Emergency Dispatch Integration (112 Police & Ambulance)
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              When a passenger or driver taps SOS in the mobile app, emergency beacons trigger here with GPS live location.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="pulse-dot" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-primary)' }}>Radar Active</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="tabs-header">
        <button
          className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Alerts ({sosList.length})
        </button>
        <button
          className={`tab-btn ${filter === 'open' ? 'active' : ''}`}
          onClick={() => setFilter('open')}
        >
          Open Alarms ({sosList.filter((s) => s.status === 'open').length})
        </button>
        <button
          className={`tab-btn ${filter === 'acknowledged' ? 'active' : ''}`}
          onClick={() => setFilter('acknowledged')}
        >
          Acknowledged / In Dispatch
        </button>
        <button
          className={`tab-btn ${filter === 'resolved' ? 'active' : ''}`}
          onClick={() => setFilter('resolved')}
        >
          Resolved
        </button>
      </div>

      {/* SOS Alerts List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Triggered By</th>
                <th>Trip & Ride Details</th>
                <th>Live GPS Coordinates</th>
                <th>Trigger Time</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Scanning live SOS telemetry...</div>
                  </td>
                </tr>
              ) : sosList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '50px' }}>
                    <CheckCircle size={36} style={{ color: 'var(--brand-primary)', margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>All Clear — Zero Active Emergency Alarms</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                      All platform passengers and drivers are currently safe.
                    </div>
                  </td>
                </tr>
              ) : (
                sosList.map((sos) => {
                  const mapsUrl = `https://www.google.com/maps?q=${sos.latitude},${sos.longitude}`;
                  return (
                    <tr
                      key={sos.id}
                      style={{
                        background: sos.status === 'open' ? 'rgba(239, 68, 68, 0.06)' : undefined,
                      }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>
                          {sos.reporter_name || 'Passenger / Driver'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                          {sos.reporter_phone || sos.user_id}
                        </div>
                        <span className="badge badge-muted" style={{ marginTop: 4, textTransform: 'capitalize' }}>
                          Role: {sos.reporter_role || 'passenger'}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: 13, color: '#fff' }}>
                          {sos.ride_summary || (sos.ride_id ? `Ride: ${sos.ride_id.slice(0, 8)}...` : 'Pre-trip standby')}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>
                            {sos.latitude.toFixed(5)}, {sos.longitude.toFixed(5)}
                          </div>
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              color: 'var(--accent-cyan)',
                              textDecoration: 'none',
                            }}
                          >
                            <MapPin size={12} />
                            <span>Open in Google Maps</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: 12.5, color: '#fff' }}>
                          {new Date(sos.trigger_time || sos.created_at).toLocaleTimeString()}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(sos.trigger_time || sos.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            sos.status === 'open'
                              ? 'badge-danger'
                              : sos.status === 'acknowledged'
                              ? 'badge-warning'
                              : 'badge-success'
                          }`}
                        >
                          {sos.status}
                        </span>
                        {sos.resolution_notes && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, maxWidth: 160 }}>
                            {sos.resolution_notes}
                          </div>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {sos.status === 'open' && (
                            <button
                              onClick={() => handleAcknowledge(sos)}
                              disabled={actionLoading === sos.id}
                              className="btn btn-secondary btn-sm"
                              title="Acknowledge and mark in response"
                            >
                              <span>Acknowledge</span>
                            </button>
                          )}

                          {sos.status !== 'resolved' && (
                            <button
                              onClick={() => {
                                setResolveSos(sos);
                                setNotes('Emergency handled safely. Dispatch verified.');
                              }}
                              disabled={actionLoading === sos.id}
                              className="btn btn-success btn-sm"
                              title="Mark resolved with incident report"
                            >
                              <CheckCircle size={14} />
                              <span>Resolve</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolve SOS Modal */}
      {resolveSos && (
        <Modal
          isOpen={true}
          onClose={() => setResolveSos(null)}
          title="Resolve Emergency SOS Incident"
          footer={
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setResolveSos(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleResolveSubmit} className="btn btn-primary">
                Confirm Incident Resolution
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Record the safety resolution details before closing this emergency beacon.
            </p>

            <div className="input-group">
              <label className="input-label">Incident Resolution Summary</label>
              <textarea
                rows={3}
                className="input-control"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter actions taken by emergency team..."
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
