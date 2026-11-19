import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { ApiError } from '../lib/api.js';
import { getErrorMessage } from '../lib/forms.js';
import { useSession } from '../lib/session.js';
import { useApplyAsVendor, useUploadVendorDocument, useVendorApplication } from '../lib/vendorApplication.js';
import './pages.css';
import './vendor-register.css';

const DOCUMENTS = [
  { type: 'business_registration', label: 'Business registration document', hint: 'For example a CAC certificate, a business name registration, or a valid trade or food-handling permit.' },
  { type: 'government_id', label: 'Owner\u2019s government ID', hint: 'National ID, driver\u2019s licence, international passport or voter\u2019s card.' },
];
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 5 * 1024 * 1024;
const EMPTY = { businessName: '', contactName: '', contactPhone: '', description: '', addressLine: '', area: '', city: 'Lagos', state: 'Lagos' };

const firstProblem = (error) => (error instanceof ApiError && error.fields ? Object.values(error.fields)[0] : getErrorMessage(error));
const fileSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function Message({ title, children }) {
  return <main className="page message vendor-register"><h1>{title}</h1><div className="muted">{children}</div></main>;
}

function ApplicationForm({ rejection, onDone }) {
  const apply = useApplyAsVendor();
  const [values, setValues] = useState(EMPTY);
  const [problem, setProblem] = useState('');
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setProblem('');
    try { await apply.mutateAsync({ ...values, description: values.description.trim() || null }); onDone?.(); }
    catch (error) { setProblem(firstProblem(error)); }
  }

  return (
    <main className="page vendor-register">
      <p className="eyebrow">Sell on NaijaBites</p>
      <h1>Register your food business</h1>
      <p className="muted">Tell us about your business, then upload two documents. An administrator checks them before your products can appear in the store.</p>
      {rejection && <p className="vendor-register__alert" role="alert">Your last application was not approved: {rejection}. You can apply again below.</p>}
      <form className="vendor-register__form" onSubmit={submit}>
        <label>Business name<input required minLength="2" maxLength="120" value={values.businessName} onChange={set('businessName')} placeholder="e.g. Mama Put Kitchen" /></label>
        <label>Contact person<input required minLength="2" maxLength="80" value={values.contactName} onChange={set('contactName')} /></label>
        <label>Contact phone<input required inputMode="tel" value={values.contactPhone} onChange={set('contactPhone')} placeholder="08012345678" /></label>
        <label className="vendor-register__wide">About your business (optional)<textarea rows="3" maxLength="1000" value={values.description} onChange={set('description')} /></label>
        <label className="vendor-register__wide">Street address of your kitchen or shop<input required minLength="5" maxLength="200" value={values.addressLine} onChange={set('addressLine')} /></label>
        <label>Area<input required minLength="2" maxLength="80" value={values.area} onChange={set('area')} placeholder="e.g. Ikeja" /></label>
        <label>City<input required minLength="2" maxLength="80" value={values.city} onChange={set('city')} /></label>
        <label>State<input required minLength="2" maxLength="80" value={values.state} onChange={set('state')} /></label>
        {problem && <p className="vendor-register__error vendor-register__wide" role="alert">{problem}</p>}
        <div className="vendor-register__wide"><Button type="submit" disabled={apply.isPending}>{apply.isPending ? 'Submitting…' : 'Continue to documents'}</Button></div>
      </form>
    </main>
  );
}

function DocumentRow({ doc, uploaded }) {
  const upload = useUploadVendorDocument();
  const [problem, setProblem] = useState('');

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) { setProblem('Choose a PDF, JPG or PNG file.'); return; }
    if (file.size > MAX_BYTES) { setProblem('That file is over 5 MB. Choose a smaller one.'); return; }
    setProblem('');
    try { await upload.mutateAsync({ type: doc.type, file }); }
    catch (error) { setProblem(firstProblem(error)); }
  }

  return (
    <li className="vendor-register__doc">
      <div>
        <strong>{doc.label}</strong>
        <p className="muted">{doc.hint}</p>
        {uploaded ? <p className="vendor-register__ok">Received: {uploaded.name} ({fileSize(uploaded.sizeBytes)})</p> : <p className="vendor-register__todo">Not uploaded yet</p>}
        {problem && <p className="vendor-register__error" role="alert">{problem}</p>}
      </div>
      <label className="btn btn--secondary btn--md vendor-register__file">
        {upload.isPending ? 'Uploading…' : uploaded ? 'Replace file' : 'Choose file'}
        <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={pick} disabled={upload.isPending} hidden />
      </label>
    </li>
  );
}

export function VendorRegister() {
  const session = useSession();
  const user = session.data?.user;
  const area = session.data?.area;
  const application = useVendorApplication(Boolean(user));
  const [reapply, setReapply] = useState(false);

  if (session.isLoading) return <Message title="One moment…">Checking your sign-in.</Message>;

  if (!user) {
    return (
      <Message title="Sell on NaijaBites">
        <p>Create a customer account or sign in, then come back to register your food business.</p>
        <p className="vendor-register__links">
          <Link className="btn btn--primary btn--md" to="/signup">Create an account</Link>{' '}
          <Link className="btn btn--secondary btn--md" to="/signin?from=%2Fvendor%2Fregister">Sign in</Link>
        </p>
      </Message>
    );
  }
  if (area === 'vendor') return <Message title="You already have a vendor account"><Link to="/vendor">Go to your vendor dashboard</Link></Message>;
  if (area !== 'customer') return <Message title="Use a customer account">Sign out and sign in with a customer account to apply. <Link to="/">Back to NaijaBites</Link></Message>;

  if (application.isLoading) return <Message title="One moment…">Loading your application.</Message>;
  if (application.isError) return <Message title="We could not load your application">Refresh the page, or try again in a moment.</Message>;

  const app = application.data;
  if (!app || (app.status === 'rejected' && reapply)) return <ApplicationForm rejection={app?.rejectionReason} onDone={() => setReapply(false)} />;

  if (app.status === 'rejected') {
    return (
      <Message title="Your application was not approved">
        <p>{app.rejectionReason || 'No reason was given.'}</p>
        <p><Button onClick={() => setReapply(true)}>Apply again</Button></p>
      </Message>
    );
  }
  if (app.status === 'approved') {
    return (
      <Message title="You are approved to sell">
        <p>{app.businessName} is approved. Sign in to the vendor area to add your products.</p>
        <p><Link className="btn btn--primary btn--md" to="/signin?area=vendor&from=%2Fvendor%2Fproducts">Vendor sign in</Link></p>
      </Message>
    );
  }
  if (app.status === 'suspended') return <Message title="Your vendor account is suspended">Please contact NaijaBites support.</Message>;

  const complete = app.missingDocuments.length === 0;
  return (
    <main className="page vendor-register">
      <p className="eyebrow">Sell on NaijaBites</p>
      <h1>{app.businessName}</h1>
      <p className={complete ? 'vendor-register__ok' : 'muted'} role="status">
        {complete ? 'Both documents are received. An administrator will review your application. Come back to this page to see the decision.' : 'Upload both documents to complete your application. PDF, JPG or PNG, up to 5 MB each.'}
      </p>
      <ul className="vendor-register__docs">
        {DOCUMENTS.map((doc) => <DocumentRow key={doc.type} doc={doc} uploaded={app.documents.find((d) => d.type === doc.type)} />)}
      </ul>
      <p className="muted">Status: pending review</p>
    </main>
  );
}
