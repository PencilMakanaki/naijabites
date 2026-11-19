import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../lib/api.js';
import { useConfirmEmailChange, useVerifyEmail } from '../lib/account.js';
import '../components/auth.css';

function TokenResult({ useAction, working, done, retryHint }) {
  const { token } = useParams();
  const action = useAction();
  const started = useRef(false);

  // The link can be used only once, so run it exactly once even in development's double render.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    action.mutate(token);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="auth-card-wrap">
      <section className="auth-card" aria-live="polite">
        {action.isSuccess ? (
          <>
            <h1>{done}</h1>
            <p className="auth-card__foot"><Link to="/" className="btn btn--primary btn--md">Continue to NaijaBites</Link></p>
          </>
        ) : action.isError ? (
          <>
            <h1>That link did not work</h1>
            <p className="auth-card__sub">{action.error instanceof ApiError ? action.error.message : 'Something went wrong.'}</p>
            <p className="auth-card__foot">{retryHint}</p>
          </>
        ) : (
          <h1>{working}</h1>
        )}
      </section>
    </main>
  );
}

export function VerifyEmail() {
  return (
    <TokenResult useAction={useVerifyEmail} working="Confirming your email…" done="Your email is confirmed"
      retryHint={<>Sign in and use <strong>Send the link again</strong> at the top of the page. <Link to="/signin">Sign in</Link></>} />
  );
}

export function ConfirmEmailChange() {
  return (
    <TokenResult useAction={useConfirmEmailChange} working="Confirming your new email…" done="Your email address was changed"
      retryHint={<>Sign in and start the change again from your <Link to="/account">account page</Link>.</>} />
  );
}
