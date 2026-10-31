import React from 'react';
import { RefreshCw, Activity, Server, Clock } from 'lucide-react';
import { ActiveTab } from './Sidebar';

interface HeaderProps {
  activeTab: ActiveTab;
  onRefresh: () => void;
  loading: boolean;
  isBackendOnline: boolean;
  serverTime?: string;
}

const titles: Record<ActiveTab, { title: string; subtitle: string }> = {
  overview: {
    title: 'Marketplace Operations & Revenue',
    subtitle: 'High-level telemetry, financial counters, and platform volume',
  },
  vehicles: {
    title: 'Vehicle & Driver KYC Studio',
    subtitle: 'Verify RC, Driving Licence, vehicle condition, and driver permits',
  },
  users: {
    title: 'User & Driver Accounts Management',
    subtitle: 'Manage user profiles, Aadhaar status, wallet credits, and suspensions',
  },
  rides: {
    title: 'Live Rides & Inter-City Corridors',
    subtitle: 'Real-time ride tracking, seat inventory, and safety force-cancellations',
  },
  bookings: {
    title: 'Passenger Bookings & Payment Transactions',
    subtitle: 'Complete trip transactions ledger, seat bookings, and force refunds',
  },
  payouts: {
    title: 'Driver Earnings & Withdrawal Requests',
    subtitle: 'Process and settle driver payouts via instant IMPS or UPI',
  },
  sos: {
    title: 'Emergency Response Radar (SOS)',
    subtitle: 'Real-time safety alarms, emergency dispatch, and incident resolution',
  },
  settings: {
    title: 'Platform Configuration & System Maintenance',
    subtitle: 'Dynamic marketplace commissions, expired rides sweep, and seat repair',
  },
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onRefresh,
  loading,
  isBackendOnline,
  serverTime,
}) => {
  const current = titles[activeTab] || titles.overview;

  return (
    <header className="top-header">
      <div className="header-left">
        <div className="header-title-box">
          <h1>{current.title}</h1>
          <p>{current.subtitle}</p>
        </div>
      </div>

      <div className="header-right">
        {/* Backend Status */}
        <div className="system-pill">
          <div className={`pulse-dot ${isBackendOnline ? '' : 'offline'}`} />
          <span>{isBackendOnline ? 'FastAPI Backend Online' : 'Backend Disconnected'}</span>
        </div>

        {/* Server Time */}
        {serverTime && (
          <div className="system-pill" style={{ display: 'none', lg: 'flex' } as any}>
            <Clock size={13} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {new Date(serverTime).toLocaleTimeString()}
            </span>
          </div>
        )}

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="btn btn-secondary btn-sm"
          title="Refresh All Data"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{
            animation: loading ? 'spin 1s linear infinite' : 'none',
          }} />
          <span>Refresh</span>
        </button>
      </div>
      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  );
};
