import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  Ban,
  CheckCircle,
  Eye,
  Trash2,
  Phone,
  Mail,
  Car,
  Ticket,
} from 'lucide-react';
import { AdminUser } from '../types';
import { adminApi } from '../api';
import { Modal } from '../components/Modal';

interface UsersViewProps {
  onRefreshParent: () => void;
}

export const UsersView: React.FC<UsersViewProps> = ({ onRefreshParent }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userDetails, setUserDetails] = useState<any | null>(null);
  const [walletModalUser, setWalletModalUser] = useState<AdminUser | null>(null);
  const [walletAmount, setWalletAmount] = useState('500');
  const [walletReason, setWalletReason] = useState('Admin test credit');
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    phone: '',
    email: '',
    role: 'passenger' as const,
    wallet_balance: 100,
    aadhaar_verified: false,
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getUsers({
        search: search.trim(),
        role: roleFilter,
        status: statusFilter,
        limit: 100,
      });
      setUsers(res.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, roleFilter, statusFilter]);

  const handleWalletSubmit = async () => {
    if (!walletModalUser) return;
    const delta = parseFloat(walletAmount);
    if (isNaN(delta) || delta === 0) {
      alert('Please enter a valid non-zero amount');
      return;
    }
    setActionLoading(walletModalUser.id);
    try {
      await adminApi.adjustWallet(walletModalUser.id, delta, walletReason);
      setWalletModalUser(null);
      await loadUsers();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust wallet balance');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleBan = async (user: AdminUser) => {
    const newStatus = user.status === 'banned' ? 'active' : 'banned';
    if (!confirm(`Are you sure you want to ${newStatus === 'banned' ? 'BAN' : 'UNBAN'} ${user.name || user.phone}?`)) {
      return;
    }
    setActionLoading(user.id);
    try {
      await adminApi.updateUser(user.id, { status: newStatus });
      await loadUsers();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAadhaar = async (user: AdminUser) => {
    const newVerified = !user.aadhaar_verified;
    setActionLoading(user.id);
    try {
      await adminApi.updateUser(user.id, { aadhaar_verified: newVerified });
      await loadUsers();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to update Aadhaar status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpen360 = async (user: AdminUser) => {
    setSelectedUser(user);
    setUserDetails(null);
    try {
      const details = await adminApi.getUserDetails(user.id);
      setUserDetails(details);
    } catch (err) {
      console.error('Failed to load user 360 details:', err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? All their rides and records will be impacted.')) {
      return;
    }
    setActionLoading(userId);
    try {
      await adminApi.deleteUser(userId);
      await loadUsers();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.phone.trim()) {
      alert('Phone number is required');
      return;
    }
    setActionLoading('create');
    try {
      await adminApi.createUser({
        name: newUser.name,
        phone: newUser.phone,
        email: newUser.email,
        role: newUser.role,
        wallet_balance: newUser.wallet_balance,
        aadhaar_verified: newUser.aadhaar_verified,
        status: 'active',
      });
      setCreateUserOpen(false);
      setNewUser({
        name: '',
        phone: '',
        email: '',
        role: 'passenger',
        wallet_balance: 100,
        aadhaar_verified: false,
      });
      await loadUsers();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to create user');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      {/* Top Filter and Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="input-control"
              placeholder="Search by name, phone, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="input-control"
            style={{ width: 'auto' }}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="passenger">Passenger</option>
            <option value="owner">Driver / Owner</option>
            <option value="both">Both (Driver & Passenger)</option>
            <option value="admin">Admin</option>
          </select>

          <select
            className="input-control"
            style={{ width: 'auto' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </div>

        <button onClick={() => setCreateUserOpen(true)} className="btn btn-primary">
          <Plus size={16} />
          <span>Add New User</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>User / Phone</th>
                <th>Role</th>
                <th>Aadhaar KYC</th>
                <th>Wallet Balance</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Searching registered users...</div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '50px' }}>
                    <Users size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No users found</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                      Try adjusting the search keyword or filter criteria.
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 'var(--radius-full)',
                            background: 'linear-gradient(135deg, var(--brand-primary), var(--accent-cyan))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            color: '#fff',
                            fontSize: 14,
                          }}
                        >
                          {(user.name || user.phone || 'U').slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>
                            {user.name || 'Unnamed User'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                            {user.phone}
                          </div>
                          {user.email && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          user.role === 'owner' || user.role === 'both' ? 'badge-info' : 'badge-muted'
                        }`}
                      >
                        {user.role === 'owner' ? 'Driver / Owner' : user.role}
                      </span>
                    </td>

                    <td>
                      <button
                        onClick={() => handleToggleAadhaar(user)}
                        disabled={actionLoading === user.id}
                        className="btn-ghost"
                        style={{ padding: '2px 6px', borderRadius: 6, cursor: 'pointer' }}
                        title="Click to toggle Aadhaar verification"
                      >
                        {user.aadhaar_verified ? (
                          <span className="badge badge-success">
                            <ShieldCheck size={12} /> Aadhaar Verified
                          </span>
                        ) : (
                          <span className="badge badge-warning">
                            <ShieldAlert size={12} /> Unverified
                          </span>
                        )}
                      </button>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 14,
                            fontWeight: 700,
                            color: user.wallet_balance > 0 ? 'var(--brand-primary)' : 'var(--text-muted)',
                          }}
                        >
                          ₹{(user.wallet_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <button
                          onClick={() => {
                            setWalletModalUser(user);
                            setWalletAmount('500');
                            setWalletReason('Admin promotion / test credit');
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          title="Credit or adjust wallet balance"
                        >
                          <Wallet size={12} /> Adjust
                        </button>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          user.status === 'active'
                            ? 'badge-success'
                            : user.status === 'banned'
                            ? 'badge-danger'
                            : 'badge-warning'
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => handleOpen360(user)}
                          className="btn btn-secondary btn-sm"
                          title="View 360° Profile & Rides"
                        >
                          <Eye size={13} />
                          <span>Profile</span>
                        </button>

                        <button
                          onClick={() => handleToggleBan(user)}
                          disabled={actionLoading === user.id}
                          className={user.status === 'banned' ? 'btn btn-success btn-sm' : 'btn btn-danger-outline btn-sm'}
                          title={user.status === 'banned' ? 'Unban user' : 'Ban user'}
                        >
                          <Ban size={13} />
                          <span>{user.status === 'banned' ? 'Unban' : 'Ban'}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={actionLoading === user.id}
                          className="btn-icon"
                          style={{ color: 'var(--text-muted)' }}
                          title="Delete user"
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

      {/* Adjust Wallet Modal */}
      {walletModalUser && (
        <Modal
          isOpen={true}
          onClose={() => setWalletModalUser(null)}
          title={`Adjust Wallet: ${walletModalUser.name || walletModalUser.phone}`}
          footer={
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setWalletModalUser(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleWalletSubmit} className="btn btn-primary">
                Update Wallet Balance
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: 'var(--bg-surface)',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Current Wallet Balance</span>
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fff' }}>
                ₹{(walletModalUser.wallet_balance || 0).toFixed(2)}
              </span>
            </div>

            <div className="input-group">
              <label className="input-label">Amount Delta (₹) [Use negative to deduct]</label>
              <input
                type="number"
                step="any"
                className="input-control"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
                placeholder="e.g. 500 or -200"
              />
            </div>

            <div className="input-group">
              <label className="input-label">Reason for Adjustment</label>
              <input
                type="text"
                className="input-control"
                value={walletReason}
                onChange={(e) => setWalletReason(e.target.value)}
                placeholder="Reason for audit log"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* 360° Profile Drawer Modal */}
      {selectedUser && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedUser(null)}
          title={`User 360°: ${selectedUser.name || 'User'} (${selectedUser.phone})`}
          maxWidth="750px"
          footer={
            <button onClick={() => setSelectedUser(null)} className="btn btn-secondary">
              Close Profile
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                background: 'var(--bg-surface)',
                padding: 16,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Phone</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-cyan)' }}>{selectedUser.phone}</div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Role</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{selectedUser.role}</div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Wallet</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                  ₹{(selectedUser.wallet_balance || 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Sub-sections */}
            {userDetails ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Car size={15} /> Registered Vehicles ({userDetails.vehicles?.length || 0})
                  </h4>
                  {userDetails.vehicles && userDetails.vehicles.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {userDetails.vehicles.map((v: any) => (
                        <div
                          key={v.id}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-input)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 13,
                          }}
                        >
                          <span>{v.make} {v.model} ({v.number_plate})</span>
                          <span className={`badge ${v.approved ? 'badge-success' : 'badge-warning'}`}>
                            {v.approved ? 'Approved' : 'Pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No registered vehicles.</div>
                  )}
                </div>

                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ticket size={15} /> Bookings Made ({userDetails.bookings?.length || 0})
                  </h4>
                  {userDetails.bookings && userDetails.bookings.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {userDetails.bookings.slice(0, 5).map((b: any) => (
                        <div
                          key={b.id}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-input)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 13,
                          }}
                        >
                          <span>Seats: {b.seats} (₹{b.total_fare})</span>
                          <span className="badge badge-info">{b.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No passenger bookings yet.</div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                Loading activity history...
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create User Modal */}
      {createUserOpen && (
        <Modal
          isOpen={true}
          onClose={() => setCreateUserOpen(false)}
          title="Add New Platform User"
          footer={
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCreateUserOpen(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleCreateUserSubmit} className="btn btn-primary">
                Create User
              </button>
            </div>
          }
        >
          <form onSubmit={handleCreateUserSubmit}>
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input
                type="text"
                className="input-control"
                placeholder="e.g. Ramesh Kumar"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Phone Number (10 Digits)</label>
              <input
                type="tel"
                required
                className="input-control"
                placeholder="e.g. 9876543210"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label className="input-label">Email Address (Optional)</label>
              <input
                type="email"
                className="input-control"
                placeholder="user@example.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <div className="input-group">
                <label className="input-label">Platform Role</label>
                <select
                  className="input-control"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
                >
                  <option value="passenger">Passenger</option>
                  <option value="owner">Driver / Owner</option>
                  <option value="both">Both</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Initial Wallet Balance (₹)</label>
                <input
                  type="number"
                  className="input-control"
                  value={newUser.wallet_balance}
                  onChange={(e) => setNewUser({ ...newUser, wallet_balance: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <input
                type="checkbox"
                id="aadhaarVer"
                checked={newUser.aadhaar_verified}
                onChange={(e) => setNewUser({ ...newUser, aadhaar_verified: e.target.checked })}
              />
              <label htmlFor="aadhaarVer" style={{ fontSize: 13, color: '#fff', cursor: 'pointer' }}>
                Pre-mark Aadhaar KYC as verified
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
