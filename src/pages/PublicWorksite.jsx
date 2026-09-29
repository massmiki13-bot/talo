import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, AlertTriangle, MapPin, CalendarDays, FileText, Phone, Mail, Camera, ClipboardList, Download, X } from "lucide-react";

// Area cliente: il committente segue il suo lavoro da un link, senza account.
const fmt = (d) => (d ? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "");
const eur = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Number(v) || 0);
const STATI = { da_iniziare: "In partenza", in_corso: "Lavori in corso", sospeso: "Sospeso", finito: "Lavori terminati" };

function Section({ icon: I, title, children }) {
  return (
    <section className="bg-white rounded-2xl border border-zinc-200 p-5">
      <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2 mb-4"><I className="w-4 h-4 text-brand-600" aria-hidden="true" />{title}</h2>
      {children}
    </section>
  );
}

export default function PublicWorksite() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    fetch(`/api/quote-public?c=${encodeURIComponent(token)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Link non valido"); return j; })
      .then((j) => { setD(j); document.title = `${j.lavoro.nome} – ${j.impresa.ragione_sociale || "Talo"}`; })
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) return (
    <main className="min-h-screen grid place-items-center bg-zinc-50 p-6"><div className="max-w-md text-center">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" aria-hidden="true" /><h1 className="text-lg font-semibold text-zinc-900">{error}</h1>
      <p className="text-sm text-zinc-600 mt-2">Chiedi all'impresa un nuovo link.</p></div></main>
  );
  if (!d) return <main className="min-h-screen grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-zinc-400" aria-label="Caricamento" /></main>;

  const { impresa: p, lavoro: w } = d;
  const pct = Math.round(w.avanzamento || 0);

  return (
    <main className="min-h-screen bg-zinc-100 pb-10">
      <header className="brushed text-white">
        <div className="max-w-4xl mx-auto px-5 py-8 sm:py-10">
          <div className="flex items-center gap-3">
            {p.logo_url ? <img src={p.logo_url} alt="" className="h-10 max-w-[140px] object-contain bg-white rounded-lg p-1" /> : null}
            <p className="text-sm text-zinc-300">{p.ragione_sociale}</p>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-400 mt-6">{STATI[w.stato] || "Il tuo cantiere"}</p>
          <h1 className="font-display text-3xl sm:text-5xl font-bold uppercase leading-[0.95] mt-2">{w.nome}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-sm text-zinc-300">
            {w.indirizzo && <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4" aria-hidden="true" />{w.indirizzo}</span>}
            {(w.data_inizio || w.data_fine_prevista) && <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4" aria-hidden="true" />{fmt(w.data_inizio)}{w.data_fine_effettiva || w.data_fine_prevista ? ` → ${fmt(w.data_fine_effettiva || w.data_fine_prevista)}` : ""}</span>}
          </div>
          <div className="mt-7 max-w-xl">
            <div className="flex items-baseline justify-between"><span className="text-sm text-zinc-300">Avanzamento dei lavori</span><span className="font-display text-4xl font-bold tabular-nums">{pct}%</span></div>
            <div className="h-2.5 rounded-full bg-white/10 mt-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundImage: "var(--metal-red)" }} /></div>
            <p className="text-xs text-zinc-400 mt-2">Aggiornato il {fmt(w.aggiornato)}</p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-5 -mt-4 space-y-4">
        {w.fasi?.length > 0 && (
          <Section icon={ClipboardList} title="Fasi del lavoro">
            <ul className="space-y-3">
              {w.fasi.map((f) => (
                <li key={f.nome}>
                  <div className="flex justify-between text-sm"><span className="text-zinc-800">{f.nome}</span><span className="tabular-nums font-medium">{Math.round(f.completamento || 0)}%</span></div>
                  <div className="h-1.5 rounded-full bg-zinc-100 mt-1 overflow-hidden"><div className={`h-full rounded-full ${f.completamento >= 100 ? "bg-emerald-500" : "bg-zinc-900"}`} style={{ width: `${Math.min(100, f.completamento || 0)}%` }} /></div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {d.foto.length > 0 && (
          <Section icon={Camera} title={`Foto (${d.foto.length})`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {d.foto.map((f, i) => (
                <button key={i} type="button" onClick={() => setZoom(f)} className="relative rounded-xl overflow-hidden aspect-square bg-zinc-100 group">
                  <img src={f.url} alt={f.didascalia || `Foto ${i + 1}`} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <span className="absolute bottom-1 left-1 text-[10px] font-semibold uppercase bg-black/60 text-white rounded px-1.5 py-0.5">{f.fase}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {d.diario.length > 0 && (
          <Section icon={ClipboardList} title="Diario dei lavori">
            <ol className="space-y-3">
              {d.diario.map((l, i) => (
                <li key={i} className="flex gap-3 text-sm"><span className="text-zinc-500 tabular-nums w-24 shrink-0">{new Date(l.data).toLocaleDateString("it-IT")}</span><span className="text-zinc-800">{l.attivita}{l.meteo ? <span className="text-zinc-500"> · {l.meteo}</span> : null}</span></li>
              ))}
            </ol>
          </Section>
        )}

        {d.documenti.length > 0 && (
          <Section icon={FileText} title="Documenti">
            <ul className="divide-y divide-zinc-100">
              {d.documenti.map((doc, i) => (
                <li key={i}><a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2.5 hover:text-brand-700"><FileText className="w-4 h-4 text-zinc-400" aria-hidden="true" /><span className="flex-1 text-sm">{doc.titolo}</span><Download className="w-4 h-4 text-zinc-400" aria-hidden="true" /></a></li>
              ))}
            </ul>
          </Section>
        )}

        {d.pagamenti && (
          <Section icon={FileText} title="Pagamenti">
            <p className="text-sm text-zinc-700">Versato {eur(d.pagamenti.incassato)} su {eur(d.pagamenti.totale)}</p>
            <ul className="mt-2 text-sm divide-y divide-zinc-100">{d.pagamenti.rate.map((r, i) => <li key={i} className="py-1.5 flex justify-between"><span>{r.descrizione}{r.scadenza ? <span className="text-zinc-500"> · {fmt(r.scadenza)}</span> : null}</span><span className="tabular-nums">{eur(r.importo)}</span></li>)}</ul>
          </Section>
        )}

        <Section icon={Phone} title="Contatti dell'impresa">
          <p className="text-sm font-medium text-zinc-900">{p.ragione_sociale}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {p.telefono && <a href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-zinc-950 text-white text-sm font-semibold"><Phone className="w-4 h-4" aria-hidden="true" />Chiama</a>}
            {p.email && <a href={`mailto:${p.email}?subject=${encodeURIComponent(w.nome)}`} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-zinc-200 text-sm font-semibold"><Mail className="w-4 h-4" aria-hidden="true" />Scrivi</a>}
          </div>
        </Section>
        <p className="text-center text-xs text-zinc-500">Pagina riservata al committente · gestita con Talo · <a href="/legal/privacy" className="underline">Privacy</a></p>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4" onClick={() => setZoom(null)} role="dialog" aria-modal="true" aria-label="Foto ingrandita">
          <button type="button" className="absolute top-4 right-4 text-white" aria-label="Chiudi"><X className="w-7 h-7" /></button>
          <figure className="max-w-4xl"><img src={zoom.url} alt={zoom.didascalia || ""} className="max-h-[80vh] rounded-lg" />{zoom.didascalia && <figcaption className="text-white text-sm mt-2 text-center">{zoom.didascalia}</figcaption>}</figure>
        </div>
      )}
    </main>
  );
}
