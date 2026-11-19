import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { Field, PasswordField } from '../components/Field.jsx';
import { Modal } from '../components/Modal.jsx';
import { ApiError } from '../lib/api.js';
import { safeReturnPath, useLogin } from '../lib/session.js';

const AREAS = {
  customer: { eyebrow: 'Welcome back', title: 'Sign in to NaijaBites', intro: 'Manage your cart, orders and profile.', home: '/' },
  admin: { eyebrow: 'Staff sign-in', title: 'Sign in to NaijaBites Admin', intro: 'For NaijaBites administrators only.', home: '/admin' },
  vendor: { eyebrow: 'Vendor sign-in', title: 'Sign in to NaijaBites Vendor', intro: 'Manage your products and orders.', home: '/vendor' },
  rider: { eyebrow: 'Delivery partner', title: 'Sign in to NaijaBites Rider', intro: 'Access your assigned deliveries.', home: '/rider/deliveries' },
};

export function SignIn() {
  const [params] = useSearchParams();
  const area = AREAS[params.get('area')] ? params.get('area') : 'customer';
  const copy = AREAS[area];
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const error = login.error instanceof ApiError ? login.error : null;
  const fields = error?.fields ?? {};
  const generalMessage = error && !error.fields ? error.message : error && error.fields?._ ? error.fields._ : null;

  function onSubmit(event) {
    event.preventDefault();
    login.mutate(
      { email, password, area },
      { onSuccess: () => navigate(safeReturnPath(params.get('from'), copy.home), { replace: true }) },
    );
  }

  return (
    <Modal eyebrow={copy.eyebrow} title={copy.title} onClose={() => navigate('/', { replace: true })}>
      <p className="modal__intro">{copy.intro}</p>
      <form className="modal__form" onSubmit={onSubmit} noValidate>
        <Field label="Email address" type="email" name="email" autoComplete="email" inputMode="email"
          placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
          error={fields.email} data-autofocus />
        <PasswordField label="Password" name="password" autoComplete="current-password"
          placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)}
          error={fields.password} />
        {area === 'customer' ? <Link to="/forgot-password" className="modal__link">Forgot your password?</Link> : null}
        {generalMessage ? <p className="form-error" role="alert">{generalMessage}</p> : null}
        <Button type="submit" size="lg" className="btn--block" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>
      {area === 'customer' ? <p className="modal__note">New to NaijaBites? <Link to="/signup"><strong>Sign up</strong></Link></p> : null}
    </Modal>
  );
}
