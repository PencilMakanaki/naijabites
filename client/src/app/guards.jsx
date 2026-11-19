import { Link, Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session.js';
import '../pages/pages.css';

function PageMessage({ title, children }) {
  return (
    <main className="page message">
      <h1>{title}</h1>
      <p className="muted">{children}</p>
    </main>
  );
}

/** Sends visitors to sign in, and brings them back afterwards. The server enforces access regardless. */
export function RequireRole({ role, children }) {
  const session = useSession();
  const location = useLocation();
  if (session.isLoading) return <PageMessage title="One moment…">Checking your sign-in.</PageMessage>;
  if (session.isError) return <PageMessage title="We could not check your sign-in">Refresh the page, or try again in a moment.</PageMessage>;
  const current = session.data;
  if (!current) {
    return <Navigate to={`/signin?area=${role}&from=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (current.area !== role || !current.user.roles.includes(role)) {
    return (
      <PageMessage title="You do not have access to this page">
        <Link to="/">Back to NaijaBites</Link>
      </PageMessage>
    );
  }
  return children;
}
