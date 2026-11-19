import { Link } from 'react-router-dom';
import './pages.css';

export function Community() {
  return (
    <main className="page message">
      <p className="eyebrow">Food Community</p>
      <h1>The Food Community opens soon</h1>
      <p className="muted">Share meals, tips and favourites with other food lovers. We are still building this part.</p>
      <Link to="/" className="btn btn--primary btn--md">Back to NaijaBites</Link>
    </main>
  );
}
