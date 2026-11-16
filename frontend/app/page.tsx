import Link from "next/link";

const headings = ["Database", "Severity", "Likely cause", "First checks", "Fix", "Escalate to"];

export default function Landing() {
  return (
    <main className="landing">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden>
            ◆
          </span>
          Incident Assistant
        </span>
        <Link href="/login" className="btn btn-primary">
          Sign in
        </Link>
      </header>

      <section className="hero">
        <p className="eyebrow">For on-call engineers at Meridian Pay</p>
        <h1>Paged at 3am? Get a reliable first answer.</h1>
        <p className="lead">
          Paste an error or describe the symptom. The assistant tells you which database is involved, how severe it
          is, what to check first and who to call, using only your team&apos;s database estate document. Ask
          follow-ups without re-explaining the incident.
        </p>
        <Link href="/login" className="btn btn-primary btn-lg">
          Sign in to start triage
        </Link>
      </section>

      <section className="example card">
        <div className="example-q">
          <span className="role">You</span>
          Payments are timing out and I see &apos;too many connections&apos;.
        </div>
        <div className="example-a">
          <span className="role">Assistant</span>
          <ul className="heading-list">
            {headings.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="facts">
        <div>
          <h3>Answers only from the document</h3>
          <p>If the estate document doesn&apos;t cover it, you get &ldquo;Not covered in the context document.&rdquo;, not a guess.</p>
        </div>
        <div>
          <h3>Money problems are SEV1</h3>
          <p>Wrong balances or duplicate charges are always treated as the most serious level.</p>
        </div>
        <div>
          <h3>Safe with ledger data</h3>
          <p>Never suggests editing ledger or audit rows. Corrections are new entries.</p>
        </div>
      </section>
    </main>
  );
}
