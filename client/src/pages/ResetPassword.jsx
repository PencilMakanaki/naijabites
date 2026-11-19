import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { PasswordField } from '../components/Field.jsx';
import { ApiError } from '../lib/api.js';
import { useResetPassword } from '../lib/account.js';
import { hasErrors, validateNewPassword } from '../lib/forms.js';
import '../components/auth.css';

export function ResetPassword() {
  const { token } = useParams();
  const reset = useResetPassword();
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [clientErrors, setClientErrors] = useState({});
  const apiError = reset.error instanceof ApiError ? reset.error : null;
  const errors = { ...(apiError?.fields?.password ? { password: apiError.fields.password } : {}), ...clientErrors };

  function onSubmit(event) {
    event.preventDefault();
    const problems = validateNewPassword(values);
    setClientErrors(problems);
    if (!hasErrors(problems)) reset.mutate({ token, password: values.password });
  }

  return (
    <main className="auth-card-wrap">
      <section className="auth-card" aria-labelledby="reset-title">
        <p className="eyebrow">Account help</p>
        <h1 id="reset-title">Choose a new password</h1>
        {reset.isSuccess ? (
          <>
            <p className="notice" role="status">Your password has been changed. You were signed out everywhere, so please sign in again.</p>
            <p className="auth-card__foot"><Link to="/signin" className="btn btn--primary btn--md">Sign in</Link></p>
          </>
        ) : (
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <PasswordField label="New password" name="password" autoComplete="new-password" placeholder="Create a strong password"
              hint="Use 8+ characters with uppercase, lowercase, a number and a symbol."
              value={values.password} onChange={(e) => { setValues((v) => ({ ...v, password: e.target.value })); setClientErrors((c) => ({ ...c, password: undefined })); }}
              error={errors.password} />
            <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" placeholder="Enter it again"
              value={values.confirm} onChange={(e) => { setValues((v) => ({ ...v, confirm: e.target.value })); setClientErrors((c) => ({ ...c, confirm: undefined })); }}
              error={errors.confirm} />
            {apiError && !apiError.fields ? (
              <p className="form-error" role="alert">
                {apiError.message} <Link to="/forgot-password">Request a new link</Link>
              </p>
            ) : null}
            <Button type="submit" size="lg" className="btn--block" disabled={reset.isPending}>
              {reset.isPending ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
