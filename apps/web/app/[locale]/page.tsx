import { notFound } from 'next/navigation';
import { getMessages } from '../../i18n/get-messages';
import { isLocale, type Locale } from '../../i18n/locales';

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

export default function LocalizedHomePage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  const locale = params.locale as Locale;
  const messages = getMessages(locale);
  const isArabic = locale === 'ar';

  return (
    <main className="page-shell">
      <nav className="top-nav">
        <a className="brand-word" href={`/${locale}`}>Suqnaa · سوقنا</a>
        <div className="nav-links">
          <a href={`/${locale}/sell`}>{isArabic ? 'بيع' : 'Sell'}</a>
          <a href={`/${locale}/account`}>{isArabic ? 'الحساب' : 'Account'}</a>
          <a className="language-link" href={messages.nav.languageHref}>{messages.nav.language}</a>
        </div>
      </nav>

      <section className="hero">
        <div>
          <div className="brand-mark"><SuqnaaMark /></div>
          <div className="eyebrow">{messages.hero.eyebrow}</div>
          <h1>{messages.hero.title}</h1>
          <p>{messages.hero.body}</p>
          <div className="actions">
            <a className="button-primary" href={`/${locale}/sell`}>{isArabic ? 'ابدأ البيع' : 'Start selling'}</a>
            <a className="button-secondary" href={`/${locale}/account`}>{isArabic ? 'إنشاء حساب' : 'Create account'}</a>
          </div>
        </div>

        <aside className="phone-card" aria-label="Suqnaa mobile preview">
          <div className="phone-screen">
            <div className="mobile-header">
              <span>Suqnaa</span>
              <span>سوقنا</span>
            </div>
            <div className="search">{messages.mobile.search}</div>
            <div className="categories">
              {messages.categories.map((item) => (
                <div className="category" key={item}>{item[0]}</div>
              ))}
            </div>
            <div className="promo">
              <strong>{messages.mobile.promo}</strong>
              <p>{messages.mobile.shopNow}</p>
            </div>
            <h2 className="section-heading">{messages.mobile.trending}</h2>
            <div className="products">
              {messages.products.map((item) => (
                <div className="product" key={item}>{item}</div>
              ))}
            </div>
            <div className="assistant-card">
              <strong>{messages.assistant.title}</strong>
              <p>{messages.assistant.body}</p>
            </div>
          </div>
        </aside>
      </section>

      <section className="values" id="values">
        {messages.values.map((value) => (
          <article className="value-card" key={value.title}>
            <h3>{value.title}</h3>
            <p>{value.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
