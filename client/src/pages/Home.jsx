import { useLocation, useSearchParams } from 'react-router-dom';
import { Hero } from '../components/Hero.jsx';
import { IconPin } from '../components/icons.jsx';
import { MarketStrip } from '../components/MarketStrip.jsx';
import { MealGrid } from '../components/MealGrid.jsx';
import { SidebarCards } from '../components/SidebarCards.jsx';
import { useMarkets } from '../lib/catalogue.js';
import { ALL_MARKETS, defaultMarket } from '../lib/markets.js';
import './home.css';

/** The storefront. The chosen market and search live in the address, so links can be shared and Back works. */
export function Home() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const markets = useMarkets().data;

  // Behind a pop-up (for example a product page) the list keeps showing what the visitor came from.
  const onHome = location.pathname === '/';
  const source = onHome ? params : new URLSearchParams(location.state?.background ?? '');
  const marketParam = source.get('market');
  const q = (source.get('q') ?? '').trim();
  const market = marketParam === 'all' ? null
    : markets.find((m) => m.code === marketParam) ?? markets.find((m) => m.code === defaultMarket()) ?? markets[0];

  function update(change) {
    if (!onHome) return;
    const next = new URLSearchParams(params);
    change(next);
    setParams(next);
  }
  const setMarket = (code) => update((p) => p.set('market', code));
  const onSearch = (text) => update((p) => (text ? p.set('q', text) : p.delete('q')));

  const heading = q ? `Results for \u201C${q}\u201D` : market ? market.heading : ALL_MARKETS.heading;
  const filters = { market: market?.code, q: q || undefined };

  return (
    <main className="page home">
      <Hero key={q} query={q} onSearch={onSearch} />
      <MarketStrip markets={markets} value={market?.code ?? 'all'} onChange={setMarket} />
      <div className="home__layout">
        <section className="home__menus" aria-labelledby="menus-title">
          <div className="home__menus-head">
            <div>
              <h2 id="menus-title">{heading}</h2>
              <p className="home__sub"><IconPin size={14} /> Local vendors and products</p>
            </div>
            {market ? <button type="button" className="linklike home__viewall" onClick={() => setMarket('all')}>View All &rsaquo;</button> : null}
          </div>
          <MealGrid filters={filters} backgroundSearch={source.toString()} />
        </section>
        <aside className="home__aside" aria-label="About NaijaBites">
          <SidebarCards onExplore={() => setMarket('all')} />
        </aside>
      </div>
    </main>
  );
}
