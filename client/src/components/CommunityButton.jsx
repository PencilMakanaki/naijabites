import { Link } from 'react-router-dom';
import './CommunityButton.css';

export function CommunityButton() {
  return (
    <Link to="/community" className="community-fab">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z" />
      </svg>
      Food Community
    </Link>
  );
}
