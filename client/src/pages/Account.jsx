import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { Field, PasswordField } from '../components/Field.jsx';
import { ApiError } from '../lib/api.js';
import {
  useChangePassword, useRequestEmailChange, useResendVerification, useRevokeOtherSessions, useRevokeSession,
  useSessions, useUpdateProfile,
} from '../lib/account.js';
import { hasErrors, validateEmailOnly, validateNewPassword, validateProfile } from '../lib/forms.js';
import { useSession } from '../lib/session.js';
import '../components/auth.css';
import './account.css';

const apiFields = (error) => (error instanceof ApiError ? error.fields ?? {} : {});
const apiMessage = (error) => (error instanceof ApiError && !error.fields ? error.message : null);

function Section({ title, intro, children }) {
  return (
    <section className="account__section card">
      <h2>{title}</h2>
      {intro ? <p className="muted">{intro}</p> : null}
      {children}
    </section>
  );
}

function ProfileSection({ user }) {
  const update = useUpdateProfile();
  const [values, setValues] = useState({ name: user.name, phone: user.phone ?? '' });
  const [clientErrors, setClientErrors] = useState({});
  const errors = { ...apiFields(update.error), ...clientErrors };
  const onChange = (key) => (e) => { update.reset(); setValues((v) => ({ ...v, [key]: e.target.value })); setClientErrors((c) => ({ ...c, [key]: undefined })); };

  function onSubmit(event) {
    event.preventDefault();
    const problems = validateProfile(values);
    setClientErrors(problems);
    if (!hasErrors(problems)) update.mutate({ name: values.name, phone: values.phone });
  }
  return (
    <Section title="Your details">
      <form className="account__form" onSubmit={onSubmit} noValidate>
        <Field label="Full name" name="name" autoComplete="name" value={values.name} onChange={onChange('name')} error={errors.name} />
        <Field label="Phone number (optional)" type="tel" name="phone" autoComplete="tel" placeholder="+234 800 000 0000"
          value={values.phone} onChange={onChange('phone')} error={errors.phone} />
        {apiMessage(update.error) ? <p className="form-error" role="alert">{apiMessage(update.error)}</p> : null}
        {update.isSuccess ? <p className="notice" role="status">Saved.</p> : null}
        <Button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</Button>
      </form>
    </Section>
  );
}

function EmailSection({ user }) {
  const change = useRequestEmailChange();
  const resend = useResendVerification();
  const [values, setValues] = useState({ newEmail: '', password: '' });
  const [clientErrors, setClientErrors] = useState({});
  const errors = { ...apiFields(change.error), ...clientErrors };

  function onSubmit(event) {
    event.preventDefault();
    const problems = validateEmailOnly({ email: values.newEmail });
    const mapped = problems.email ? { newEmail: problems.email } : {};
    if (!values.password) mapped.password = 'Enter your password.';
    setClientErrors(mapped);
    if (!hasErrors(mapped)) change.mutate(values);
  }
  return (
    <Section title="Email address" intro={`Your email is ${user.email}.`}>
      <p className={user.emailVerified ? 'notice' : 'verify-note'}>
        {user.emailVerified ? 'Your email is confirmed.' : 'Your email is not confirmed yet.'}
        {!user.emailVerified ? (
          <>{' '}<button type="button" className="linklike" onClick={() => resend.mutate()} disabled={resend.isPending || resend.isSuccess}>
            {resend.isSuccess ? 'Link sent' : 'Send the link again'}
          </button></>
        ) : null}
      </p>
      {change.isSuccess ? (
        <p className="notice" role="status">We sent a confirmation link to your new address. Your email changes when you open it.</p>
      ) : (
        <form className="account__form" onSubmit={onSubmit} noValidate>
          <Field label="New email address" type="email" name="newEmail" autoComplete="email" inputMode="email"
            value={values.newEmail} onChange={(e) => { setValues((v) => ({ ...v, newEmail: e.target.value })); setClientErrors((c) => ({ ...c, newEmail: undefined })); }} error={errors.newEmail} />
          <PasswordField label="Your password" name="emailPassword" autoComplete="current-password"
            value={values.password} onChange={(e) => { setValues((v) => ({ ...v, password: e.target.value })); setClientErrors((c) => ({ ...c, password: undefined })); }} error={errors.password} />
          {apiMessage(change.error) ? <p className="form-error" role="alert">{apiMessage(change.error)}</p> : null}
          <Button type="submit" variant="outline" disabled={change.isPending}>{change.isPending ? 'Sending…' : 'Change email'}</Button>
        </form>
      )}
    </Section>
  );
}

function PasswordSection() {
  const change = useChangePassword();
  const [values, setValues] = useState({ currentPassword: '', password: '', confirm: '' });
  const [clientErrors, setClientErrors] = useState({});
  const serverFields = apiFields(change.error);
  const errors = {
    currentPassword: serverFields.currentPassword,
    password: serverFields.newPassword,
    ...clientErrors,
  };
  const onChange = (key) => (e) => { change.reset(); setValues((v) => ({ ...v, [key]: e.target.value })); setClientErrors((c) => ({ ...c, [key]: undefined })); };

  function onSubmit(event) {
    event.preventDefault();
    const problems = validateNewPassword({ password: values.password, confirm: values.confirm });
    if (!values.currentPassword) problems.currentPassword = 'Enter your current password.';
    setClientErrors(problems);
    if (!hasErrors(problems)) {
      change.mutate({ currentPassword: values.currentPassword, newPassword: values.password }, {
        onSuccess: () => setValues({ currentPassword: '', password: '', confirm: '' }),
      });
    }
  }
  return (
    <Section title="Password" intro="Changing your password signs you out on your other devices.">
      <form className="account__form" onSubmit={onSubmit} noValidate>
        <PasswordField label="Current password" name="currentPassword" autoComplete="current-password"
          value={values.currentPassword} onChange={onChange('currentPassword')} error={errors.currentPassword} />
        <PasswordField label="New password" name="password" autoComplete="new-password"
          hint="Use 8+ characters with uppercase, lowercase, a number and a symbol."
          value={values.password} onChange={onChange('password')} error={errors.password} />
        <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password"
          value={values.confirm} onChange={onChange('confirm')} error={errors.confirm} />
        {apiMessage(change.error) ? <p className="form-error" role="alert">{apiMessage(change.error)}</p> : null}
        {change.isSuccess ? <p className="notice" role="status">Your password was changed.</p> : null}
        <Button type="submit" disabled={change.isPending}>{change.isPending ? 'Saving…' : 'Change password'}</Button>
      </form>
    </Section>
  );
}

function DevicesSection() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current);
  const fmt = (value) => (value ? new Date(value).toLocaleString() : '');
  return (
    <Section title="Where you are signed in" intro="If you do not recognise a device, sign it out and change your password.">
      {sessions.isLoading ? <p className="muted">Loading…</p> : null}
      {sessions.isError ? <p className="form-error" role="alert">We could not load your devices.</p> : null}
      <ul className="devices">
        {list.map((s) => (
          <li key={s.id}>
            <div>
              <strong>{s.device}</strong>{s.current ? <span className="devices__tag">This device</span> : null}
              <p className="muted">Last active {fmt(s.lastSeenAt)}</p>
            </div>
            {!s.current ? <Button size="sm" variant="outline" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>Sign out</Button> : null}
          </li>
        ))}
      </ul>
      {others.length > 0 ? <Button variant="outline" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>Sign out all other devices</Button> : null}
    </Section>
  );
}

export function Account() {
  const { data } = useSession();
  const user = data?.user;
  if (!user) return null;
  return (
    <main className="page account">
      <p className="eyebrow">Your account</p>
      <h1>Hello, {user.name.split(' ')[0]}</h1>
      <p><Link className="account-address-link" to="/addresses">Manage delivery addresses →</Link></p>
      <div className="account__grid">
        <ProfileSection user={user} />
        <EmailSection user={user} />
        <PasswordSection />
        <DevicesSection />
      </div>
    </main>
  );
}
