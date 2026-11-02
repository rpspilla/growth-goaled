import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How we use your data · Growth Goaled",
  description: "Your data is used for your own analysis and never shown to other companies. Anonymized, aggregated data improves Growth Goaled's recommendations and benchmarks.",
};

const fg = { color: "var(--foreground)" };
const muted = { color: "var(--muted-foreground)" };

/** Public, plain-English statement of how founders' data is used (linked from sign-up and the app). */
export default function DataUsePage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-12" style={{ background: "var(--background)" }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/" className="link text-sm">← Growth Goaled</Link>
        <h1 className="font-display text-4xl font-normal" style={fg}>How we use your data</h1>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold" style={fg}>For your own company</h2>
          <p className="text-base" style={muted}>
            What you share (your answers, files, figures and conversations) is used to analyse your company and answer your questions. It&apos;s never shown to
            another company. Your advisor sees it only to work with you.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold" style={fg}>Anonymized and aggregated, to improve Growth Goaled</h2>
          <p className="text-base" style={muted}>
            We may also use your data in anonymized, aggregated form to improve our methodology, recommendations and benchmarks. Before any data is used this way,
            your company&apos;s name and anything that identifies it are removed, and it&apos;s only ever combined with data from enough other companies that no
            single company can be identified. Aggregated figures always show their source, sample size and date.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold" style={fg}>Questions</h2>
          <p className="text-base" style={muted}>Ask your advisor, or contact us, if you&apos;d like to know more or have your data removed.</p>
        </section>
      </div>
    </main>
  );
}
