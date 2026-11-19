import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatNaira } from '@naijabites/shared/money';
import './MealCard.css';

const BADGES = { new: 'New', popular: 'Popular', celebration: 'Celebration' };

export function MealCard({ product, backgroundSearch = '' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const quote = product.fulfilmentMode === 'quote_required';
  const to = `/p/${product.id}`;
  const state = { background: backgroundSearch };
  return (
    <article className="meal">
      <Link to={to} state={state} className="meal__photo" tabIndex={-1} aria-hidden="true">
        {product.image && !imageFailed
          ? <img src={product.image.url} alt="" loading="lazy" width="320" height="180" onError={() => setImageFailed(true)} />
          : <span className="meal__nophoto">{'\u{1F37D}\uFE0F'}</span>}
        {product.badge ? <span className={`meal__badge meal__badge--${product.badge}`}>{BADGES[product.badge] ?? product.badge}</span> : null}
      </Link>
      <div className="meal__body">
        <p className="meal__vendor">{product.vendor.name}</p>
        <h3 className="meal__name"><Link to={to} state={state}>{product.name}</Link></h3>
        <p className="meal__price"><strong>{quote ? 'From ' : ''}{formatNaira(product.priceKobo)}</strong> <small>/ {product.unit}</small></p>
        <Link to={to} state={state} className="btn btn--outline btn--sm meal__view">{quote ? 'Request a quote' : 'View details'}</Link>
      </div>
    </article>
  );
}

export function MealCardSkeleton() {
  return (
    <div className="meal meal--skeleton" aria-hidden="true">
      <div className="meal__photo" />
      <div className="meal__body"><span /><span /><span /></div>
    </div>
  );
}
