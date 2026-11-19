import { useState } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { IconSearch } from './icons.jsx';
import './Hero.css';

export function Hero({ query: initialQuery = '', onSearch }) {
  const [query, setQuery] = useState(initialQuery);
  const compact = useMediaQuery('(max-width: 480px)');
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__body">
        <p className="hero__eyebrow">Your local marketplace</p>
        <h1 id="hero-title" className="hero__title">Food, Farm Goods &amp; <span>Livestock</span></h1>
        <p className="hero__text">
          Discover caf&eacute;s, bakeries, fast food, restaurant menus, groceries and live farm animals.
          Shop local vendors and farms in one place.
        </p>
        <form className="hero__search" role="search" onSubmit={(event) => { event.preventDefault(); onSearch?.(query.trim()); }}>
          <label htmlFor="hero-search" className="sr-only">Search products, vendors or categories</label>
          <IconSearch size={18} />
          <input id="hero-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder={compact ? 'Search meals\u2026' : 'Search meals or vendors'} autoComplete="off" />
          <button type="submit">Search</button>
        </form>
      </div>
      <p className="hero__note" aria-hidden="true">
        <span>Authentic</span>
        <span>African Taste</span>
      </p>
    </section>
  );
}
