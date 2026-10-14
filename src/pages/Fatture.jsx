import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmDialog } from "@/components/shared/ConfirmHost";
import { Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  Receipt, Plus, ArrowLeft, FileDown, FileCode2, Copy, Check, Mail, Sparkles, Loader2, Trash2, AlertTriangle, CheckCircle2, Search, Euro, Clock, Landmark, FileText, HardHat, X, RotateCcw, ExternalLink, ChevronDown,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import ComposeDialog from "@/components/email/ComposeDialog";
import { UNIT_OPTIONS, fmtEur, isVoce } from "@/lib/quotes";
import { TIPI_DOC, REGIMI, ALIQUOTE, ALIQUOTE_GROUPS, PAGAMENTI, STATI, aliquotaOf, lineTotal, computeInvoice, createNumbered, validateInvoice, buildFatturaXml, aiSuggestVat } from "@/lib/invoices";
import { buildInvoicePdf } from "@/lib/invoicePdf";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (s, d) => { const x = new Date(s); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const clientName = (c) => c?.nome || c?.nome_privato || "Cliente";
const emptyRow = (key = "22") => ({ descrizione: "", quantita: 1, unita_misura: "cad", prezzo_unitario: 0, sconto: 0, aliquota_key: key });
const downloadText = (text, name, type) => { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); };

export default function Fatture() {
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [ctx, setCtx] = useState({ profile: null, contacts: [], quotes: [], worksites: [] });
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(() => new URLSearchParams(window.location.search).get("id"));
  const [query, setQuery] = useState("");
  const [stato, setStato] = useState("all");
  const [anno, setAnno] = useState(String(new Date().getFullYear()));
  const [fromQuote, setFromQuote] = useState(false);
  const [fromJob, setFromJob] = useState(false);

  const load = useCallback(async () => {
    const safe = (p) => p.catch(() => []);
    const [inv, prof, c, q, w] = await Promise.all([safe(db.Invoice.list("-data", 5000)), safe(db.CompanyProfile.list()), safe(db.Contact.list()), safe(db.Quote.fields(["numero", "data", "stato", "cliente_id", "cliente_nome", "oggetto", "imponibile", "totale", "worksite_id", "worksite_nome"], { sort: "-data", limit: 5000 })), safe(db.Worksite.list("-created_date"))]);
    setList(inv); setCtx({ profile: prof[0] || null, contacts: c, quotes: q, worksites: w });
    setLoading(false);
    return inv;
  }, []);
  useEffect(() => {
    load().then(async (inv) => {
      const p = new URLSearchParams(window.location.search);
      if (p.get("da_preventivo") || p.get("da_lavoro")) window.history.replaceState(null, "", "/fatture");
      if (p.get("da_preventivo")) { const q = (await db.Quote.get(p.get("da_preventivo")).catch(() => null)); if (q) createFrom({ quote: q }, inv); }
      if (p.get("da_lavoro") && p.get("rata") != null) {
        // SAL o rata scelta dal lavoro: fattura compilata subito
        const w = await db.Worksite.get(p.get("da_lavoro")).catch(() => null);
        const r = w?.piano_pagamenti?.[Number(p.get("rata"))];
        if (w && r) { createFrom({ worksite: w, rata: r }, inv); return; }
      }
      if (p.get("da_lavoro")) setFromJob(p.get("da_lavoro"));
    });
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id) => {
    setOpenId(id);
    const u = new URL(window.location.href);
    id ? u.searchParams.set("id", id) : u.searchParams.delete("id");
    window.history.replaceState(null, "", u);
  };

  const createFrom = async ({ quote, worksite, rata } = {}, current = list) => {
    const profile = ctx.profile || (await db.CompanyProfile.list())[0];
    const y = new Date().getFullYear();
    const regime = profile?.regime_fiscale || "RF01";
    const defKey = regime === "RF19" ? "N2.2" : "22";
    let righe = [emptyRow(defKey)];
    let extra = {};
    if (quote && !quote.righe) quote = await db.Quote.get(quote.id);
    if (quote) {
      righe = (quote.righe || []).filter((r) => isVoce(r) && !r.opzionale && (r.descrizione || Number(r.prezzo_unitario))).map((r) => ({
        descrizione: r.descrizione, quantita: Number(r.quantita) || 1, unita_misura: r.unita_misura || "cad", prezzo_unitario: Number(r.prezzo_unitario) || 0,
        sconto: Number(r.sconto) || 0, aliquota_key: regime === "RF19" ? "N2.2" : String(r.iva_percentuale ?? 22),
      }));
      if (Number(quote.sconto_globale)) righe.push({ descrizione: `Sconto ${quote.sconto_globale}%`, quantita: 1, unita_misura: "cad", prezzo_unitario: -Math.round((righe.reduce((s, r) => s + lineTotal(r), 0) * Number(quote.sconto_globale)) / 100 * 100) / 100, sconto: 0, aliquota_key: righe[0]?.aliquota_key || defKey });
      extra = { preventivo_id: quote.id, cliente_id: quote.cliente_id || "", cliente_nome: quote.cliente_nome || "", oggetto: quote.oggetto ? `Preventivo n. ${quote.numero} – ${quote.oggetto}` : "", worksite_id: quote.worksite_id || "", worksite_nome: quote.worksite_nome || "" };
    }
    if (worksite) {
      // IVA del lavoro: quella del preventivo collegato, altrimenti l'ordinaria. Le rate sono IVA inclusa:
      // l'imponibile si ricava in modo che il totale della fattura coincida con la rata.
      let key = defKey;
      if (regime !== "RF19" && worksite.preventivo_id) {
        const q = await db.Quote.get(worksite.preventivo_id).catch(() => null);
        const v = (q?.righe || []).find((r) => isVoce(r) && !r.opzionale);
        if (v && ["22", "10", "5", "4"].includes(String(v.iva_percentuale))) key = String(v.iva_percentuale);
      }
      const aliq = aliquotaOf(key).aliquota;
      const r2 = (x) => Math.round(x * 100) / 100;
      const imp = r2((Number(rata?.importo) || 0) / (1 + aliq / 100));
      let salText = "";
      const where = `lavori "${worksite.nome}"${worksite.indirizzo ? `, ${worksite.indirizzo}` : ""}`;
      if (rata?.sal && rata.fasi?.length) {
        // una riga per ogni fase avanzata dal SAL precedente, con l'importo ripartito per peso × avanzamento
        const prevOf = (nome) => Number(rata.fasi_prec?.find((p) => p.nome === nome)?.completamento) || 0;
        const deltas = rata.fasi.map((f) => ({ ...f, da: prevOf(f.nome), quota: (Number(f.peso) || 0) * Math.max(0, (Number(f.completamento) || 0) - prevOf(f.nome)) })).filter((f) => f.quota > 0);
        const totQuota = deltas.reduce((s, f) => s + f.quota, 0);
        righe = [];
        salText = `Stato di avanzamento lavori n. ${rata.sal_numero || ""} al ${rata.avanzamento ?? ""}% – ${where}. Importo contrattuale IVA inclusa ${fmtEur(rata.importo_contratto || worksite.importo_totale || 0)}.`;
        let resto = imp;
        deltas.forEach((f, i) => {
          const val = i === deltas.length - 1 ? r2(resto) : r2((imp * f.quota) / totQuota);
          resto -= val;
          righe.push({ descrizione: `${f.nome}: avanzamento dal ${f.da}% al ${f.completamento}%`, quantita: 1, unita_misura: "corpo", prezzo_unitario: val, sconto: 0, aliquota_key: key });
        });
        if (!deltas.length) righe.push({ descrizione: `${rata.descrizione} – ${where}`, quantita: 1, unita_misura: "corpo", prezzo_unitario: imp, sconto: 0, aliquota_key: key });
      } else {
        righe = [{ descrizione: `${rata?.descrizione || "Acconto"} – ${where}`, quantita: 1, unita_misura: "corpo", prezzo_unitario: imp, sconto: 0, aliquota_key: key }];
      }
      extra = { cliente_id: worksite.cliente_id || "", cliente_nome: worksite.cliente_nome || "", oggetto: salText || `${rata?.descrizione || "Acconto"} – ${worksite.nome}`, worksite_id: worksite.id, worksite_nome: worksite.nome, rata_rif: rata?.descrizione || "" };
    }
    const inv = await createNumbered(db.Invoice, {
      tipo_documento: "TD01", data: today(), scadenza: addDays(today(), 30), regime, stato: "bozza",
      modalita_pagamento: "MP05", iban: profile?.iban || "", bollo: "auto", split_payment: false, righe, ...extra,
    }, y);
    setList((l) => [inv, ...l]);
    setFromQuote(false); setFromJob(false);
    open(inv.id);
  };

  const years = useMemo(() => [...new Set([new Date().getFullYear(), ...list.map((i) => Number(i.anno)).filter(Boolean)])].sort((a, b) => b - a), [list]);
  const kpi = useMemo(() => {
    const y = Number(anno);
    const qStart = new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
    let fatturato = 0, daIncassare = 0, scadute = 0, iva = 0;
    for (const i of list.filter((x) => x.stato !== "bozza")) {
      const c = computeInvoice(i);
      const sign = i.tipo_documento === "TD04" ? -1 : 1;
      if (Number(i.anno) === y) fatturato += sign * c.imponibile;
      if (i.stato !== "pagata" && i.tipo_documento !== "TD04") { daIncassare += c.daPagare; if (i.scadenza && i.scadenza < today()) scadute++; }
      if (i.data >= qStart && !c.splitPayment) iva += sign * c.iva;
    }
    return { fatturato, daIncassare, scadute, iva };
  }, [list, anno]);

  const q = query.trim().toLowerCase();
  const shown = list.filter((i) => String(i.anno) === anno && (stato === "all" || (stato === "scadute" ? i.stato !== "pagata" && i.stato !== "bozza" && i.scadenza < today() : i.stato === stato)) && (!q || [i.numero, i.cliente_nome, i.oggetto].some((v) => String(v || "").toLowerCase().includes(q))));

  if (loading) return <LoadingSpinner />;
  const current = list.find((i) => i.id === openId);
  if (current) return <Editor inv={current} all={list} ctx={ctx} onBack={() => { open(null); load(); }} onChange={(u) => setList((l) => l.map((x) => (x.id === u.id ? u : x)))} onCreated={(x) => { setList((l) => [x, ...l]); open(x.id); }} onDeleted={(id) => { setList((l) => l.filter((x) => x.id !== id)); open(null); }} />;

  const accepted = ctx.quotes.filter((x) => x.stato === "approvato" && !list.some((i) => i.preventivo_id === x.id));

  return (
    <div className="space-y-5">
      <PageHeader title="Fatture" subtitle="Compila la fattura in pochi clic e scarica il file XML ufficiale (FatturaPA) da caricare sul tuo programma di fatturazione o sul portale dell'Agenzia delle Entrate.">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button className="bg-brand-600 hover:bg-brand-700 gap-2"><Plus className="w-4 h-4" /> Nuova fattura <ChevronDown className="w-4 h-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => setFromQuote(true)}><FileText className="w-4 h-4 mr-2" /> Da un preventivo accettato{accepted.length ? ` (${accepted.length})` : ""}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFromJob(true)}><HardHat className="w-4 h-4 mr-2" /> Acconto / SAL di un lavoro</DropdownMenuItem>
            <DropdownMenuItem onClick={() => createFrom()}><Receipt className="w-4 h-4 mr-2" /> Fattura vuota</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icon={Euro} label={`Fatturato ${anno} (imponibile)`} value={fmtEur(kpi.fatturato)} tone="text-brand-600" />
        <Kpi icon={Clock} label="Da incassare" value={fmtEur(kpi.daIncassare)} tone="text-amber-700" />
        <Kpi icon={AlertTriangle} label="Fatture scadute" value={kpi.scadute} tone={kpi.scadute ? "text-red-700" : "text-zinc-500"} onClick={() => setStato("scadute")} />
        <Kpi icon={Landmark} label="IVA a debito nel trimestre" value={fmtEur(kpi.iva)} tone="text-violet-600" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-zinc-200 bg-white p-0.5">
          {[["all", "Tutte"], ["bozza", "Bozze"], ["emessa", "Emesse"], ["inviata", "Inviate"], ["pagata", "Pagate"], ["scadute", "Scadute"]].map(([k, l]) => (
            <button key={k} onClick={() => setStato(k)} className={`px-3 h-8 rounded-md text-sm ${stato === k ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"}`}>{l}</button>
          ))}
        </div>
        <Select value={anno} onValueChange={setAnno}>
          <SelectTrigger aria-label="Anno" className="w-24 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Numero, cliente, oggetto" className="pl-8 h-9" />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-zinc-300 py-14 px-6 text-center">
          <Receipt className="w-10 h-10 text-zinc-300 mx-auto" />
          <p className="mt-3 font-semibold text-zinc-900">{list.length ? "Nessuna fattura con questi filtri" : "Nessuna fattura ancora"}</p>
          <p className="text-sm text-zinc-500 mt-1 max-w-lg mx-auto">Parti da un preventivo accettato o dalla rata di un lavoro: cliente, righe e IVA si compilano da soli. Poi scarichi l'XML e lo carichi dove fatturi di solito.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
          {shown.map((i) => {
            const c = computeInvoice(i);
            const late = i.stato !== "pagata" && i.stato !== "bozza" && i.scadenza && i.scadenza < today();
            return (
              <button key={i.id} onClick={() => open(i.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                <div className="w-20 shrink-0"><p className="text-sm font-semibold text-zinc-900 tabular-nums">{i.numero}</p><p className="text-xs text-zinc-500">{new Date(i.data).toLocaleDateString("it-IT")}</p></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{i.cliente_nome || "Cliente da scegliere"}{i.tipo_documento === "TD04" && <span className="ml-2 text-xs text-red-700">nota di credito</span>}</p>
                  <p className="text-xs text-zinc-500 truncate">{i.oggetto || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums text-zinc-900">{fmtEur(c.totale)}</p>
                  <p className={`text-xs ${late ? "text-red-700 font-medium" : "text-zinc-500"}`}>{i.stato === "pagata" ? `pagata${i.data_pagamento ? ` il ${new Date(i.data_pagamento).toLocaleDateString("it-IT")}` : ""}` : i.scadenza ? `scade ${new Date(i.scadenza).toLocaleDateString("it-IT")}` : ""}</p>
                </div>
                <span className={`hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${(STATI[i.stato] || STATI.bozza).className}`}>{(STATI[i.stato] || STATI.bozza).label}</span>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={fromQuote} onOpenChange={setFromQuote}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Fattura da preventivo</DialogTitle><DialogDescription>Preventivi accettati non ancora fatturati.</DialogDescription></DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto -mx-2">
            {accepted.length === 0 && <p className="text-sm text-zinc-500 p-3">Nessun preventivo accettato da fatturare.</p>}
            {accepted.map((x) => (
              <button key={x.id} onClick={() => createFrom({ quote: x })} className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50">
                <FileText className="w-4 h-4 text-zinc-500" />
                <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-zinc-900 truncate">N. {x.numero} · {x.cliente_nome}</span><span className="block text-xs text-zinc-500 truncate">{x.oggetto}</span></span>
                <span className="text-sm tabular-nums">{fmtEur(x.imponibile)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fromJob} onOpenChange={(v) => !v && setFromJob(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Acconto o SAL di un lavoro</DialogTitle><DialogDescription>Scegli la rata del piano pagamenti da fatturare.</DialogDescription></DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto -mx-2 space-y-3">
            {ctx.worksites.filter((w) => (typeof fromJob === "string" ? w.id === fromJob : w.stato !== "finito")).map((w) => (
              <div key={w.id} className="px-2">
                <p className="text-sm font-semibold text-zinc-900">{w.nome} <span className="font-normal text-zinc-500">· {w.cliente_nome || "—"}</span></p>
                <div className="mt-1 space-y-0.5">
                  {(w.piano_pagamenti || []).map((r, k) => {
                    const done = list.some((i) => i.worksite_id === w.id && i.rata_rif === (r.descrizione || ""));
                    return (
                      <button key={k} onClick={() => createFrom({ worksite: w, rata: r })} className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-50 text-sm">
                        <span className="flex-1">{r.descrizione || `Rata ${k + 1}`}{r.scadenza ? <span className="text-xs text-zinc-500"> · {new Date(r.scadenza).toLocaleDateString("it-IT")}</span> : null}</span>
                        {done && <span className="text-xs text-emerald-700">già fatturata</span>}
                        <span className="tabular-nums">{fmtEur(r.importo)}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => createFrom({ worksite: w, rata: { descrizione: "Acconto", importo: 0 } })} className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-50 text-sm text-brand-700">+ Importo libero</button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone, onClick }) {
  const T = onClick ? "button" : "div";
  return (
    <T onClick={onClick} className="bg-white rounded-2xl border border-zinc-200 p-4 text-left">
      <Icon className={`w-5 h-5 ${tone}`} />
      <p className="text-xl font-bold tabular-nums text-zinc-900 mt-2 truncate">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </T>
  );
}

/* ───────────────────────── Editor ───────────────────────── */

function Editor({ inv, all, ctx, onBack, onChange, onCreated, onDeleted }) {
  const { toast } = useToast();
  const [f, setF] = useState(inv);
  const [save, setSave] = useState("saved");
  const [busy, setBusy] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const [compose, setCompose] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [vatNotes, setVatNotes] = useState({});
  const first = useRef(true);
  const locked = f.stato !== "bozza";
  const clients = ctx.contacts.filter((c) => c.tipo !== "fornitore");
  const client = ctx.contacts.find((c) => c.id === f.cliente_id);
  const c = computeInvoice(f);
  const errors = validateInvoice(f, ctx.profile, client);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSave("dirty");
    const t = setTimeout(async () => {
      setSave("saving");
      const { id, created_date, updated_date, created_by_id, ...data } = f;  
      try { onChange(await db.Invoice.update(inv.id, { ...data, imponibile: c.imponibile, iva_totale: c.iva, totale: c.totale })); setSave("saved"); }
      catch { setSave("error"); }
    }, 900);
    return () => clearTimeout(t);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setRow = (i, patch) => setF((x) => ({ ...x, righe: x.righe.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { console.error(e); toast({ title: e.message || "Operazione non riuscita", variant: "destructive" }); } finally { setBusy(""); } };

  const xml = () => buildFatturaXml({ ...f, progressivo_invio: f.progressivo_invio }, ctx.profile, client);
  const ensureValid = () => {
    if (!errors.length) return true;
    toast({ title: "Mancano dei dati per la fattura elettronica", description: errors[0], variant: "destructive" });
    return false;
  };
  const downloadXml = () => {
    if (!ensureValid()) return;
    const x = xml();
    if (!f.progressivo_invio) set("progressivo_invio", x.progressivo);
    downloadText(x.xml, x.fileName, "application/xml");
    if (f.stato === "bozza") set("stato", "emessa");
    toast({ title: "File XML scaricato", description: "Caricalo sul tuo programma di fatturazione o su \"Fatture e Corrispettivi\" dell'Agenzia delle Entrate." });
  };
  const pdf = (mode) => run("pdf", async () => {
    const doc = await buildInvoicePdf(f, ctx.profile, client);
    const name = `Fattura_${String(f.numero).replace(/\W+/g, "-")}.pdf`;
    if (mode === "download") doc.save(name);
    if (mode === "email") {
      const attachments = [];
      if (!errors.length) {
        const x = xml();
        const { file_url } = await api.integrations.Core.UploadFile({ file: new File([x.xml], x.fileName, { type: "application/xml" }), private: true });
        attachments.push({ url: file_url, name: x.fileName });
      }
      setCompose({
        defaultTo: client?.email || "", attachment: { blob: doc.output("blob"), filename: name }, attachments,
        defaultSubject: `Fattura n. ${f.numero} del ${new Date(f.data).toLocaleDateString("it-IT")} – ${ctx.profile?.ragione_sociale || ""}`,
        defaultBody: `Buongiorno,\n\nin allegato la copia di cortesia della fattura n. ${f.numero} di ${fmtEur(c.daPagare)}${f.scadenza ? `, con scadenza il ${new Date(f.scadenza).toLocaleDateString("it-IT")}` : ""}.\nL'originale le arriva tramite il Sistema di Interscambio.\n\nCordiali saluti`,
        links: { contact_id: f.cliente_id || undefined, worksite_id: f.worksite_id || undefined },
      });
    }
  });

  const suggestVat = () => run("vat", async () => {
    const res = await aiSuggestVat({ righe: f.righe, cliente: client, oggetto: f.oggetto });
    const notes = {};
    setF((x) => ({ ...x, righe: x.righe.map((r, i) => { const s = res?.righe?.find((z) => Number(z.n) === i); if (s && ALIQUOTE.some((a) => a.key === s.key)) { notes[i] = s.motivo; return { ...r, aliquota_key: s.key }; } return r; }) }));
    setVatNotes(notes);
    toast({ title: "Aliquote aggiornate dall'IA", description: res?.nota || "Controlla il motivo sotto ogni riga." });
  });

  const markPaid = (data, registra) => run("pay", async () => {
    set("stato", "pagata"); set("data_pagamento", data);
    if (registra && f.worksite_id) {
      await db.WorksitePayment.create({ worksite_id: f.worksite_id, worksite_nome: f.worksite_nome || "", cliente_id: f.cliente_id || "", cliente_nome: f.cliente_nome || "", importo: c.daPagare, data, tipo: "incasso", metodo: PAGAMENTI.find((p) => p.value === f.modalita_pagamento)?.label || "Bonifico", note: `Fattura n. ${f.numero}` });
    }
    setPayOpen(false);
    toast({ title: "Fattura pagata", description: registra && f.worksite_id ? "Incasso registrato anche nel lavoro." : undefined });
  });

  const creditNote = () => run("nc", async () => {
    const { id, created_date, updated_date, created_by_id, numero, stato, data_pagamento, progressivo_invio, ...rest } = f;  
    const x = await createNumbered(db.Invoice, { ...rest, tipo_documento: "TD04", data: today(), stato: "bozza", fattura_collegata: f.numero, oggetto: `Storno fattura n. ${f.numero} del ${new Date(f.data).toLocaleDateString("it-IT")}` }, f.anno, "TD04");
    onCreated(x);
  });

  const remove = async () => {
    if (!(await confirmDialog(locked ? "Questa fattura è già stata emessa: eliminarla la toglie solo da Talo. Continuare?" : "Eliminare la bozza?"))) return;
    await db.Invoice.delete(inv.id);
    onDeleted(inv.id);
  };

  const fld = (k, label, props = {}) => (
    <div className={props.wide ? "sm:col-span-2" : ""}>
      <Label htmlFor={`i-${k}`} className="text-xs text-zinc-600">{label}</Label>
      <Input id={`i-${k}`} type={props.type || "text"} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} disabled={props.lock && locked} className="mt-1" />
    </div>
  );

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2"><ArrowLeft className="w-4 h-4" /> Fatture</Button>
        <h1 className="text-lg font-semibold text-zinc-900">{TIPI_DOC.find((t) => t.value === f.tipo_documento)?.label || "Fattura"} n. {f.numero}</h1>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${(STATI[f.stato] || STATI.bozza).className}`}>{(STATI[f.stato] || STATI.bozza).label}</span>
        <span className="text-xs text-zinc-500 ml-auto">{save === "saving" ? "Salvataggio…" : save === "dirty" ? "Modifiche…" : save === "error" ? "Errore di salvataggio" : "Salvato"}</span>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {locked && <p className="text-sm text-brand-900 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Fattura emessa: numero, data e righe sono bloccati. Per correggerla emetti una nota di credito. <button className="ml-auto underline" onClick={async () => (await confirmDialog("Rimettere la fattura in bozza? Fallo solo se non l'hai ancora trasmessa.")) && set("stato", "bozza")}>Riporta in bozza</button></p>}

          <section className="bg-white rounded-2xl border border-zinc-200 p-4 sm:p-5">
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="fatture-documento" className="text-xs text-zinc-600">Documento</Label>
                <Select value={f.tipo_documento || "TD01"} onValueChange={(v) => set("tipo_documento", v)} disabled={locked}>
                  <SelectTrigger id="fatture-documento" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPI_DOC.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {fld("numero", "Numero", { lock: true })}
              {fld("data", "Data", { type: "date", lock: true })}
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <div>
                <Label htmlFor="fatture-cliente" className="text-xs text-zinc-600">Cliente</Label>
                <Select value={f.cliente_id || undefined} onValueChange={(v) => { const x = ctx.contacts.find((k) => k.id === v); setF((p) => ({ ...p, cliente_id: v, cliente_nome: clientName(x) })); }} disabled={locked}>
                  <SelectTrigger id="fatture-cliente" className="mt-1"><SelectValue placeholder="Scegli il cliente" /></SelectTrigger>
                  <SelectContent>{clients.map((k) => <SelectItem key={k.id} value={k.id}>{clientName(k)}</SelectItem>)}</SelectContent>
                </Select>
                {client && (
                  <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                    {[client.partita_iva ? `P.IVA ${client.partita_iva}` : client.codice_fiscale ? `C.F. ${client.codice_fiscale}` : null, client.codice_sdi ? `SDI ${client.codice_sdi}` : client.pec ? `PEC ${client.pec}` : null, [client.cap, client.citta].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Dati fiscali mancanti"}
                    {" · "}<Link to={`/contatti/${client.id}`} className="text-brand-700 hover:underline">modifica scheda</Link>
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="fatture-regime-fiscale" className="text-xs text-zinc-600">Regime fiscale</Label>
                <Select value={f.regime || "RF01"} onValueChange={(v) => setF((x) => ({ ...x, regime: v, righe: v === "RF19" ? x.righe.map((r) => ({ ...r, aliquota_key: "N2.2" })) : x.righe }))} disabled={locked}>
                  <SelectTrigger id="fatture-regime-fiscale" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{REGIMI.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3"><Label htmlFor="fatture-oggetto-causale" className="text-xs text-zinc-600">Oggetto / causale</Label><Input id="fatture-oggetto-causale" value={f.oggetto || ""} onChange={(e) => set("oggetto", e.target.value)} className="mt-1" placeholder="es. Lavori di rifacimento copertura – SAL n. 1" /></div>
            {(f.preventivo_id || f.worksite_id) && (
              <p className="text-xs text-zinc-500 mt-2 flex gap-3">
                {f.preventivo_id && <Link to={`/preventivi/${f.preventivo_id}`} className="text-brand-700 hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Preventivo collegato</Link>}
                {f.worksite_id && <Link to={`/lavori/${f.worksite_id}`} className="text-brand-700 hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />{f.worksite_nome || "Lavoro"}</Link>}
              </p>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-zinc-200 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-zinc-900">Righe</h2>
              {!locked && <Button size="sm" variant="outline" onClick={suggestVat} disabled={busy === "vat" || !f.righe?.length} className="gap-1.5">{busy === "vat" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Aliquote IVA con IA</Button>}
            </div>
            <div className="space-y-2">
              {(f.righe || []).map((r, i) => (
                <div key={i} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex gap-2">
                    <Textarea value={r.descrizione} onChange={(e) => setRow(i, { descrizione: e.target.value })} rows={2} disabled={locked} placeholder="Descrizione" className="min-h-[44px]" />
                    {!locked && <button onClick={() => set("righe", f.righe.filter((_, j) => j !== i))} className="p-1.5 text-zinc-500 hover:text-red-600 self-start" aria-label="Rimuovi riga"><X className="w-4 h-4" /></button>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-[80px_100px_120px_80px_1fr_110px] gap-2 mt-2 items-end">
                    <Num label="Quantità" v={r.quantita} on={(v) => setRow(i, { quantita: v })} dis={locked} />
                    <div>
                      <label className="text-[11px] text-zinc-500">U.M.</label>
                      <Select value={r.unita_misura || "cad"} onValueChange={(v) => setRow(i, { unita_misura: v })} disabled={locked}>
                        <SelectTrigger aria-label="Unità di misura" className="h-9 mt-0.5"><SelectValue /></SelectTrigger>
                        <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Num label="Prezzo €" v={r.prezzo_unitario} on={(v) => setRow(i, { prezzo_unitario: v })} dis={locked} />
                    <Num label="Sconto %" v={r.sconto} on={(v) => setRow(i, { sconto: v })} dis={locked} />
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-[11px] text-zinc-500">IVA</label>
                      <Select value={String(r.aliquota_key ?? "22")} onValueChange={(v) => setRow(i, { aliquota_key: v })} disabled={locked}>
                        <SelectTrigger aria-label="Aliquota IVA" className="h-9 mt-0.5 min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-[60vh]">{ALIQUOTE_GROUPS.map((g) => <SelectGroup key={g}><SelectLabel className="text-[11px] uppercase tracking-wide text-zinc-500">{g}</SelectLabel>{ALIQUOTE.filter((a) => a.group === g).map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}</SelectGroup>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="text-right col-span-2 sm:col-span-1"><p className="text-[11px] text-zinc-500">Importo</p><p className="text-sm font-semibold tabular-nums py-2">{fmtEur(lineTotal(r))}</p></div>
                  </div>
                  {vatNotes[i] && <p className="text-xs text-brand-800 mt-1.5 flex gap-1"><Sparkles className="w-3.5 h-3.5 shrink-0 mt-px" />{vatNotes[i]}</p>}
                </div>
              ))}
            </div>
            {!locked && <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => set("righe", [...(f.righe || []), emptyRow(f.regime === "RF19" ? "N2.2" : (f.righe?.at(-1)?.aliquota_key || "22"))])}><Plus className="w-4 h-4" /> Riga</Button>}
          </section>

          <section className="bg-white rounded-2xl border border-zinc-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-zinc-900 mb-3">Pagamento e opzioni</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="fatture-modalita" className="text-xs text-zinc-600">Modalità</Label>
                <Select value={f.modalita_pagamento || "MP05"} onValueChange={(v) => set("modalita_pagamento", v)}>
                  <SelectTrigger id="fatture-modalita" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAGAMENTI.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {fld("scadenza", "Scadenza", { type: "date" })}
              {fld("iban", "IBAN")}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-4">
              <label className="flex items-center gap-2 text-sm text-zinc-700"><Switch checked={!!f.split_payment} onCheckedChange={(v) => set("split_payment", v)} disabled={locked} /> Split payment (enti pubblici)</label>
              <div className="flex items-center gap-2 text-sm text-zinc-700">
                Bollo 2 €
                <Select value={f.bollo || "auto"} onValueChange={(v) => set("bollo", v)} disabled={locked}>
                  <SelectTrigger aria-label="Imposta di bollo" className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="auto">Automatico (oltre 77,47 € senza IVA)</SelectItem><SelectItem value="si">Sempre</SelectItem><SelectItem value="no">Mai</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4"><Label htmlFor="fatture-note-sul-documento" className="text-xs text-zinc-600">Note sul documento</Label><Textarea id="fatture-note-sul-documento" value={f.note || ""} onChange={(e) => set("note", e.target.value)} rows={2} className="mt-1" placeholder="es. Lavori agevolabili ai sensi dell'art. 16-bis TUIR" /></div>
          </section>
        </div>

        {/* Riepilogo e azioni */}
        <aside className="space-y-3 xl:sticky xl:top-4">
          <section className="bg-white rounded-2xl border border-zinc-200 p-4">
            <dl className="space-y-1.5 text-sm">
              <Row l="Imponibile" v={fmtEur(c.imponibile)} />
              {c.riepilogo.map((g) => <Row key={g.key} l={g.natura ? `${g.natura} (senza IVA)` : `IVA ${g.aliquota}% su ${fmtEur(g.imponibile)}`} v={fmtEur(g.imposta)} muted />)}
              {c.bollo > 0 && <Row l="Bollo virtuale" v={fmtEur(c.bollo)} muted />}
              <div className="border-t border-zinc-200 pt-2 mt-2"><Row l="Totale documento" v={fmtEur(c.totale)} strong /></div>
              {c.daPagare !== c.totale && <Row l="Netto a pagare" v={fmtEur(c.daPagare)} strong />}
            </dl>
          </section>

          <section className="bg-white rounded-2xl border border-zinc-200 p-4">
            {errors.length ? (
              <div className="mb-3">
                <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Da sistemare per l'XML</p>
                <ul className="mt-1.5 space-y-1">{errors.map((e) => <li key={e} className="text-xs text-amber-900">• {e}</li>)}</ul>
              </div>
            ) : <p className="text-sm text-emerald-800 flex items-center gap-1.5 mb-3"><CheckCircle2 className="w-4 h-4" /> Pronta per la fattura elettronica</p>}
            <div className="grid gap-2">
              <Button onClick={downloadXml} disabled={!!errors.length} className="bg-brand-600 hover:bg-brand-700 gap-1.5 justify-start"><FileCode2 className="w-4 h-4" /> Scarica XML FatturaPA</Button>
              <Button variant="outline" onClick={() => pdf("download")} disabled={busy === "pdf"} className="gap-1.5 justify-start">{busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF copia di cortesia</Button>
              <Button variant="outline" onClick={() => setCopyOpen(true)} className="gap-1.5 justify-start"><Copy className="w-4 h-4" /> Copia i dati uno per uno</Button>
              <Button variant="outline" onClick={() => pdf("email")} className="gap-1.5 justify-start"><Mail className="w-4 h-4" /> Invia al cliente</Button>
            </div>
            <p className="text-xs text-zinc-500 mt-3 leading-relaxed">L'XML si carica così com'è su Fatture in Cloud, Aruba, TeamSystem, Danea o su "Fatture e Corrispettivi" dell'Agenzia delle Entrate, che lo trasmettono allo SdI.</p>
          </section>

          <section className="bg-white rounded-2xl border border-zinc-200 p-4 grid gap-2">
            {f.stato !== "pagata" && f.stato !== "bozza" && <Button variant="outline" onClick={() => setPayOpen(true)} className="gap-1.5 justify-start"><Euro className="w-4 h-4" /> Segna come pagata</Button>}
            {f.stato === "emessa" && <Button variant="outline" onClick={() => set("stato", "inviata")} className="gap-1.5 justify-start"><Check className="w-4 h-4" /> Segna come trasmessa allo SdI</Button>}
            {f.stato === "pagata" && <Button variant="outline" onClick={() => setF((x) => ({ ...x, stato: "emessa", data_pagamento: null }))} className="gap-1.5 justify-start"><RotateCcw className="w-4 h-4" /> Annulla pagamento</Button>}
            {locked && f.tipo_documento !== "TD04" && <Button variant="outline" onClick={creditNote} disabled={busy === "nc"} className="gap-1.5 justify-start"><FileText className="w-4 h-4" /> Crea nota di credito</Button>}
            <Button variant="ghost" onClick={remove} className="gap-1.5 justify-start text-red-700 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /> Elimina</Button>
          </section>
        </aside>
      </div>

      {copyOpen && <CopyDialog f={f} c={c} client={client} profile={ctx.profile} onClose={() => setCopyOpen(false)} />}
      {compose && <ComposeDialog open onOpenChange={(v) => !v && setCompose(null)} {...compose} context="Invio della copia di cortesia di una fattura" />}
      {payOpen && <PayDialog hasJob={!!f.worksite_id} amount={c.daPagare} onClose={() => setPayOpen(false)} onConfirm={markPaid} />}
    </div>
  );
}

function Num({ label, v, on, dis }) {
  return (
    <div>
      <label className="text-[11px] text-zinc-500">{label}</label>
      <Input type="number" inputMode="decimal" step="any" value={v ?? ""} onChange={(e) => on(e.target.value === "" ? "" : Number(e.target.value))} disabled={dis} className="h-9 mt-0.5 tabular-nums" />
    </div>
  );
}
function Row({ l, v, strong, muted }) {
  return <div className={`flex justify-between gap-3 ${strong ? "font-semibold text-zinc-900 text-base" : muted ? "text-zinc-600" : "text-zinc-800"}`}><dt>{l}</dt><dd className="tabular-nums">{v}</dd></div>;
}

function PayDialog({ hasJob, amount, onClose, onConfirm }) {
  const [data, setData] = useState(today());
  const [reg, setReg] = useState(true);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Fattura pagata</DialogTitle><DialogDescription>Importo incassato: {fmtEur(amount)}</DialogDescription></DialogHeader>
        <div><Label htmlFor="fatture-data-del-pagamento">Data del pagamento</Label><Input id="fatture-data-del-pagamento" type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-1" /></div>
        {hasJob && <label className="flex items-center gap-2 text-sm text-zinc-700"><Switch checked={reg} onCheckedChange={setReg} /> Registra l'incasso anche nel lavoro</label>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Annulla</Button><Button onClick={() => onConfirm(data, reg)} className="bg-emerald-600 hover:bg-emerald-700">Conferma</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// Per chi preferisce compilare a mano sul proprio programma: ogni dato con il suo tasto "copia".
function CopyDialog({ f, c, client, profile, onClose }) {
  const [copied, setCopied] = useState("");
  const cp = (key, text) => { navigator.clipboard.writeText(String(text ?? "")); setCopied(key); setTimeout(() => setCopied(""), 1200); };
  const Line = ({ k, label, value }) => (value === undefined || value === null || value === "" ? null : (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-100 last:border-0">
      <span className="w-40 shrink-0 text-xs text-zinc-500">{label}</span>
      <span className="flex-1 min-w-0 text-sm text-zinc-900 truncate">{String(value)}</span>
      <button onClick={() => cp(k, value)} className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500" aria-label={`Copia ${label}`}>{copied === k ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}</button>
    </div>
  ));
  const tsv = c.righe.map((r) => [r.descrizione, r.quantita, r.unita_misura, String(r.prezzo_unitario).replace(".", ","), r.sconto || 0, aliquotaOf(r.aliquota_key).natura || aliquotaOf(r.aliquota_key).aliquota, String(lineTotal(r)).replace(".", ",")].join("\t")).join("\n");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Copia i dati della fattura</DialogTitle><DialogDescription>Per compilarla a mano su un altro programma: premi l'icona accanto a ogni dato e incollalo nel campo corrispondente.</DialogDescription></DialogHeader>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mt-2">Documento</p>
        <Line k="num" label="Numero" value={f.numero} />
        <Line k="data" label="Data" value={new Date(f.data).toLocaleDateString("it-IT")} />
        <Line k="ogg" label="Causale" value={f.oggetto} />
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mt-4">Cliente</p>
        <Line k="cn" label="Denominazione" value={clientName(client)} />
        <Line k="cpi" label="Partita IVA" value={client?.partita_iva} />
        <Line k="ccf" label="Codice fiscale" value={client?.codice_fiscale} />
        <Line k="cin" label="Indirizzo" value={client?.indirizzo} />
        <Line k="ccap" label="CAP" value={client?.cap} />
        <Line k="ccit" label="Comune" value={client?.citta} />
        <Line k="cpr" label="Provincia" value={client?.provincia} />
        <Line k="csdi" label="Codice destinatario" value={client?.codice_sdi} />
        <Line k="cpec" label="PEC" value={client?.pec} />
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Righe</p>
          <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => cp("tsv", tsv)}>{copied === "tsv" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copia tutte (per Excel)</Button>
        </div>
        {c.righe.map((r, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 p-2 mt-2">
            <Line k={`d${i}`} label={`Riga ${i + 1} – descrizione`} value={r.descrizione} />
            <Line k={`q${i}`} label="Quantità" value={r.quantita} />
            <Line k={`p${i}`} label="Prezzo unitario" value={String(r.prezzo_unitario).replace(".", ",")} />
            <Line k={`a${i}`} label="IVA / natura" value={aliquotaOf(r.aliquota_key).natura ? `${aliquotaOf(r.aliquota_key).natura} – ${aliquotaOf(r.aliquota_key).label}` : `${aliquotaOf(r.aliquota_key).aliquota}%`} />
          </div>
        ))}
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mt-4">Totali e pagamento</p>
        <Line k="imp" label="Imponibile" value={c.imponibile.toFixed(2).replace(".", ",")} />
        <Line k="iva" label="IVA" value={c.iva.toFixed(2).replace(".", ",")} />
        <Line k="tot" label="Totale" value={c.totale.toFixed(2).replace(".", ",")} />
        <Line k="iban" label="IBAN" value={(f.iban || profile?.iban || "").replace(/\s+/g, "")} />
        <Line k="sc" label="Scadenza" value={f.scadenza && new Date(f.scadenza).toLocaleDateString("it-IT")} />
      </DialogContent>
    </Dialog>
  );
}
