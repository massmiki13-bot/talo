import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { Mail, ChevronDown, Receipt, HardHat, CheckCircle2, Clock } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import ComposeDialog from "@/components/email/ComposeDialog";
import { DetailCard } from "@/components/shared/DetailLayout";
import { buildReceivables, bucketOf, BUCKETS, TONI, reminderText } from "@/lib/receivables";

const eur = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Number(v) || 0);
const fmt = (d) => (d ? new Date(d).toLocaleDateString("it-IT") : "");

export default function Scadenzario() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [compose, setCompose] = useState(null);
  const [filter, setFilter] = useState("tutti");

  const load = useCallback(async () => {
    const safe = (p) => p.catch(() => []);
    const [worksites, payments, transactions, invoices, contacts, profiles] = await Promise.all([
      safe(db.Worksite.list("-created_date", 2000)), safe(db.WorksitePayment.list("-data", 20000)), safe(db.WorksiteTransaction.filter({ tipo: "entrata" }, "-data", 20000)),
      safe(db.Invoice.list("-data", 5000)), safe(db.Contact.fields(["nome", "nome_privato", "email", "pec"], { limit: 10000 })), safe(db.CompanyProfile.list()),
    ]);
    setData({ worksites, invoices, profile: profiles[0] || null, rows: buildReceivables({ worksites, payments, transactions, invoices, contacts }) });
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data?.rows || []).filter((r) => filter === "tutti" || (filter === "scaduti" ? r.giorni < 0 : r.kind === filter)), [data, filter]);
  const totals = useMemo(() => {
    const t = { tot: 0, scaduto: 0, entro30: 0 };
    for (const r of data?.rows || []) { t.tot += r.importo; if (r.giorni < 0) t.scaduto += r.importo; else if (r.giorni <= 30) t.entro30 += r.importo; }
    return t;
  }, [data]);

  const openReminder = (r, tono) => {
    const { subject, body } = reminderText(r, tono, data.profile);
    setCompose({
      row: r,
      props: {
        defaultTo: r.email, defaultSubject: subject, defaultBody: body,
        context: `Sollecito di pagamento (${TONI.find((t) => t.key === tono)?.label}) a ${r.cliente_nome || "cliente"} per ${r.titolo} di ${eur(r.importo)}, scadenza ${fmt(r.scadenza)}${r.giorni < 0 ? `, scaduta da ${Math.abs(r.giorni)} giorni` : ""}. Solleciti già inviati: ${r.solleciti.length}.`,
        links: { contact_id: r.cliente_id || undefined, worksite_id: r.worksite_id || undefined },
      },
    });
  };

  // Registra la data del sollecito sulla fattura o sulla rata del lavoro.
  const markSent = async (r) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (r.kind === "fattura") await db.Invoice.update(r.id, { solleciti: [...(r.rif?.solleciti || []), today] });
      else {
        const w = data.worksites.find((x) => x.id === r.id);
        if (w && r.rata_index >= 0) await db.Worksite.update(w.id, { piano_pagamenti: w.piano_pagamenti.map((x, i) => (i === r.rata_index ? { ...x, solleciti: [...(x.solleciti || []), today] } : x)) });
      }
      load();
    } catch (e) { toast({ title: "Sollecito inviato, ma non registrato", description: e.message, variant: "destructive" }); }
  };

  if (!data) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <PageHeader title="Scadenzario incassi" subtitle="Rate dei lavori e fatture ancora da incassare, in ordine di scadenza, con il sollecito già pronto da inviare." />

      <div className="grid sm:grid-cols-3 gap-3">
        {[["Da incassare", totals.tot, "text-zinc-950"], ["Già scaduto", totals.scaduto, totals.scaduto ? "text-red-700" : "text-zinc-950"], ["In scadenza entro 30 giorni", totals.entro30, "text-amber-800"]].map(([l, v, c]) => (
          <div key={l} className="bg-white rounded-2xl border border-zinc-200 p-4"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{l}</p><p className={`font-display text-3xl font-bold tabular-nums mt-1 ${c}`}>{eur(v)}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtra">
        {[["tutti", "Tutto"], ["scaduti", "Scaduti"], ["fattura", "Fatture"], ["rata", "Rate dei lavori"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1.5 text-sm ${filter === k ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>{l}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 py-14 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" aria-hidden="true" />
          <p className="font-semibold text-zinc-900 mt-3">Niente da incassare</p>
          <p className="text-sm text-zinc-500 mt-1">Le rate si impostano nei lavori (Incassi → piano pagamenti), le fatture emesse compaiono da sole.</p>
        </div>
      ) : BUCKETS.map((b) => {
        const list = rows.filter((r) => bucketOf(r) === b.key);
        if (!list.length) return null;
        return (
          <DetailCard key={b.key} title={<span className={b.cls}>{b.label} · {eur(list.reduce((s, r) => s + r.importo, 0))}</span>}>
            <ul className="divide-y divide-zinc-100 -my-2">
              {list.map((r) => (
                <li key={r.key} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className={`grid place-items-center w-9 h-9 rounded-lg shrink-0 ${r.kind === "fattura" ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}>{r.kind === "fattura" ? <Receipt className="w-4 h-4" aria-hidden="true" /> : <HardHat className="w-4 h-4" aria-hidden="true" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900 truncate">
                      {r.cliente_id ? <Link to={`/contatti/${r.cliente_id}`} className="inline-block py-1 hover:underline">{r.cliente_nome || "Cliente"}</Link> : r.cliente_nome || "Cliente"}
                      <span className="font-normal text-zinc-600"> · {r.titolo}{r.parziale ? " (in parte pagata)" : ""}</span>
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {r.worksite_id ? <Link to={`/lavori/${r.worksite_id}`} className="inline-block py-1 hover:underline">{r.worksite_nome}</Link> : r.descrizione}
                      {r.solleciti.length > 0 && <span className="text-amber-800"> · {r.solleciti.length} {r.solleciti.length === 1 ? "sollecito" : "solleciti"}, ultimo il {fmt(r.solleciti.at(-1))}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-zinc-900">{eur(r.importo)}</p>
                    <p className={`text-xs tabular-nums flex items-center justify-end gap-1 ${r.giorni < 0 ? "text-red-700" : "text-zinc-500"}`}><Clock className="w-3 h-3" aria-hidden="true" />{r.giorni < 0 ? `scaduta da ${Math.abs(r.giorni)} gg` : r.giorni === 0 ? "scade oggi" : `tra ${r.giorni} gg`} · {fmt(r.scadenza)}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="sm" variant={r.giorni < 0 ? "default" : "outline"} className={`gap-1.5 ${r.giorni < 0 ? "bg-brand-600 hover:bg-brand-700" : ""}`}><Mail className="w-4 h-4" />Sollecita<ChevronDown className="w-3.5 h-3.5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {TONI.map((t, i) => <DropdownMenuItem key={t.key} onClick={() => openReminder(r, t.key)}>{t.label}{i === Math.min(2, r.solleciti.length) ? " (consigliato)" : ""}</DropdownMenuItem>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </DetailCard>
        );
      })}

      {compose && <ComposeDialog open onOpenChange={(v) => !v && setCompose(null)} {...compose.props} onSent={() => markSent(compose.row)} />}
    </div>
  );
}
