import React, { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { DetailCard } from "@/components/shared/DetailLayout";
import { fmtDate } from "@/lib/worksites";
import { fmtEur } from "@/lib/quotes";

/**
 * Entrate (incassi) e uscite (acquisti di materiali, noli, subappalti, pagamenti) di un lavoro, con il saldo.
 * compact: solo totali e ultimi movimenti (Panoramica); altrimenti l'elenco completo delle uscite.
 */
export default function WorksiteCashFlow({ income = [], transactions = [], compact = false, onOpenAll }) {
  const uscite = useMemo(() => transactions.filter((t) => t.tipo === "uscita").sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))), [transactions]);
  const entrate = useMemo(() => [...income].sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))), [income]);
  const totIn = entrate.reduce((s, x) => s + (Number(x.importo) || 0), 0);
  const totOut = uscite.reduce((s, x) => s + (Number(x.importo) || 0), 0);
  const saldo = totIn - totOut;
  const perCat = useMemo(() => {
    const m = {};
    for (const u of uscite) m[u.categoria || "Altro"] = (m[u.categoria || "Altro"] || 0) + (Number(u.importo) || 0);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [uscite]);
  const movimenti = useMemo(() => [
    ...entrate.map((x) => ({ ...x, _in: true })),
    ...uscite.map((x) => ({ ...x, _in: false })),
  ].sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))), [entrate, uscite]);

  const row = (m, i) => (
    <li key={m.id || i} className="py-2 flex items-center gap-3">
      <span className={`grid place-items-center w-7 h-7 rounded-full shrink-0 ${m._in ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
        {m._in ? <ArrowDownLeft className="w-4 h-4" aria-hidden="true" /> : <ArrowUpRight className="w-4 h-4" aria-hidden="true" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-zinc-900 truncate">{m.descrizione || m.note || (m._in ? "Incasso" : m.categoria || "Uscita")}</span>
        <span className="block text-xs text-zinc-500 truncate">{[fmtDate(m.data), m._in ? m.metodo : [m.categoria, m.fornitore].filter(Boolean).join(" · ")].filter(Boolean).join(" · ")}</span>
      </span>
      <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${m._in ? "text-emerald-700" : "text-red-700"}`}>{m._in ? "+" : "−"}{fmtEur(m.importo)}</span>
    </li>
  );

  return (
    <DetailCard icon={Wallet} title={compact ? "Entrate e uscite" : "Uscite del lavoro"} action={compact && onOpenAll ? <button type="button" onClick={onOpenAll} className="text-xs font-medium text-brand-700 hover:underline">Tutti i movimenti</button> : null}>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-emerald-50 p-2.5"><p className="text-[11px] text-emerald-900">Entrate</p><p className="font-bold tabular-nums text-emerald-800">{fmtEur(totIn)}</p></div>
        <div className="rounded-lg bg-red-50 p-2.5"><p className="text-[11px] text-red-900">Uscite</p><p className="font-bold tabular-nums text-red-800">{fmtEur(totOut)}</p></div>
        <div className="rounded-lg bg-zinc-50 p-2.5"><p className="text-[11px] text-zinc-700">Saldo di cassa</p><p className={`font-bold tabular-nums ${saldo < 0 ? "text-red-700" : "text-zinc-900"}`}>{fmtEur(saldo)}</p></div>
      </div>
      {!compact && perCat.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {perCat.map(([k, v]) => <span key={k} className="text-xs rounded-full bg-zinc-100 text-zinc-700 px-2.5 py-1">{k}: <b className="tabular-nums">{fmtEur(v)}</b></span>)}
        </div>
      )}
      {(compact ? movimenti.slice(0, 6) : uscite.map((x) => ({ ...x, _in: false }))).length === 0
        ? <p className="text-sm text-zinc-500">{compact ? "Nessun movimento registrato. Incassi, acquisti di materiali e pagamenti compaiono qui." : "Nessuna uscita registrata: acquisti, bolle e pagamenti si aggiungono da «Costi e margine» o caricando una bolla."}</p>
        : <ul className="divide-y divide-zinc-100">{(compact ? movimenti.slice(0, 6) : uscite.map((x) => ({ ...x, _in: false }))).map(row)}</ul>}
    </DetailCard>
  );
}
