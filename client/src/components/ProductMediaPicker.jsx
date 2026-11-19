import { useState } from 'react';
import { Button } from './Button.jsx';
import { getErrorMessage } from '../lib/forms.js';
import { useMarkets } from '../lib/catalogue.js';
import { marketsOrFallback } from '../lib/markets.js';
import { useSaveProductMedia, useSearchProductImages } from '../lib/vendorProducts.js';
import './product-media-picker.css';

/** Lets a vendor pick a photo (from the Unsplash photo service) and the markets a product is sold in. */
export function ProductMediaPicker({ product, onSaved, onCancel }) {
  const search = useSearchProductImages();
  const save = useSaveProductMedia();
  const markets = marketsOrFallback(useMarkets().data);
  const [query, setQuery] = useState(product.name);
  const [chosen, setChosen] = useState(product.imageUrl ? { imageUrl: product.imageUrl, alt: product.name } : null);
  const [selected, setSelected] = useState(product.markets || []);
  const [message, setMessage] = useState('');
  const results = search.data || [];

  function runSearch(event) {
    event.preventDefault();
    setMessage('');
    search.mutate(query.trim());
  }
  const toggleMarket = (code) => setSelected((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));

  async function submit() {
    if (!chosen) { setMessage('Choose a photo first.'); return; }
    if (selected.length === 0) { setMessage('Choose at least one market.'); return; }
    try {
      await save.mutateAsync({ id: product.id, imageUrl: chosen.imageUrl, altText: chosen.alt || product.name, downloadLocation: chosen.downloadLocation || undefined, markets: selected });
      onSaved();
    } catch (error) { setMessage(getErrorMessage(error)); }
  }

  return (
    <section className="media-picker" aria-label={`Photo and markets for ${product.name}`}>
      <h3>Photo and markets for {product.name}</h3>
      <form className="media-picker__search" onSubmit={runSearch}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} minLength="2" maxLength="60" placeholder="Search photos, e.g. jollof rice" aria-label="Search photos" />
        <Button type="submit" variant="secondary" disabled={search.isPending || query.trim().length < 2}>{search.isPending ? 'Searching…' : 'Search photos'}</Button>
      </form>
      {search.isError && <p className="media-picker__error">{getErrorMessage(search.error)}</p>}
      {search.isSuccess && results.length === 0 && <p className="muted">No photos found. Try a different word.</p>}
      {results.length > 0 && (
        <div className="media-picker__grid">
          {results.map((photo) => (
            <button type="button" key={photo.id} className={chosen?.imageUrl === photo.imageUrl ? 'media-picker__photo is-chosen' : 'media-picker__photo'}
              aria-pressed={chosen?.imageUrl === photo.imageUrl} onClick={() => setChosen({ imageUrl: photo.imageUrl, alt: photo.alt, photographer: photo.photographer, photographerUrl: photo.photographerUrl, downloadLocation: photo.downloadLocation })}>
              <img src={photo.thumbUrl} alt={photo.alt || 'Photo option'} loading="lazy" />
              <small>{photo.photographer}</small>
            </button>
          ))}
        </div>
      )}
      <p className="media-picker__credit">Photos from <a href="https://unsplash.com/?utm_source=NaijaBites&utm_medium=referral" target="_blank" rel="noreferrer">Unsplash</a></p>
      {chosen && <p className="media-picker__chosen"><img src={chosen.imageUrl} alt="" /> <span>Chosen photo{chosen.photographer && <> by {chosen.photographerUrl ? <a href={chosen.photographerUrl} target="_blank" rel="noreferrer">{chosen.photographer}</a> : chosen.photographer} on <a href="https://unsplash.com/?utm_source=NaijaBites&utm_medium=referral" target="_blank" rel="noreferrer">Unsplash</a></>}</span></p>}
      <fieldset className="media-picker__markets">
        <legend>Where is this product sold?</legend>
        {markets.map((market) => (
          <label key={market.code}><input type="checkbox" checked={selected.includes(market.code)} onChange={() => toggleMarket(market.code)} /> {market.icon} {market.name}</label>
        ))}
      </fieldset>
      {message && <p className="media-picker__error" role="alert">{message}</p>}
      <div className="media-picker__actions">
        <Button type="button" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save photo and markets'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Close</Button>
      </div>
    </section>
  );
}
