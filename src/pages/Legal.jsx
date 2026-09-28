import React from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import TaloLogo from "@/components/brand/TaloLogo";
import { DOCS, SUBPROCESSORS, PROVIDER, LEGAL_UPDATED, providerIncomplete } from "@/lib/legal";

const LINKS = [["privacy", "Informativa privacy"], ["termini", "Termini di servizio"], ["accordo-trattamento-dati", "Accordo sul trattamento dei dati"]];
const KEY = { privacy: "privacy", termini: "termini", "accordo-trattamento-dati": "dpa" };

export default function Legal() {
  const { doc = "privacy" } = useParams();
  const d = DOCS[KEY[doc]] || DOCS.privacy;
  return (
    <div className="min-h-screen bg-white">
      <header className="metal-ink border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/"><TaloLogo size={32} /></Link>
          <Link to="/" className="text-sm text-zinc-400 hover:text-white inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Torna a Talo</Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-5 py-10 grid md:grid-cols-[200px_1fr] gap-10">
        <nav className="text-sm space-y-1 md:sticky md:top-6 h-fit">
          {LINKS.map(([slug, label]) => (
            <Link key={slug} to={`/legal/${slug}`} className={`block rounded-lg px-3 py-2 ${KEY[slug] === KEY[doc] ? "bg-zinc-100 text-zinc-950 font-medium" : "text-zinc-600 hover:text-zinc-950"}`}>{label}</Link>
          ))}
        </nav>
        <article className="min-w-0">
          <h1 className="font-display text-4xl font-bold uppercase tracking-[0.01em] text-zinc-950">{d.title}</h1>
          <p className="text-sm text-zinc-500 mt-2">Ultimo aggiornamento: {LEGAL_UPDATED}</p>
          {providerIncomplete() && (
            <p className="mt-5 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />Bozza: i dati del fornitore del servizio sono ancora da completare e il testo va rivisto da un legale prima della pubblicazione definitiva.</p>
          )}
          <p className="mt-6 text-[15px] leading-relaxed text-zinc-700">{d.intro}</p>
          {d.sections.map(([h, body], i) => (
            <section key={h} className="mt-7">
              <h2 className="text-lg font-semibold text-zinc-950">{i + 1}. {h}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-700">{body}</p>
            </section>
          ))}
          {KEY[doc] === "dpa" && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-zinc-950">Elenco dei sub-responsabili</h2>
              <div className="mt-3 rounded-xl border border-zinc-200 divide-y divide-zinc-100">
                {SUBPROCESSORS.map((s) => (
                  <div key={s.nome} className="p-3 grid sm:grid-cols-[200px_1fr] gap-1 text-sm">
                    <p className="font-medium text-zinc-900">{s.nome}</p>
                    <p className="text-zinc-600">{s.servizio}. <span className="text-zinc-500">{s.sede}.</span></p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <p className="mt-10 text-sm text-zinc-500 border-t border-zinc-100 pt-5">Per domande: {PROVIDER.email}</p>
        </article>
      </main>
    </div>
  );
}
