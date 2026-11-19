import { ALL_MARKETS } from '../lib/markets.js';
import { IconChevron } from './icons.jsx';
import './MarketStrip.css';

/** The three main market tabs, the other markets, and the Today's Market selector. */
export function MarketStrip({ markets, value, onChange }) {
  const main = markets.filter((m) => m.isMain);
  const other = markets.filter((m) => !m.isMain);
  const current = value === 'all' ? ALL_MARKETS : markets.find((m) => m.code === value) ?? ALL_MARKETS;

  return (
    <section className="markets" aria-label="Markets">
      <div className="markets__today">
        <span className="markets__icon" aria-hidden="true">{current.icon}</span>
        <div>
          <p className="markets__label">Today&rsquo;s Market</p>
          <p className="markets__current">{current.name} <span>({current.shortLabel})</span></p>
        </div>
        <IconChevron size={16} />
        <select className="markets__select" aria-label="Choose a market" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="all">{ALL_MARKETS.name}</option>
          {markets.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
        </select>
      </div>
      <div className="markets__tabs" role="group" aria-label="Main markets">
        {main.map((m) => (
          <button key={m.code} type="button" className="markets__tab" aria-pressed={value === m.code} onClick={() => onChange(m.code)}>
            <span className="markets__icon" aria-hidden="true">{m.icon}</span>
            <span><strong>{m.name}</strong><small>{m.blurb}</small></span>
          </button>
        ))}
      </div>
      <div className="markets__other">
        <p className="markets__label">Other Markets</p>
        <div className="markets__other-row" role="group" aria-label="Other markets">
          {other.map((m) => (
            <button key={m.code} type="button" className="markets__chip" aria-pressed={value === m.code} onClick={() => onChange(m.code)}>
              <span aria-hidden="true">{m.icon}</span>
              <span>{m.name}{m.code === 'livestock' ? <small>Live animals</small> : null}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
