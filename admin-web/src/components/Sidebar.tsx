import React from 'react';
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  Car,
  Ticket,
  CreditCard,
  AlertTriangle,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';

export type ActiveTab =
  | 'overview'
  | 'vehicles'
  | 'users'
  | 'rides'
  | 'bookings'
  | 'payouts'
  | 'sos'
  | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  pendingKycCount: number;
  openSosCount: number;
  pendingPayoutsCount: number;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingKycCount,
  openSosCount,
  pendingPayoutsCount,
  onLogout,
}) => {
  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="sidebar-logo-icon">🚗</div>
        <div>
          <div className="sidebar-brand-title">PAID LIFT</div>
          <span className="sidebar-brand-badge">Super Admin</span>
        </div>
      </div>

      {/* Nav Items */}
      <div className="sidebar-nav">
        <div className="nav-section-title">Operations</div>

        <div
          className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <div className="nav-item-left">
            <LayoutDashboard size={18} className="nav-icon" />
            <span>Overview & KPIs</span>
          </div>
        </div>

        <div
          className={`nav-item ${activeTab === 'vehicles' ? 'active' : ''}`}
          onClick={() => setActiveTab('vehicles')}
        >
          <div className="nav-item-left">
            <ShieldCheck size={18} className="nav-icon" />
            <span>Vehicle KYC Studio</span>
          </div>
          {pendingKycCount > 0 && (
            <span className="nav-badge warning">{pendingKycCount}</span>
          )}
        </div>

        <div
          className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <div className="nav-item-left">
            <Users size={18} className="nav-icon" />
            <span>Users & Wallets</span>
          </div>
        </div>

        <div
          className={`nav-item ${activeTab === 'rides' ? 'active' : ''}`}
          onClick={() => setActiveTab('rides')}
        >
          <div className="nav-item-left">
            <Car size={18} className="nav-icon" />
            <span>Rides & Corridors</span>
          </div>
        </div>

        <div
          className={`nav-item ${activeTab === 'bookings' ? 'active' : ''}`}
          onClick={() => setActiveTab('bookings')}
        >
          <div className="nav-item-left">
            <Ticket size={18} className="nav-icon" />
            <span>Bookings & Refunds</span>
          </div>
        </div>

        <div className="nav-section-title">Finance & Safety</div>

        <div
          className={`nav-item ${activeTab === 'payouts' ? 'active' : ''}`}
          onClick={() => setActiveTab('payouts')}
        >
          <div className="nav-item-left">
            <CreditCard size={18} className="nav-icon" />
            <span>Driver Payouts</span>
          </div>
          {pendingPayoutsCount > 0 && (
            <span className="nav-badge warning">{pendingPayoutsCount}</span>
          )}
        </div>

        <div
          className={`nav-item ${activeTab === 'sos' ? 'active' : ''}`}
          onClick={() => setActiveTab('sos')}
        >
          <div className="nav-item-left">
            <AlertTriangle size={18} className="nav-icon" />
            <span>Emergency SOS</span>
          </div>
          {openSosCount > 0 && (
            <span className="nav-badge danger">{openSosCount} NEW</span>
          )}
        </div>

        <div className="nav-section-title">Platform</div>

        <div
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <div className="nav-item-left">
            <Settings size={18} className="nav-icon" />
            <span>Maintenance & Config</span>
          </div>
        </div>
      </div>

      {/* Footer / User Profile */}
      <div className="sidebar-footer">
        <div className="admin-user-card">
          <div className="admin-user-info">
            <div className="admin-avatar">SA</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Super Admin</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Full Access</div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="btn-icon"
            title="Sign out from Super Admin"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};
