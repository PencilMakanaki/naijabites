import { Link } from 'react-router-dom';
import { Modal } from './Modal.jsx';

export function MenuDrawer({ onClose }) {
  return (
    <Modal title="Menu" eyebrow="NaijaBites" onClose={onClose} placement="left">
      <nav aria-label="Main menu">
        <ul className="drawer__list">
          <li><Link to="/" onClick={onClose}>Home</Link></li>
          <li><Link to="/?market=all" onClick={onClose}>Explore Meals</Link></li>
          <li><Link to="/about" onClick={onClose}>About Us</Link></li>
          <li><Link to="/community" onClick={onClose}>Food Community</Link></li>
          <li><Link to="/vendor/register" onClick={onClose}>Sell on NaijaBites</Link></li>
        </ul>
      </nav>
    </Modal>
  );
}
