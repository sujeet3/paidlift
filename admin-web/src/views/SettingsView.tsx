import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Save,
  Wrench,
  Percent,
  Phone,
  Clock,
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { AdminPlatformSettings } from '../types';
import { adminApi, getStoredAdminKey } from '../api';

interface SettingsViewProps {
  onRefreshParent: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onRefreshParent }) => {
  const [settings, setSettings] = useState<AdminPlatformSettings>({
    commission_percentage: 10.0,
    emergency_contact_number: '112',
    support_phone: '+918000000000',
    auto_expire_hours_after_departure: 2,
    maintenance_mode: false,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getSettings();
      if (data) {
        setSettings(data);
      }
    } catch (err: any) {
      console.warn('Settings load notice:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await adminApi.updateSettings(settings);
      setSettings(updated);
      setFeedback({ type: 'success', text: 'Platform configuration updated successfully.' });
      onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRunCleanup = async () => {
    setActionLoading('cleanup');
    setFeedback(null);
    try {
      const res = await adminApi.cleanupExpiredRides();
      setFeedback({
        type: 'success',
        text: `Sweep complete: ${res.expired_rides_count} expired ride(s) updated to expired status.`,
      });
      onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to sweep expired rides.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleFixSeats = async () => {
    setActionLoading('fixSeats');
    setFeedback(null);
    try {
      const res = await adminApi.fixSeatCounts();
      setFeedback({
        type: 'success',
        text: `Seat inventory audit complete: ${res.rides_checked} rides scanned, ${res.rides_reconciled} fixed.`,
      });
      onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to reconcile seats.' });
    } finally {
      setActionLoading(null);
    }
  };

  const currentKey = getStoredAdminKey();

  return (
    <div style={{ maxWidth: 1000 }}>
      {feedback && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            background: feedback.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-danger-bg)',
            border: `1px solid ${feedback.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: feedback.type === 'success' ? 'var(--status-success)' : '#fca5a5',
            fontSize: '13.5px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 24 }}>
        {/* Marketplace Settings Form */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <Percent size={18} style={{ color: 'var(--brand-primary)' }} />
                <span>Marketplace Economics & Policies</span>
              </h3>
              <p className="card-subtitle">Adjust platform cut, emergency contacts, and automated cleanup</p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings}>
            <div className="input-group">
              <label className="input-label">Platform Take Rate Commission (%)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  className="input-control"
                  value={settings.commission_percentage}
                  onChange={(e) =>
                    setSettings({ ...settings, commission_percentage: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Applied on all ride bookings. PaidLift retains this percentage as revenue.
              </span>
            </div>

            <div className="input-group">
              <label className="input-label">National Emergency Police Dispatch Number</label>
              <input
                type="text"
                className="input-control"
                value={settings.emergency_contact_number}
                onChange={(e) => setSettings({ ...settings, emergency_contact_number: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Customer Support Hotline</label>
              <input
                type="text"
                className="input-control"
                value={settings.support_phone}
                onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Auto-Expire Rides (Hours after departure time)</label>
              <input
                type="number"
                min="1"
                max="48"
                className="input-control"
                value={settings.auto_expire_hours_after_departure}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    auto_expire_hours_after_departure: parseInt(e.target.value) || 2,
                  })
                }
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 24px' }}>
              <input
                type="checkbox"
                id="maintMode"
                checked={settings.maintenance_mode}
                onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.checked })}
              />
              <label htmlFor="maintMode" style={{ fontSize: 13, color: '#fff', cursor: 'pointer' }}>
                Activate Maintenance Mode (Freezes new bookings on mobile APK)
              </label>
            </div>

            <button type="submit" disabled={saving} className="btn btn-primary" style={{ width: '100%' }}>
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save Platform Policies'}</span>
            </button>
          </form>
        </div>

        {/* System Diagnostics & Maintenance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  <Wrench size={18} style={{ color: 'var(--accent-cyan)' }} />
                  <span>Maintenance Operations</span>
                </h3>
                <p className="card-subtitle">Automated hygiene sweeps for rides & seat allocations</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff' }}>Clean Expired Rides</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Marks departed rides past schedule as expired
                  </div>
                </div>
                <button
                  onClick={handleRunCleanup}
                  disabled={actionLoading === 'cleanup'}
                  className="btn btn-secondary btn-sm"
                >
                  <RefreshCw size={13} className={actionLoading === 'cleanup' ? 'animate-spin' : ''} />
                  <span>Execute</span>
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff' }}>Fix Seat Inconsistencies</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Re-calculates open seats from database bookings
                  </div>
                </div>
                <button
                  onClick={handleFixSeats}
                  disabled={actionLoading === 'fixSeats'}
                  className="btn btn-secondary btn-sm"
                >
                  <RefreshCw size={13} className={actionLoading === 'fixSeats' ? 'animate-spin' : ''} />
                  <span>Reconcile</span>
                </button>
              </div>
            </div>
          </div>

          {/* Security & Access Guard */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  <Shield size={18} style={{ color: 'var(--brand-primary)' }} />
                  <span>Super Admin Key Credentials</span>
                </h3>
                <p className="card-subtitle">Local storage credentials & API authentication signature</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--accent-cyan)',
                  wordBreak: 'break-all',
                }}
              >
                Key: {currentKey}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                ✅ Header: <code style={{ color: 'var(--brand-primary)' }}>X-Admin-Key</code> attached to all requests.
                <br />
                ✅ Mobile APK Super Admin entry point has been segregated exclusively to this Web Control Center.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
