import { Link, useParams } from 'react-router-dom';
import { MealGrid } from '../components/MealGrid.jsx';
import { IconPin } from '../components/icons.jsx';
import { useVendor } from '../lib/catalogue.js';
import './pages.css';
import './home.css';

export function VendorPage() {
  const { slug } = useParams();
  const vendor = useVendor(slug);
  const v = vendor.data;

  if (vendor.isError) {
    return (
      <main className="page message">
        <h1>We could not find that vendor</h1>
        <p className="muted">They may no longer be on NaijaBites.</p>
        <Link to="/" className="btn btn--primary btn--md">Back to NaijaBites</Link>
      </main>
    );
  }
  return (
    <main className="page vendor-page">
      <p className="eyebrow">Vendor</p>
      <h1>{v ? v.name : 'Loading…'}</h1>
      {v ? (
        <>
          {v.description ? <p className="vendor-page__about">{v.description}</p> : null}
          {v.branches.length ? (
            <p className="vendor-page__where"><IconPin size={16} /> {v.branches.map((b) => `${b.area}, ${b.city}`).join(' \u00B7 ')}</p>
          ) : null}
          <h2 className="vendor-page__menu">Menu</h2>
          <MealGrid filters={{ vendor: slug }} />
        </>
      ) : null}
    </main>
  );
}
