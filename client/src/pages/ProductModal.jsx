import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatNaira } from '@naijabites/shared/money';
import { Button } from '../components/Button.jsx';
import { Modal } from '../components/Modal.jsx';
import { useMarkets, useProduct } from '../lib/catalogue.js';
import { useAddCartItem } from '../lib/cart.js';
import { useSession } from '../lib/session.js';
import './product.css';

function Gallery({ images, name }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(() => new Set());
  const usable = images.filter((_, i) => !failed.has(i));
  const current = images[index] && !failed.has(index) ? images[index] : usable[0];
  if (!current) return <div className="product__gallery"><div className="product__photo product__photo--empty" aria-hidden="true">{'\u{1F37D}\uFE0F'}</div></div>;
  return (
    <div className="product__gallery">
      <img className="product__photo" src={current.url} alt={current.alt || name}
        onError={() => setFailed((set) => new Set(set).add(images.indexOf(current)))} />
      {images.length > 1 ? (
        <div className="product__thumbs" role="group" aria-label="More pictures">
          {images.map((image, i) => (failed.has(i) ? null : (
            <button key={image.url} type="button" aria-label={`Picture ${i + 1}`} aria-pressed={image === current} onClick={() => setIndex(i)}>
              <img src={image.url} alt="" loading="lazy" />
            </button>
          )))}
        </div>
      ) : null}
    </div>
  );
}

/** Product details as a pop-up over the storefront. The address (/p/...) can be shared. */
export function ProductModal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const product = useProduct(id);
  const markets = useMarkets().data;
  const session = useSession();
  const addToCart = useAddCartItem();
  const close = () => (location.key !== 'default' ? navigate(-1) : navigate('/', { replace: true }));
  const p = product.data;
  const quote = p?.fulfilmentMode === 'quote_required';

  return (
    <Modal title={p ? p.name : product.isError ? 'Not available' : 'Loading…'} eyebrow={p ? p.vendor.name : undefined} size="lg" onClose={close}>
      {product.isPending ? <div className="product__loading" aria-busy="true"><span /><span /><span /></div> : null}
      {product.isError ? (
        <div className="product__missing" role="alert">
          <p>This item is not available right now. It may have been removed or sold out.</p>
          <Button onClick={close}>Back to the menus</Button>
        </div>
      ) : null}
      {p ? (
        <div className="product">
          <Gallery images={p.images} name={p.name} />
          <div className="product__info">
            <p className="product__price"><strong>{quote ? 'From ' : ''}{formatNaira(p.priceKobo)}</strong> <small>/ {p.unit}</small></p>
            {p.description ? <p className="product__desc">{p.description}</p> : null}
            <p className="product__vendor">Sold by <Link to={`/vendors/${p.vendor.slug}`}>{p.vendor.name}</Link></p>
            {p.branches.length ? (
              <p className="product__where">Available from: {p.branches.map((b) => `${b.area}, ${b.city}`).join(' \u00B7 ')}</p>
            ) : null}
            {p.markets.length ? (
              <ul className="product__chips" aria-label="Markets">
                {p.markets.map((code) => <li key={code}>{markets.find((m) => m.code === code)?.name ?? code}</li>)}
              </ul>
            ) : null}
            <div className="product__cta">
              <Button size="lg" disabled={quote || addToCart.isPending} onClick={() => { if (session.data?.area !== 'customer') { navigate(`/signin?area=customer&from=${encodeURIComponent(location.pathname)}`); return; } addToCart.mutate({ productId: p.id, quantity: 1 }); }}>{quote ? 'Request a quote' : addToCart.isPending ? 'Adding…' : 'Add to Cart'}</Button>
              <p role="status">{quote ? 'Quotes for live animals open in a later update.' : addToCart.isError ? addToCart.error.message : addToCart.isSuccess ? 'Added to your cart.' : 'Your cart is saved to your customer account.'}</p>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
