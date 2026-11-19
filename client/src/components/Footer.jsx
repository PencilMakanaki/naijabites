import { Link } from 'react-router-dom';
import './Footer.css';

export function Footer() {
  return (
    <footer className="footer">
      <div className="page footer__inner">
        <p>&copy; {new Date().getFullYear()} NaijaBites. Good food, great people.</p>
        <nav aria-label="Footer" className="footer__links">
          <Link to="/about">About Us</Link>
          <Link to="/community">Food Community</Link>
          <Link to="/signin?area=admin">Staff sign-in</Link>
        </nav>
      </div>
    </footer>
  );
}
