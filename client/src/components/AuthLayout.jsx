import { Link, Outlet } from 'react-router-dom';
import './auth.css';

export function AuthLayout() {
  return (
    <div className="auth">
      <header className="auth__header">
        <Link to="/" className="brand" aria-label="NaijaBites home">
          <span className="brand__logo" aria-hidden="true">{'\u{1F468}\u{1F3FE}\u200D\u{1F373}'}</span>
          <span>
            <span className="brand__name">Naija<span>Bites</span></span>
            <span className="brand__tag">Good Food &middot; Great People &middot; Happy Food</span>
          </span>
        </Link>
        <Link to="/" className="auth__back">&larr; Back to marketplace</Link>
      </header>
      <Outlet />
    </div>
  );
}
