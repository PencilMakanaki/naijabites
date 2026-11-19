import './SidebarCards.css';

export function SidebarCards({ onExplore }) {
  return (
    <>
      <section className="side-card side-card--support" aria-labelledby="support-title">
        <div>
          <h2 id="support-title">Support Local Vendors</h2>
          <p>Real food. Real people. Stronger communities.</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={onExplore}>Explore All Markets</button>
        </div>
        <span className="side-card__art" aria-hidden="true">{'\u{1F3EA}'}</span>
      </section>
      <section className="side-card" aria-labelledby="service-title">
        <h2 id="service-title">Delivery &amp; Service</h2>
        <ul className="side-card__list">
          <li><span aria-hidden="true">{'\u{1F69A}'}</span>Fast &amp; Reliable</li>
          <li><span aria-hidden="true">{'\u{1F96C}'}</span>Fresh Food &amp; Farm Goods</li>
          <li><span aria-hidden="true">{'\u{1F3EA}'}</span>Local Vendors</li>
        </ul>
      </section>
    </>
  );
}
