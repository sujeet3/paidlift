import React, { useState } from 'react';
import { Shield, Key, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { adminApi, DEFAULT_ADMIN_KEY } from '../api';

interface LoginViewProps {
  onSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [adminKey, setAdminKey] = useState(DEFAULT_ADMIN_KEY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey.trim()) {
      setError('Admin secret key is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await adminApi.login(adminKey.trim());
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify the secret key.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(circle at 50% 30%, rgba(16, 185, 129, 0.08) 0%, transparent 60%)',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '36px 32px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(15, 23, 42, 0.85)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 16px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, var(--brand-primary), #0284c7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px var(--brand-primary-glow)',
            }}
          >
            <Shield size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            PAID LIFT Super Admin
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Full Authority Marketplace Management & Telemetry
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--status-danger-bg)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label" htmlFor="adminKey">
              Super Admin Secret Key
            </label>
            <div style={{ position: 'relative' }}>
              <Key
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                id="adminKey"
                type="password"
                className="input-control"
                style={{ paddingLeft: 38, fontFamily: 'var(--font-mono)' }}
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Enter ADMIN_SECRET_KEY"
                autoComplete="current-password"
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '12px 0 24px',
            }}
          >
            <button
              type="button"
              onClick={() => setAdminKey(DEFAULT_ADMIN_KEY)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0,
              }}
            >
              <Sparkles size={12} />
              <span>Use Default Local Secret</span>
            </button>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Port :8001</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '14px' }}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Access Admin Portal</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div
          style={{
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '11.5px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          🔒 Restricted to authorized PaidLift platform super administrators. All IP addresses and actions are cryptographically signed.
        </div>
      </div>
    </div>
  );
};
