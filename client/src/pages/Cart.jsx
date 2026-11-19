import { Link } from 'react-router-dom';
import { formatNaira } from '@naijabites/shared/money';
import { Button } from '../components/Button.jsx';
import { useCart, useRemoveCartItem, useSetCartQuantity } from '../lib/cart.js';
import './cart.css';

export function Cart() {
  const cart = useCart();
  const setQuantity = useSetCartQuantity();
  const remove = useRemoveCartItem();
  const data = cart.data;
  return (
    <main className="page cart-page">
      <div className="cart-page__heading"><div><p className="eyebrow">YOUR ORDER</p><h1>Your shopping cart</h1></div><Link to="/">Continue shopping</Link></div>
      {cart.isPending ? <p role="status">Loading your cart…</p> : null}
      {cart.isError ? <p className="cart-page__error" role="alert">{cart.error?.message || 'We could not load your cart. Please sign in again.'}</p> : null}
      {data?.items?.length ? <>
        <div className="cart-list">
          {data.items.map((item) => <article className="cart-item" key={item.productId}>
            {item.image ? <img src={item.image.url} alt={item.image.alt} /> : <div className="cart-item__placeholder">🍽️</div>}
            <div className="cart-item__details"><h2>{item.name}</h2><p>{item.vendor.name}</p><strong>{formatNaira(item.unitPriceKobo)} <small>/ {item.unit}</small></strong>
              {!item.available ? <p className="cart-page__error">Currently unavailable</p> : null}
            </div>
            <div className="cart-item__actions">
              <label>Quantity <select value={item.quantity} disabled={setQuantity.isPending} onChange={(e) => setQuantity.mutate({ productId: item.productId, quantity: Number(e.target.value) })}>
                {Array.from({ length: Math.min(item.maxPerOrder, 50) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select></label>
              <strong>{formatNaira(item.lineTotalKobo)}</strong>
              <button type="button" className="cart-item__remove" disabled={remove.isPending} onClick={() => remove.mutate(item.productId)}>Remove</button>
            </div>
          </article>)}
        </div>
        <aside className="cart-summary"><div><span>Subtotal</span><strong>{formatNaira(data.subtotalKobo)}</strong></div><p>Delivery fees and final availability are confirmed at checkout.</p><Link className="btn btn--primary btn--lg" to="/checkout">Continue to checkout</Link></aside>
      </> : null}
      {data && data.items.length === 0 ? <section className="cart-empty"><div aria-hidden="true">🛒</div><h2>Your cart is waiting</h2><p>Add something delicious from the NaijaBites marketplace.</p><Link className="btn btn--primary btn--md" to="/">Explore products</Link></section> : null}
    </main>
  );
}
