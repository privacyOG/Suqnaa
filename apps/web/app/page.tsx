export default function RootPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <div className="eyebrow">Suqnaa · سوقنا</div>
          <h1>Choose language</h1>
          <p>Select your preferred language to continue.</p>
          <div className="actions">
            <a className="button-primary" href="/en">English</a>
            <a className="button-secondary" href="/ar">العربية</a>
          </div>
        </div>
      </section>
    </main>
  );
}
