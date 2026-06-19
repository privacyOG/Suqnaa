function SuqnaaMark() {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label="Suqnaa mark">
      <rect width="120" height="120" rx="30" fill="#0b46d8" />
      <path d="M82 27c-18-11-43-4-48 14-6 20 29 18 29 33 0 10-14 13-30 5" fill="none" stroke="#fff" strokeWidth="15" strokeLinecap="round" />
      <path d="M62 34h22v34H62z" fill="#fff" opacity=".94" />
      <path d="M68 34c0-10 12-10 12 0" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      <path d="M30 78c17 14 42 13 58-5" fill="none" stroke="#d9a441" strokeWidth="12" strokeLinecap="round" />
      <path d="M80 27c13 6 21 18 23 33" fill="none" stroke="#ff6958" strokeWidth="14" strokeLinecap="round" />
      <path d="M36 35c12-9 29-9 43 0" fill="none" stroke="#18b9c5" strokeWidth="12" strokeLinecap="round" />
    </svg>
  );
}

const values = [
  ['Trust', 'Verified sellers, safer payments, and clear account controls.'],
  ['Fairness', 'Fair prices, transparent rules, and equal opportunity for buyers and sellers.'],
  ['Quality', 'Curated standards for listings, sellers, and marketplace behaviour.'],
  ['Connection', 'Real people, local communities, and regional commerce in one place.']
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <div className="brand-mark"><SuqnaaMark /></div>
          <div className="eyebrow">سوقنا · Our market</div>
          <h1>Discover. Connect. Trust.</h1>
          <p>
            Suqnaa is a modern marketplace for trusted local and regional trade. Buy and sell with clear listings,
            real people, fair pricing, and quality-first marketplace standards.
          </p>
          <div className="actions">
            <a className="button-primary" href="#waitlist">Join early access</a>
            <a className="button-secondary" href="#values">View values</a>
          </div>
        </div>

        <aside className="phone-card" aria-label="Suqnaa mobile preview">
          <div className="phone-screen">
            <div className="mobile-header">
              <span>Suqnaa</span>
              <span>سوقنا</span>
            </div>
            <div className="search">What are you looking for?</div>
            <div className="categories">
              {['Phone', 'Fashion', 'Home', 'Beauty', 'Cars', 'More'].map((item) => (
                <div className="category" key={item}>{item[0]}</div>
              ))}
            </div>
            <div className="promo">
              <strong>Great finds.<br />Fair prices.<br />Trusted people.</strong>
              <p>Shop confidently across your community.</p>
            </div>
            <div className="products">
              {['Headphones', 'Bag', 'Watch'].map((item) => (
                <div className="product" key={item}>{item}</div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="values" id="values">
        {values.map(([title, body]) => (
          <article className="value-card" key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
