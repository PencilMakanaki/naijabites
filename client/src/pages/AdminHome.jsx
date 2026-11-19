import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { useLogout, useSession } from '../lib/session.js';
import './pages.css';

export function AdminHome() {
  const { data } = useSession();
  const logout = useLogout();
  const user = data?.user;

  return (
    <main className="page admin-home">
      <p className="eyebrow">Administration</p>

      <h1>Hello, {user?.name}</h1>

      <div className="card">
        <p>
          You are signed in as an administrator ({user?.email}).
        </p>

        <p className="muted">
          Manage NaijaBites platform operations from your administration
          dashboard.
        </p>

        <Link to="/admin/riders" className="btn btn--primary btn--md">Review Rider Applications</Link>

                <Link to="/admin/vendors" className="btn btn--primary btn--md">Review Vendor Applications</Link>

        <Link to="/admin/deliveries" className="btn btn--primary btn--md">Manage Deliveries</Link>

        <Link
          to="/admin/delivery-zones"
          className="btn btn--primary btn--md"
        >
          Manage Delivery Zones
        </Link>

        <Button
          variant="outline"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}