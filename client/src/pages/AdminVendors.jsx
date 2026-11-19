import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import './pages.css';

const FILTERS = ['pending', 'approved', 'rejected', 'suspended', 'all'];
const DOCUMENT_LABELS = { business_registration: 'Business registration document', government_id: 'Owner\u2019s government ID' };
const fileSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function AdminVendors() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');
  const vendors = useQuery({ queryKey: ['admin', 'vendors', status], queryFn: () => api.get(`/admin/vendors?status=${status}`) });
  const decision = useMutation({
    mutationFn: ({ id, decision: choice, reason }) => api.post(`/admin/vendors/${id}/decision`, { decision: choice, reason }),
    onSuccess: () => { setError(''); queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] }); },
    onError: (e) => setError(e.fields ? Object.values(e.fields)[0] : e.message),
  });

  function startReject(id) {
    setError('');
    setReason('');
    setRejectingId(id);
  }
  function confirmReject(id) {
    decision.mutate({ id, decision: 'reject', reason: reason.trim() }, { onSuccess: () => setRejectingId(null) });
  }
  function suspend(id) {
    const note = window.prompt('Reason for suspension (optional). Press Cancel to keep the vendor active:');
    if (note === null) return;
    decision.mutate({ id, decision: 'suspend', reason: note });
  }

  return (
    <main className="page admin-home">
      <p className="eyebrow">Vendor verification</p>
      <h1>Vendor applications</h1>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((s) => (
          <button key={s} className="btn btn--outline btn--sm" aria-pressed={s === status} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      {error && !rejectingId && <p role="alert">{error}</p>}
      <section className="card" style={{ display: 'grid', gap: 14, marginTop: 14 }}>
        {vendors.isLoading ? <p>Loading applications…</p>
          : vendors.isError ? <p>{vendors.error.message}</p>
          : vendors.data.length === 0 ? <p>No vendor records found.</p>
          : vendors.data.map((v) => {
            const complete = Object.keys(DOCUMENT_LABELS).every((type) => v.documents.some((d) => d.type === type));
            return (
              <article key={v.id} style={{ borderBottom: '1px solid #ddd', paddingBottom: 12 }}>
                <h2>{v.businessName}</h2>
                <p>{v.contactName} · {v.contactEmail} · {v.contactPhone}</p>
                <p>{v.address}</p>
                {v.description && <p className="muted">{v.description}</p>}
                <p>Status: <strong>{v.status}</strong></p>
                {v.rejectionReason && <p>Reason: {v.rejectionReason}</p>}
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
                  {Object.entries(DOCUMENT_LABELS).map(([type, label]) => {
                    const doc = v.documents.find((d) => d.type === type);
                    return (
                      <li key={type}>
                        {label}:{' '}
                        {doc
                          ? <a href={`/api/v1/admin/vendors/${v.id}/documents/${type}`} target="_blank" rel="noreferrer">Open {doc.name} ({fileSize(doc.sizeBytes)})</a>
                          : <span className="muted">not uploaded</span>}
                      </li>
                    );
                  })}
                </ul>
                {v.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn--primary btn--sm" disabled={decision.isPending || !complete} onClick={() => decision.mutate({ id: v.id, decision: 'approve' })}>Approve</button>
                    <button className="btn btn--outline btn--sm" disabled={decision.isPending} onClick={() => startReject(v.id)}>Reject</button>
                    {!complete && <span className="muted">Approval unlocks when both documents are uploaded.</span>}
                  </div>
                )}
                {v.status === 'pending' && rejectingId === v.id && (
                  <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                    <label style={{ display: 'grid', gap: 4 }}>
                      Reason for rejection (the applicant will see this, at least 5 characters)
                      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength="500" autoFocus placeholder="e.g. The certificate is blurry, please upload a clearer copy" />
                    </label>
                    {error && <p role="alert" style={{ margin: 0, color: '#b3261e' }}>{error}</p>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn--primary btn--sm" disabled={decision.isPending || reason.trim().length < 5} onClick={() => confirmReject(v.id)}>{decision.isPending ? 'Rejecting…' : 'Confirm rejection'}</button>
                      <button className="btn btn--outline btn--sm" disabled={decision.isPending} onClick={() => setRejectingId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
                {v.status === 'approved' && <button className="btn btn--outline btn--sm" disabled={decision.isPending} onClick={() => suspend(v.id)}>Suspend</button>}
                {v.status === 'suspended' && <button className="btn btn--primary btn--sm" disabled={decision.isPending} onClick={() => decision.mutate({ id: v.id, decision: 'reactivate' })}>Reactivate</button>}
              </article>
            );
          })}
      </section>
      <p><Link to="/admin">Back to administration</Link></p>
    </main>
  );
}