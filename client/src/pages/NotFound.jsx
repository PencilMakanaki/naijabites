import { Link } from 'react-router-dom';
import './pages.css';

export function NotFound() {
  return (
    <main className="page message">
      <h1>We could not find that page</h1>
      <p className="muted">The link may be old or mistyped.</p>
      <Link to="/" className="btn btn--primary btn--md">Back to NaijaBites</Link>
    </main>
  );
}
