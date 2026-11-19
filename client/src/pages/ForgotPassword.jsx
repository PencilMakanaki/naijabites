import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { Field } from '../components/Field.jsx';
import { ApiError } from '../lib/api.js';
import { useForgotPassword } from '../lib/account.js';
import { hasErrors, validateEmailOnly } from '../lib/forms.js';
import '../components/auth.css';

export function ForgotPassword() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});

  function onSubmit(event) {
    event.preventDefault();
    const problems = validateEmailOnly({ email });
    setErrors(problems);
    if (!hasErrors(problems)) forgot.mutate(email);
  }

  return (
    <main className="auth-card-wrap">
      <section className="auth-card" aria-labelledby="forgot-title">
        <p className="eyebrow">Account help</p>
        <h1 id="forgot-title">Forgot your password?</h1>
        <p className="auth-card__sub">Enter your email and we will send you a link to choose a new one.</p>
        {forgot.isSuccess ? (
          <>
            <p className="notice" role="status">If an account exists for that email, we have sent a link. It works for one hour.</p>
            <p className="auth-card__foot"><Link to="/signin">Back to sign in</Link></p>
          </>
        ) : (
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <Field label="Email address" type="email" name="email" autoComplete="email" inputMode="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
            {forgot.error instanceof ApiError ? <p className="form-error" role="alert">{forgot.error.message}</p> : null}
            <Button type="submit" size="lg" className="btn--block" disabled={forgot.isPending}>
              {forgot.isPending ? 'Sending…' : 'Send the link'}
            </Button>
            <p className="auth-card__foot"><Link to="/signin">Back to sign in</Link></p>
          </form>
        )}
      </section>
    </main>
  );
}
