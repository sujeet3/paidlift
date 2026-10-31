import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewView } from './views/OverviewView';
import { VehiclesKycView } from './views/VehiclesKycView';
import { UsersView } from './views/UsersView';
import { RidesView } from './views/RidesView';
import { BookingsView } from './views/BookingsView';
import { PayoutsView } from './views/PayoutsView';
import { SosView } from './views/SosView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { AdminStats } from './types';
import { adminApi, clearStoredAdminKey, getStoredAdminKey } from './api';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(true);

  // Check auth on boot
  useEffect(() => {
    const checkAuth = async () => {
      const key = getStoredAdminKey();
      if (!key) {
        setIsAuthenticated(false);
        setCheckingAuth(false);
        return;
      }
      try {
        const ok = await adminApi.verifyAuth();
        setIsAuthenticated(ok);
      } catch {
        // If local dev or offline, fallback
        setIsAuthenticated(true);
      } finally {
        setCheckingAuth(false);
      }
    };
    checkAuth();
  }, []);

  const loadStats = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await adminApi.getStats();
      setStats(data);
      setIsBackendOnline(true);
    } catch (err: any) {
      console.warn('Backend fetch error:', err.message);
      setIsBackendOnline(false);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadStats();
      const interval = setInterval(loadStats, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, loadStats]);

  const handleLogout = () => {
    clearStoredAdminKey();
    setIsAuthenticated(false);
  };

  if (checkingAuth) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
          color: 'var(--text-muted)',
          fontSize: 14,
        }}
      >
        Verifying Super Admin session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onSuccess={() => setIsAuthenticated(true)} />;
  }

  const pendingKycCount = stats?.counts?.pending_vehicles || 0;
  const openSosCount = stats?.counts?.open_sos || 0;
  const pendingPayoutsCount = stats?.financials?.pending_payouts_inr ? 1 : 0;

  return (
    <div className="app-container">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingKycCount={pendingKycCount}
        openSosCount={openSosCount}
        pendingPayoutsCount={pendingPayoutsCount}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="main-content">
        <Header
          activeTab={activeTab}
          onRefresh={loadStats}
          loading={loading}
          isBackendOnline={isBackendOnline}
          serverTime={stats?.server_time}
        />

        <main className="page-body">
          {activeTab === 'overview' && (
            <OverviewView
              stats={stats}
              onNavigate={(tab) => setActiveTab(tab)}
              onRefresh={loadStats}
            />
          )}

          {activeTab === 'vehicles' && (
            <VehiclesKycView onRefreshParent={loadStats} />
          )}

          {activeTab === 'users' && (
            <UsersView onRefreshParent={loadStats} />
          )}

          {activeTab === 'rides' && (
            <RidesView onRefreshParent={loadStats} />
          )}

          {activeTab === 'bookings' && (
            <BookingsView onRefreshParent={loadStats} />
          )}

          {activeTab === 'payouts' && (
            <PayoutsView onRefreshParent={loadStats} />
          )}

          {activeTab === 'sos' && (
            <SosView onRefreshParent={loadStats} />
          )}

          {activeTab === 'settings' && (
            <SettingsView onRefreshParent={loadStats} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
