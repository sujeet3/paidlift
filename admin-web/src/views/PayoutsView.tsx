import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  IndianRupee,
  Building,
  Smartphone,
  Check,
  X,
  FileText,
} from 'lucide-react';
import { AdminPayout } from '../types';
import { adminApi } from '../api';
import { Modal } from '../components/Modal';

interface PayoutsViewProps {
  onRefreshParent: () => void;
}

export const PayoutsView: React.FC<PayoutsViewProps> = ({ onRefreshParent }) => {
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Settlement Modal
  const [selectedPayout, setSelectedPayout] = useState<AdminPayout | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [txRef, setTxRef] = useState('');
  const [notes, setNotes] = useState('');

  const loadPayouts = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPayouts(statusFilter);
      setPayouts(res || []);
    } catch (err) {
      console.error('Failed to load payouts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayouts();
  }, [statusFilter]);

  const handleOpenAction = (payout: AdminPayout, action: 'approve' | 'reject') => {
    setSelectedPayout(payout);
    setActionType(action);
    setTxRef(`IMPS${Date.now().toString().slice(-8)}`);
    setNotes(action === 'approve' ? 'Settled via banking gateway IMPS/UPI' : 'Bank account / IFSC invalid');
  };

  const handleProcessSubmit = async () => {
    if (!selectedPayout) return;
    setActionLoading(selectedPayout.id);
    try {
      await adminApi.processPayout(selectedPayout.id, actionType, txRef, notes);
      alert(`Payout ${actionType === 'approve' ? 'settled and confirmed' : 'rejected and refunded to driver wallet'}.`);
      setSelectedPayout(null);
      await loadPayouts();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || 'Failed to process payout');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      {/* Tabs Filter */}
      <div className="tabs-header">
        <button
          className={`tab-btn ${statusFilter === 'pending' ? 'active' : ''}`}
          onClick={() => setStatusFilter('pending')}
        >
          Pending Settlement ({payouts.filter((p) => p.status === 'pending').length})
        </button>
        <button
          className={`tab-btn ${statusFilter === 'approved' ? 'active' : ''}`}
          onClick={() => setStatusFilter('approved')}
        >
          Settled / Approved
        </button>
        <button
          className={`tab-btn ${statusFilter === 'rejected' ? 'active' : ''}`}
          onClick={() => setStatusFilter('rejected')}
        >
          Rejected
        </button>
        <button
          className={`tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All Requests ({payouts.length})
        </button>
      </div>

      {/* Payouts Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Driver / Beneficiary</th>
                <th>Requested Amount</th>
                <th>Disbursement Destination</th>
                <th>Request Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Loading payouts ledger...</div>
                  </td>
                </tr>
              ) : payouts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '50px' }}>
                    <CreditCard size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>No payout requests</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                      {statusFilter === 'pending'
                        ? 'The driver payout queue is empty. All withdrawals settled.'
                        : 'No records found.'}
                    </div>
                  </td>
                </tr>
              ) : (
                payouts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 13.5 }}>
                        {p.driver_name || 'Driver'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                        {p.driver_phone || p.user_id}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                        ₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </td>

                    <td>
                      {p.upi_id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fff' }}>
                          <Smartphone size={14} style={{ color: 'var(--accent-cyan)' }} />
                          <span style={{ fontFamily: 'var(--font-mono)' }}>{p.upi_id}</span>
                        </div>
                      ) : p.bank_account ? (
                        <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                          <div style={{ fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Building size={13} style={{ color: 'var(--brand-primary)' }} />
                            <span>{p.bank_account.holder_name}</span>
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                            A/C: {p.bank_account.account_number}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            IFSC: {p.bank_account.ifsc}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Default Driver Wallet</span>
                      )}
                    </td>

                    <td>
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                        {new Date(p.created_at).toLocaleString()}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          p.status === 'approved'
                            ? 'badge-success'
                            : p.status === 'pending'
                            ? 'badge-warning'
                            : 'badge-danger'
                        }`}
                      >
                        {p.status}
                      </span>
                      {p.transaction_reference && (
                        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 3 }}>
                          Ref: {p.transaction_reference}
                        </div>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {p.status === 'pending' ? (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => handleOpenAction(p, 'approve')}
                            disabled={actionLoading === p.id}
                            className="btn btn-success btn-sm"
                            title="Approve and record IMPS settlement"
                          >
                            <Check size={14} />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleOpenAction(p, 'reject')}
                            disabled={actionLoading === p.id}
                            className="btn btn-danger-outline btn-sm"
                            title="Reject and refund back to driver wallet"
                          >
                            <X size={14} />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout Action Modal */}
      {selectedPayout && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedPayout(null)}
          title={`${actionType === 'approve' ? 'Approve & Settle Payout' : 'Reject Payout Request'}`}
          footer={
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setSelectedPayout(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleProcessSubmit}
                className={actionType === 'approve' ? 'btn btn-primary' : 'btn btn-danger'}
              >
                {actionType === 'approve' ? 'Confirm IMPS Settlement' : 'Confirm Rejection'}
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
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {selectedPayout.driver_name || 'Driver'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {selectedPayout.upi_id ? `UPI: ${selectedPayout.upi_id}` : `A/C: ${selectedPayout.bank_account?.account_number}`}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)' }}>
                ₹{selectedPayout.amount.toFixed(2)}
              </div>
            </div>

            {actionType === 'approve' ? (
              <div className="input-group">
                <label className="input-label">Bank IMPS / UPI Reference UTR Number</label>
                <input
                  type="text"
                  className="input-control"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  placeholder="e.g. 430198274910"
                />
              </div>
            ) : (
              <div className="input-group">
                <label className="input-label">Rejection Reason (refunded to driver wallet)</label>
                <input
                  type="text"
                  className="input-control"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Incorrect bank account number or IFSC"
                />
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Internal Audit Notes</label>
              <input
                type="text"
                className="input-control"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for financial logs"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
