import { useResendVerification } from '../lib/account.js';
import { useSession } from '../lib/session.js';
import './auth.css';

/** A reminder shown under the top bar until the person confirms their email address. */
export function VerifyBanner() {
  const { data } = useSession();
  const resend = useResendVerification();
  const user = data?.user;
  if (!user || user.emailVerified || data.area !== 'customer') return null;
  return (
    <div className="verify-banner" role="status">
      <p>
        Please confirm your email address. We sent a link to <strong>{user.email}</strong>.
      </p>
      {resend.isSuccess ? <p><strong>Sent. Check your inbox and spam folder.</strong></p> : (
        <button type="button" className="verify-banner__action" onClick={() => resend.mutate()} disabled={resend.isPending}>
          {resend.isPending ? 'Sending…' : 'Send the link again'}
        </button>
      )}
      {resend.isError ? <p className="verify-banner__error">{resend.error.message}</p> : null}
    </div>
  );
}
