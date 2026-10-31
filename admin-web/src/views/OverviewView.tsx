import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  Car,
  Ticket,
  AlertTriangle,
  IndianRupee,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Wrench,
  ArrowRight,
  Flame,
} from 'lucide-react';
import { AdminStats } from '../types';
import { StatCard } from '../components/StatCard';
import { ActiveTab } from '../components/Sidebar';
import { adminApi } from '../api';

interface OverviewViewProps {
  stats: AdminStats | null;
  onNavigate: (tab: ActiveTab) => void;
  onRefresh: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  stats,
  onNavigate,
  onRefresh,
}) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCleanupExpired = async () => {
    setActionLoading('cleanup');
    setActionMessage(null);
    try {
      const res = await adminApi.cleanupExpiredRides();
      setActionMessage({
        type: 'success',
        text: `Cleaned up ${res.expired_rides_count} expired ride(s) past departure time.`,
      });
      onRefresh();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to cleanup rides.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleFixSeats = async () => {
    setActionLoading('fixSeats');
    setActionMessage(null);
    try {
      const res = await adminApi.fixSeatCounts();
      setActionMessage({
        type: 'success',
        text: `Reconciled seats: checked ${res.rides_checked} rides, fixed ${res.rides_reconciled} discrepancies.`,
      });
      onRefresh();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to fix seat counts.' });
    } finally {
      setActionLoading(null);
    }
  };

  const counts = stats?.counts || {
    users: 0,
    vehicles: 0,
    pending_vehicles: 0,
    active_rides: 0,
    total_rides: 0,
    bookings: 0,
    open_sos: 0,
  };

  const financials = stats?.financials || {
    total_gmv_inr: 0,
    platform_revenue_inr: 0,
    pending_payouts_inr: 0,
    currency: 'INR',
  };

  return (
    <div>
      {/* SOS Alert Banner */}
      {counts.open_sos > 0 && (
        <div className="sos-live-banner">
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
              <AlertTriangle size={24} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                🚨 {counts.open_sos} EMERGENCY SOS ALERT{counts.open_sos > 1 ? 'S' : ''} ACTIVE
              </div>
              <div style={{ fontSize: 13, color: '#fca5a5', marginTop: 2 }}>
                Passengers or drivers have triggered active emergency beacons requiring immediate response.
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('sos')}
            className="btn btn-danger"
            style={{ fontWeight: 700 }}
          >
            <span>Open SOS Radar</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Action Feedback Message */}
      {actionMessage && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            background: actionMessage.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-danger-bg)',
            border: `1px solid ${actionMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: actionMessage.type === 'success' ? 'var(--status-success)' : '#fca5a5',
            fontSize: '13.5px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          {actionMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="stats-grid">
        <StatCard
          label="Total Users"
          value={counts.users.toLocaleString()}
          subtext="Registered passengers & drivers"
          icon={Users}
          accentColor="var(--accent-cyan)"
          iconBg="rgba(56, 189, 248, 0.12)"
          onClick={() => onNavigate('users')}
        />
        <StatCard
          label="Active Vehicles"
          value={counts.vehicles.toLocaleString()}
          subtext={counts.pending_vehicles > 0 ? `⚠️ ${counts.pending_vehicles} pending approval` : 'All verified & active'}
          icon={Car}
          accentColor="var(--brand-primary)"
          iconBg="rgba(16, 185, 129, 0.12)"
          onClick={() => onNavigate('vehicles')}
        />
        <StatCard
          label="KYC Pending"
          value={counts.pending_vehicles.toLocaleString()}
          subtext="Awaiting RC & DL inspection"
          icon={ShieldCheck}
          accentColor="var(--status-warning)"
          iconBg="rgba(245, 158, 11, 0.12)"
          onClick={() => onNavigate('vehicles')}
        />
        <StatCard
          label="Active Rides"
          value={counts.active_rides.toLocaleString()}
          subtext={`Out of ${counts.total_rides} total created`}
          icon={Flame}
          accentColor="var(--accent-indigo)"
          iconBg="rgba(99, 102, 241, 0.12)"
          onClick={() => onNavigate('rides')}
        />
      </div>

      {/* Financial Metrics Grid */}
      <div className="stats-grid">
        <StatCard
          label="Total GMV (Gross Value)"
          value={`₹${financials.total_gmv_inr.toLocaleString('en-IN')}`}
          subtext="Total transaction volume across platform"
          icon={IndianRupee}
          accentColor="var(--brand-primary)"
          iconBg="rgba(16, 185, 129, 0.12)"
          onClick={() => onNavigate('bookings')}
        />
        <StatCard
          label="Platform Revenue"
          value={`₹${financials.platform_revenue_inr.toLocaleString('en-IN')}`}
          subtext="Commission earned by PaidLift (10%)"
          icon={TrendingUp}
          accentColor="#38bdf8"
          iconBg="rgba(56, 189, 248, 0.12)"
          onClick={() => onNavigate('settings')}
        />
        <StatCard
          label="Pending Payouts"
          value={`₹${financials.pending_payouts_inr.toLocaleString('en-IN')}`}
          subtext="Driver wallet withdrawal queue"
          icon={Clock}
          accentColor={financials.pending_payouts_inr > 0 ? 'var(--status-warning)' : 'var(--text-muted)'}
          iconBg="rgba(245, 158, 11, 0.12)"
          onClick={() => onNavigate('payouts')}
        />
        <StatCard
          label="Total Bookings"
          value={counts.bookings.toLocaleString()}
          subtext="Passenger seat reservations"
          icon={Ticket}
          accentColor="var(--accent-violet)"
          iconBg="rgba(139, 92, 246, 0.12)"
          onClick={() => onNavigate('bookings')}
        />
      </div>

      {/* Two Column Layout: Quick Actions & Financial Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px' }}>
        {/* Quick Operational Commands */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <Wrench size={18} style={{ color: 'var(--brand-primary)' }} />
                <span>Operational Commands & Maintenance</span>
              </h3>
              <p className="card-subtitle">One-click batch operations and automated marketplace hygiene</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                  Sweep Expired Past Rides
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                  Automatically closes rides whose departure time has passed 2+ hours ago
                </div>
              </div>
              <button
                onClick={handleCleanupExpired}
                disabled={actionLoading === 'cleanup'}
                className="btn btn-secondary btn-sm"
              >
                {actionLoading === 'cleanup' ? 'Cleaning...' : 'Run Sweep'}
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                  Reconcile Seat Inventory
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                  Audits all active ride seat allocations against confirmed bookings to prevent overbooking
                </div>
              </div>
              <button
                onClick={handleFixSeats}
                disabled={actionLoading === 'fixSeats'}
                className="btn btn-secondary btn-sm"
              >
                {actionLoading === 'fixSeats' ? 'Auditing...' : 'Reconcile'}
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                  Pending Driver KYC Verification
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                  {counts.pending_vehicles} driver vehicle(s) waiting for RC and DL approval
                </div>
              </div>
              <button
                onClick={() => onNavigate('vehicles')}
                className="btn btn-primary btn-sm"
              >
                <span>Inspect KYC ({counts.pending_vehicles})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Platform Ecosystem Health */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <ShieldCheck size={18} style={{ color: 'var(--accent-cyan)' }} />
                <span>Super Admin Platform Security</span>
              </h3>
              <p className="card-subtitle">Encrypted endpoints, role isolation, and database status</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>FastAPI Gateway</span>
              <span className="badge badge-success">Port 8001 Active</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>MongoDB Engine</span>
              <span className="badge badge-success">Connected (motor async)</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Mobile APK Super Access</span>
              <span className="badge badge-danger">Revoked (Isolated to Web)</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Commission Architecture</span>
              <span className="badge badge-info">10.0% Automatic Platform Cut</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
