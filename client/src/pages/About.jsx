import { Link } from 'react-router-dom';
import './about.css';

const HIGHLIGHTS = [
  { icon: '\u{1F336}\uFE0F', title: 'Authentic Flavours', text: 'Celebrating Nigerian cuisine' },
  { icon: '\u{1F91D}\u{1F3FE}', title: 'Community First', text: 'Supporting local vendors' },
];
const TILES = [
  { icon: '\u{1F1F3}\u{1F1EC}', title: 'Nigerian Flavours', text: 'Discover meals inspired by our culture.' },
  { icon: '\u{1F9D1}\u{1F3FE}\u200D\u{1F373}', title: 'Local Vendors', text: 'Helping food businesses get discovered.' },
  { icon: '\u{1F49A}', title: 'Strong Communities', text: 'Bringing food lovers closer together.' },
];
const PURPOSE = [
  { icon: '\u{1F3AF}', title: 'Our Mission', text: 'To make discovering local food easier while helping food vendors connect with more customers.' },
  { icon: '\u{1F30D}', title: 'Our Vision', text: 'To build a welcoming food community where local flavours and food businesses can thrive.' },
  { icon: '\u2764\uFE0F', title: 'Our Values', text: 'Community, convenience, cultural appreciation and respect for the people behind every meal.' },
];
const STEPS = [
  { number: '01', title: 'Explore', text: 'Browse meals and food categories to find something you love.' },
  { number: '02', title: 'Discover Vendors', text: 'Explore local food businesses and the meals they offer.' },
  { number: '03', title: 'Enjoy the Flavour', text: 'Find your favourites and celebrate the variety of Nigerian food.' },
];

export function About() {
  return (
    <main className="about">
      <section className="about__hero">
        <div className="page about__hero-inner">
          <div>
            <p className="about__eyebrow">Our story, our flavour</p>
            <h1>Good food brings people together.</h1>
            <p className="about__lead">
              NaijaBites connects food lovers with local food vendors, making it easier to discover delicious meals and
              celebrate the rich flavours of Nigeria.
            </p>
            <div className="about__actions">
              <Link to="/?market=all" className="btn btn--lg about__btn-light">Explore Meals &rarr;</Link>
              <a href="#who" className="btn btn--lg about__btn-ghost">Learn About Us</a>
            </div>
          </div>
          <ul className="about__highlights" aria-label="What we care about">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title}><span aria-hidden="true">{h.icon}</span><div><strong>{h.title}</strong><p>{h.text}</p></div></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="page about__tiles" aria-label="Highlights">
        {TILES.map((t) => (
          <article key={t.title} className="about__tile"><span aria-hidden="true">{t.icon}</span><h2>{t.title}</h2><p>{t.text}</p></article>
        ))}
        <p className="about__tagline">A taste of home, wherever you are.</p>
      </section>

      <section id="who" className="page about__section">
        <p className="eyebrow">Who we are</p>
        <h2>A marketplace with a taste of home.</h2>
        <p>Food is more than something we eat. It brings families together, celebrates traditions and creates lasting memories.</p>
        <p>NaijaBites is a food marketplace designed to help customers explore meals from local vendors in one convenient place. From everyday favourites to special dishes, we want everyone to discover food they love.</p>
        <p>We also want local food businesses to become easier to find, helping them reach customers who appreciate their cooking.</p>
        <Link to="/" className="about__link">Visit our marketplace &rarr;</Link>
      </section>

      <section className="page about__section">
        <p className="eyebrow">Our purpose</p>
        <h2>Why NaijaBites exists</h2>
        <p>Good food is just the beginning. It&rsquo;s also about people, opportunities and culture.</p>
        <div className="about__cards">
          {PURPOSE.map((c) => (
            <article key={c.title} className="about__card"><span aria-hidden="true">{c.icon}</span><h3>{c.title}</h3><p>{c.text}</p></article>
          ))}
        </div>
      </section>

      <section className="page about__section">
        <p className="eyebrow">The NaijaBites experience</p>
        <h2>Discover food in three simple steps.</h2>
        <ol className="about__steps">
          {STEPS.map((s) => (
            <li key={s.number}><span className="about__step-no" aria-hidden="true">{s.number}</span><div><h3>{s.title}</h3><p>{s.text}</p></div></li>
          ))}
        </ol>
      </section>

      <section className="about__cta">
        <div className="page">
          <p className="about__eyebrow">Your next favourite meal awaits</p>
          <h2>Let&rsquo;s make every meal meaningful.</h2>
          <p>Explore local flavours, discover new meals and support the people who bring great food to our communities.</p>
          <Link to="/" className="btn btn--lg about__btn-light">Explore NaijaBites &rarr;</Link>
        </div>
      </section>
    </main>
  );
}
