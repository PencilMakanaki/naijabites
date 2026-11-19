import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './Button.jsx';
import { IconCart, IconMenu, IconUser } from './icons.jsx';
import { MenuDrawer } from './MenuDrawer.jsx';
import { useLogout, useSession } from '../lib/session.js';
import { useCart } from '../lib/cart.js';
import './TopBar.css';

export function TopBar() {
  const session = useSession();
  const logout = useLogout();
  const user = session.data?.user;
  const [menuOpen, setMenuOpen] = useState(false);
  const cart = useCart({ enabled: session.data?.area === 'customer' });
  const cartCount = cart.data?.itemCount ?? 0;

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <button type="button" className="icon-btn" aria-label="Open menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
          <IconMenu />
        </button>
        {menuOpen ? <MenuDrawer onClose={() => setMenuOpen(false)} /> : null}
        <Link to="/" className="brand" aria-label="NaijaBites home">
          <span className="brand__logo" aria-hidden="true">{'\u{1F468}\u{1F3FE}\u200D\u{1F373}'}</span>
          <span>
            <span className="brand__name">Naija<span>Bites</span></span>
            <span className="brand__tag">Good Food &middot; Great People &middot; Happy Food</span>
          </span>
        </Link>
        <div className="topbar__spacer" />
        {session.isLoading ? null : user ? (
          <>
            {session.data.area === 'customer'
              ? <Link to="/account" className="topbar__user">{user.name.split(' ')[0]}</Link>
              : <span className="topbar__user">{user.name.split(' ')[0]}</span>}
            {session.data.area === 'admin' ? <Link to="/admin" className="btn btn--outline btn--md">Admin</Link> : null}
            <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>Sign out</Button>
          </>
        ) : (
          <Link to="/signin" className="btn btn--primary btn--md"><IconUser size={18} /> Sign In</Link>
        )}
        <Link to={user && session.data.area === 'customer' ? '/cart' : '/signin?area=customer&from=%2Fcart'} className="icon-btn" aria-label={`Cart, ${cartCount} items`} title="Shopping cart">
          <IconCart />
          <span className="icon-btn__badge" aria-hidden="true">{cartCount > 99 ? '99+' : cartCount}</span>
        </Link>
      </div>
    </header>
  );
}
