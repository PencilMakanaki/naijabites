import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { Field, PasswordField } from '../components/Field.jsx';
import { ApiError } from '../lib/api.js';
import { useRegister } from '../lib/account.js';
import { hasErrors, validateRegister } from '../lib/forms.js';
import '../components/auth.css';

export function SignUp() {
  const navigate = useNavigate();
  const register = useRegister();
  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [clientErrors, setClientErrors] = useState({});

  const apiError = register.error instanceof ApiError ? register.error : null;
  const errors = { ...(apiError?.fields ?? {}), ...clientErrors };
  if (apiError?.code === 'email_taken') errors.email = apiError.message;
  const generalMessage = apiError && !apiError.fields && apiError.code !== 'email_taken' ? apiError.message : null;

  const set = (key) => (event) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    setClientErrors((e) => ({ ...e, [key]: undefined }));
  };

  function onSubmit(event) {
    event.preventDefault();
    const problems = validateRegister(values);
    setClientErrors(problems);
    if (hasErrors(problems)) return;
    register.mutate(
      { name: values.name, email: values.email, ...(values.phone.trim() ? { phone: values.phone } : {}), password: values.password },
      { onSuccess: () => navigate('/', { replace: true }) },
    );
  }

  return (
    <main className="signup">
      <section className="signup__pitch" aria-label="Why join NaijaBites">
        <p className="eyebrow">Good food. Good people.</p>
        <h1 className="signup__title">Your next favourite meal is closer than you think.</h1>
        <p className="signup__text">Create an account to keep your food discoveries, cart and orders together.</p>
        <ul className="signup__list">
          <li><span className="signup__tick" aria-hidden="true">&#10003;</span>Explore local food spots</li>
          <li><span className="signup__tick" aria-hidden="true">&#10003;</span>Keep track of your cart</li>
          <li><span className="signup__tick" aria-hidden="true">&#10003;</span>Join the NaijaBites food community</li>
        </ul>
        <div className="signup__tiles" aria-hidden="true">
          <span className="signup__tile">{'\u{1F372}'}</span>
          <span className="signup__tile">{'\u{1F950}'}</span>
          <span className="signup__tile">{'\u{1F35A}'}</span>
        </div>
      </section>

      <section className="auth-card" aria-labelledby="signup-title">
        <p className="eyebrow">Join NaijaBites</p>
        <h1 id="signup-title">Create your account</h1>
        <p className="auth-card__sub">It only takes a minute.</p>
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <Field label="Full name" name="name" autoComplete="name" placeholder="e.g. Ada Okafor"
            value={values.name} onChange={set('name')} error={errors.name} />
          <Field label="Email address" type="email" name="email" autoComplete="email" inputMode="email"
            placeholder="you@example.com" value={values.email} onChange={set('email')} error={errors.email} />
          <Field label="Phone number (optional)" type="tel" name="phone" autoComplete="tel" inputMode="tel"
            placeholder="+234 800 000 0000" value={values.phone} onChange={set('phone')} error={errors.phone} />
          <PasswordField label="Password" name="password" autoComplete="new-password" placeholder="Create a strong password"
            hint="Use 8+ characters with uppercase, lowercase, a number and a symbol."
            value={values.password} onChange={set('password')} error={errors.password} />
          <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" placeholder="Enter your password again"
            value={values.confirm} onChange={set('confirm')} error={errors.confirm} />
          {generalMessage ? <p className="form-error" role="alert">{generalMessage}</p> : null}
          <Button type="submit" size="lg" className="btn--block" disabled={register.isPending}>
            {register.isPending ? 'Creating your account…' : 'Create account \u2192'}
          </Button>
        </form>
        <p className="auth-card__foot">Already have an account? <Link to="/signin">Sign in</Link></p>
      </section>
    </main>
  );
}
