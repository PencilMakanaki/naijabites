import { Button } from './Button.jsx';
import { MealCard, MealCardSkeleton } from './MealCard.jsx';
import { useProducts } from '../lib/catalogue.js';
import './MealCard.css';

/** A list of meals for the given filters, with loading, empty and error states and Load more. */
export function MealGrid({ filters, backgroundSearch }) {
  const query = useProducts(filters);
  const products = query.data?.pages.flatMap((page) => page.data) ?? [];

  if (query.isPending) {
    return <div className="meal-grid" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <MealCardSkeleton key={i} />)}</div>;
  }
  if (query.isError) {
    return (
      <div className="home__empty" role="alert">
        <p><strong>We could not load the menus.</strong></p>
        <p>Check your connection and try again.</p>
        <Button onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }
  if (products.length === 0) {
    return (
      <div className="home__empty">
        <span aria-hidden="true">{'\u{1F37D}\uFE0F'}</span>
        <p><strong>No items found.</strong></p>
        <p>Try another search, or choose a different market.</p>
      </div>
    );
  }
  return (
    <>
      <div className="meal-grid">
        {products.map((product) => <MealCard key={product.id} product={product} backgroundSearch={backgroundSearch} />)}
      </div>
      {query.hasNextPage ? (
        <div className="home__more">
          <Button variant="outline" size="lg" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </>
  );
}
