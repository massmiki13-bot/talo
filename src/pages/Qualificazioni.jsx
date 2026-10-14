import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db, api } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Award, BadgeCheck, Upload, Loader2, Sparkles, CalendarClock, CheckCircle2, XCircle, FileText, Gavel, AlertTriangle, Download, RefreshCw, Info } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { DetailCard, DetailTabs } from "@/components/shared/DetailLayout";
import { downloadWordDoc } from "@/utils/wordExport";
import Pratica from "@/components/qualifications/Pratica";
import {
  SOA_CATEGORIES, CLASSIFICHE, categoryName, classLimit, needsIso, soaDeadlines, isoDeadlines, deadlineState, canBid,
  requirementsByCategory, missingCel, qualityRecords, readCertificate, classifyWorksites, writeQualityDocument, readTender, syncReminders,
} from "@/lib/qualifications";

const eur = (v) => (v === Infinity ? "illimitato" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(v) || 0));
const fmt = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("it-IT") : "—");
const TONE = { red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-900", green: "bg-emerald-100 text-emerald-800", zinc: "bg-zinc-100 text-zinc-700" };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function UploadBox({ label, hint, busy, onFile, accept = "application/pdf,image/*" }) {
  return (
    <label className={`block rounded-2xl border-2 border-dashed border-zinc-300 hover:border-brand-400 hover:bg-brand-50/30 transition-colors p-5 text-center ${busy ? "pointer-events-none opacity-70" : "cursor-pointer"}`}>
      {busy ? <Loader2 className="w-7 h-7 mx-auto animate-spin text-brand-600" /> : <Upload className="w-7 h-7 mx-auto text-zinc-500" aria-hidden="true" />}
      <span className="block font-semibold text-zinc-900 mt-2">{busy ? "L'IA sta leggendo il documento…" : label}</span>
      <span className="block text-sm text-zinc-500 mt-0.5">{hint}</span>
      <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );
}

function Deadlines({ items }) {
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-zinc-100">
      {items.map((d) => {
        const st = deadlineState(d.data);
        return (
          <li key={`${d.tipo}-${d.key}`} className="py-2.5 flex items-start gap-3">
            <CalendarClock className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0"><p className="text-sm font-medium text-zinc-900">{d.titolo}</p>{d.nota && <p className="text-xs text-zinc-500">{d.nota}</p>}</div>
            <div className="text-right shrink-0"><p className="text-sm tabular-nums text-zinc-800">{fmt(d.data)}</p><span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE[st.tone]}`}>{st.label}</span></div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Gara: posso partecipare? ───
function TenderCheck({ soa }) {
  const { toast } = useToast();
  const [cat, setCat] = useState(soa?.categorie?.[0]?.codice || "OG1");
  const [imp, setImp] = useState("");
  const [bando, setBando] = useState(null);
  const [busy, setBusy] = useState(false);
  const manual = imp ? canBid(soa, cat, Number(String(imp).replace(/\./g, "").replace(",", "."))) : null;

  const read = async (file) => {
    setBusy(true);
    try { const { file_url } = await api.integrations.Core.UploadFile({ file }); setBando(await readTender(file_url)); }
    catch (e) { toast({ title: "Bando non letto", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <DetailCard title="Posso partecipare a questa gara?" icon={Gavel}>
      <div className="grid lg:grid-cols-2 gap-5">
        <div>
          <UploadBox label="Carica il bando o la lettera d'invito" hint="L'IA trova importo e categorie e ti dice se sei qualificato" busy={busy} onFile={read} />
          {bando && (
            <div className="mt-4 rounded-xl border border-zinc-200 p-4">
              <p className="font-semibold text-zinc-900">{bando.oggetto || "Gara"}</p>
              <p className="text-sm text-zinc-500">{[bando.stazione_appaltante, bando.importo_totale ? `importo ${eur(bando.importo_totale)}` : "", bando.scadenza_offerte ? `offerte entro il ${fmt(bando.scadenza_offerte)}` : ""].filter(Boolean).join(" · ")}</p>
              <ul className="mt-3 space-y-2">
                {bando.categorie.map((c) => {
                  const r = canBid(soa, c.codice, c.importo);
                  return (
                    <li key={c.codice} className="flex items-start gap-2 text-sm">
                      {r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />}
                      <span><b>{c.codice}</b>{c.prevalente ? " (prevalente)" : ""} · {eur(c.importo)}<span className="block text-zinc-600">{r.motivo}</span></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">Oppure verifica a mano una categoria e un importo:</p>
          <div className="grid grid-cols-2 gap-2">
            <Select value={cat} onValueChange={setCat}><SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger><SelectContent>{SOA_CATEGORIES.map((c) => <SelectItem key={c.codice} value={c.codice}>{c.codice} · {c.nome}</SelectItem>)}</SelectContent></Select>
            <Input value={imp} onChange={(e) => setImp(e.target.value)} inputMode="decimal" placeholder="Importo lavori €" aria-label="Importo" />
          </div>
          {manual && <p className={`rounded-xl p-3 text-sm flex gap-2 ${manual.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{manual.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}{manual.motivo}</p>}
          <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 leading-relaxed">
            <p className="font-semibold text-zinc-800 mb-1">Classifiche SOA</p>
            <div className="grid grid-cols-2 gap-x-4">{CLASSIFICHE.map((c) => <span key={c.codice} className="flex justify-between"><span>{c.codice}</span><span className="tabular-nums">{c.importo === Infinity ? "oltre 15.494.000 €" : `fino a ${eur(c.importo)}`}</span></span>)}</div>
          </div>
        </div>
      </div>
    </DetailCard>
  );
}

// ─── SOA: requisiti calcolati dai lavori ───
function SoaTab({ soa, worksites, setWorksites }) {
  const { toast } = useToast();
  const [anni, setAnni] = useState("10");
  const [busy, setBusy] = useState(false);
  const req = useMemo(() => requirementsByCategory(worksites, Number(anni)), [worksites, anni]);
  const cel = useMemo(() => missingCel(worksites), [worksites]);
  const senzaCategoria = worksites.filter((w) => !w.categoria_soa && w.stato === "finito").length;

  const classify = async () => {
    setBusy(true);
    try {
      const res = await classifyWorksites(worksites.filter((w) => w.stato === "finito"));
      const updated = [];
      for (const r of res) updated.push(await db.Worksite.update(r.id, { categoria_soa: r.categoria, committente_pubblico: !!r.pubblico }));
      setWorksites((ws) => ws.map((w) => updated.find((u) => u.id === w.id) || w));
      toast({ title: `${updated.length} lavori classificati`, description: "Controlla le categorie: puoi cambiarle qui sotto." });
    } catch (e) { toast({ title: "Classificazione non riuscita", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const setW = async (w, patch) => { const u = await db.Worksite.update(w.id, patch); setWorksites((ws) => ws.map((x) => (x.id === u.id ? u : x))); };
  const mine = (codice) => soa?.categorie?.find((c) => c.codice === codice)?.classifica;

  return (
    <div className="space-y-5">
      <DetailCard title="Requisiti dai tuoi lavori" icon={Award} action={
        <div className="flex items-center gap-2">
          <Select value={anni} onValueChange={setAnni}><SelectTrigger className="h-9 w-[150px]" aria-label="Periodo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">Ultimi 10 anni</SelectItem><SelectItem value="15">Ultimi 15 anni</SelectItem></SelectContent></Select>
          {senzaCategoria > 0 && <Button size="sm" onClick={classify} disabled={busy} className="gap-1.5 bg-zinc-950 hover:bg-zinc-800">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}Classifica {senzaCategoria} lavori con l'IA</Button>}
        </div>
      }>
        <p className="text-sm text-zinc-600 -mt-1 mb-4">Per ogni categoria: lavori finiti nel periodo e classifica che potresti ottenere (servono lavori per almeno il 90% della classifica, con un lavoro grande o due/tre medi). È una stima: la conferma la dà la SOA.</p>
        {req.length === 0 ? <p className="text-sm text-zinc-500 py-6 text-center">Nessun lavoro finito con categoria SOA. {senzaCategoria ? "Usa «Classifica con l'IA»." : "Quando chiudi un lavoro, comparirà qui."}</p> : (
          <div className="grid md:grid-cols-2 gap-3">
            {req.map((g) => (
              <div key={g.codice} className="rounded-xl border border-zinc-200 p-4">
                <div className="flex items-start gap-2">
                  <span className="font-display text-xl font-bold text-zinc-950">{g.codice}</span>
                  <span className="text-xs text-zinc-500 mt-1 flex-1">{g.nome}</span>
                  {mine(g.codice) && <span className="text-[11px] font-semibold rounded-full bg-zinc-950 text-white px-2 py-0.5">Attestata: {mine(g.codice)}</span>}
                </div>
                <p className="text-sm mt-2">Lavori eseguiti: <b className="tabular-nums">{eur(g.totale)}</b> ({g.lavori.length})</p>
                <p className="text-sm">Classifica raggiungibile: <b>{g.classifica || "non ancora la I"}</b></p>
                {g.prossima && <p className="text-xs text-zinc-500 mt-1">Per la classifica {g.prossima.codice} mancano circa {eur(g.prossima.mancano)} di lavori nella categoria.</p>}
              </div>
            ))}
          </div>
        )}
      </DetailCard>

      <DetailCard title="Certificati di esecuzione lavori (CEL)" icon={FileText}>
        <p className="text-sm text-zinc-600 -mt-1 mb-3">Per i lavori pubblici la SOA vuole il CEL rilasciato dalla stazione appaltante. Qui trovi quelli ancora da chiedere.</p>
        {cel.length === 0 ? <p className="text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Nessun CEL mancante.</p> : (
          <ul className="divide-y divide-zinc-100">
            {cel.map((w) => (
              <li key={w.id} className="py-2.5 flex flex-wrap items-center gap-3">
                <Link to={`/lavori/${w.id}`} className="flex-1 min-w-[200px] text-sm font-medium text-zinc-900 hover:underline">{w.nome}<span className="block text-xs text-zinc-500 font-normal">{w.cliente_nome} · {w.categoria_soa || "senza categoria"} · {eur(w.importo_totale)}</span></Link>
                <Select value={w.cel_stato || "da_richiedere"} onValueChange={(v) => setW(w, { cel_stato: v })}><SelectTrigger className="h-9 w-[170px]" aria-label="Stato CEL"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="da_richiedere">Da richiedere</SelectItem><SelectItem value="richiesto">Richiesto</SelectItem><SelectItem value="ricevuto">Ricevuto</SelectItem></SelectContent></Select>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      {worksites.some((w) => w.stato === "finito") && <DetailCard title="Categoria SOA dei lavori finiti" icon={Award} flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-100"><th className="px-5 py-2 font-medium">Lavoro</th><th className="py-2 font-medium">Importo</th><th className="py-2 font-medium">Categoria</th><th className="px-5 py-2 font-medium">Pubblico</th></tr></thead>
            <tbody>
              {worksites.filter((w) => w.stato === "finito").slice(0, 100).map((w) => (
                <tr key={w.id} className="border-b border-zinc-50">
                  <td className="px-5 py-2"><Link to={`/lavori/${w.id}`} className="hover:underline">{w.nome}</Link></td>
                  <td className="py-2 tabular-nums whitespace-nowrap">{eur(w.importo_totale)}</td>
                  <td className="py-2 pr-2"><Select value={w.categoria_soa || "none"} onValueChange={(v) => setW(w, { categoria_soa: v === "none" ? "" : v })}><SelectTrigger className="h-8 w-[120px]" aria-label="Categoria"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{SOA_CATEGORIES.map((c) => <SelectItem key={c.codice} value={c.codice}>{c.codice}</SelectItem>)}</SelectContent></Select></td>
                  <td className="px-5 py-2"><input type="checkbox" checked={!!w.committente_pubblico} onChange={(e) => setW(w, { committente_pubblico: e.target.checked })} className="w-4 h-4 accent-[#c3122a]" aria-label="Committente pubblico" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailCard>}
    </div>
  );
}

// ─── ISO 9001: registrazioni automatiche e documenti scritti dall'IA ───
const DOCS = [
  ["riesame", "Riesame della direzione", "Annuale, da presentare all'audit"],
  ["audit", "Piano e checklist di audit interno", "Calendario e domande per ogni processo"],
  ["fornitori", "Valutazione dei fornitori", "Esito per fornitore dai DDT registrati"],
  ["politica", "Politica per la qualità", "Breve, da firmare e affiggere"],
];

function IsoTab({ iso: isoCert, records, profile, ctx }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  const gen = async (kind, title) => {
    setBusy(kind);
    try {
      const sezioni = await writeQualityDocument(kind, ctx);
      let body = sezioni.map((s) => `<h2 style="font-size:13pt;margin:18px 0 6px">${esc(s.titolo)}</h2>${esc(s.testo).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("")}`).join("");
      if (kind === "fornitori" && records.fornitori.length) body += `<h2 style="font-size:13pt;margin:18px 0 6px">Elenco fornitori</h2><table><tr><th>Fornitore</th><th>Consegne con DDT</th><th>Con problemi</th><th>Acquisti</th><th>Esito</th></tr>${records.fornitori.map((f) => `<tr><td>${esc(f.nome)}</td><td>${f.consegne}</td><td>${f.problemi}</td><td>${eur(f.importo)}</td><td>${f.esito}</td></tr>`).join("")}</table>`;
      if (kind === "riesame" && records.nonConformita.elenco.length) body += `<h2 style="font-size:13pt;margin:18px 0 6px">Registro non conformità</h2><table><tr><th>Data</th><th>Tipo</th><th>Descrizione</th><th>Stato</th></tr>${records.nonConformita.elenco.slice(0, 60).map((s) => `<tr><td>${fmt((s.created_date || "").slice(0, 10))}</td><td>${esc(s.tipo)}</td><td>${esc((s.testo || "").slice(0, 160))}</td><td>${s.stato === "chiusa" ? "chiusa" : "aperta"}</td></tr>`).join("")}</table>`;
      downloadWordDoc(`${title} ${new Date().getFullYear()}`, title, body, profile);
    } catch (e) { toast({ title: "Documento non generato", description: e.message, variant: "destructive" }); }
    finally { setBusy(""); }
  };
  const kpis = [
    ["Non conformità", records.nonConformita.totale, `${records.nonConformita.aperte} aperte`, "/squadra", records.nonConformita.aperte ? "amber" : "green"],
    ["Formazione e visite", records.formazione.totale, `${records.formazione.scaduti} scadute`, "/dipendenti", records.formazione.scaduti ? "red" : "green"],
    ["Attrezzature", records.attrezzature.totale, `${records.attrezzature.scadute} verifiche scadute`, "/mezzi", records.attrezzature.scadute ? "red" : "green"],
    ["Fornitori", records.fornitori.length, `${records.fornitori.filter((f) => f.esito !== "qualificato").length} da monitorare`, "/contatti", "zinc"],
  ];
  return (
    <div className="space-y-5">
      <DetailCard title="Registrazioni del sistema qualità" icon={BadgeCheck}>
        <p className="text-sm text-zinc-600 -mt-1 mb-4">L'ISO 9001 chiede di tenere traccia di problemi, formazione, attrezzature e fornitori. Talo le raccoglie già da solo da segnalazioni degli operai, documenti dei dipendenti, mezzi e bolle: non devi registrare niente due volte.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(([l, n, sub, to, tone]) => (
            <Link key={l} to={to} className="rounded-xl border border-zinc-200 p-4 hover:border-zinc-300">
              <p className="text-xs uppercase tracking-wide text-zinc-500">{l}</p>
              <p className="font-display text-3xl font-bold mt-1 tabular-nums">{n}</p>
              <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE[tone]}`}>{sub}</span>
            </Link>
          ))}
        </div>
      </DetailCard>
      <DetailCard title="Documenti scritti dall'IA" icon={Sparkles}>
        <p className="text-sm text-zinc-600 -mt-1 mb-4">Pronti in Word con i dati veri della tua impresa{isoCert?.organismo ? ` e del certificato ${isoCert.organismo}` : ""}. Li rileggi, completi le parti segnate e li firmi.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {DOCS.map(([k, title, sub]) => (
            <button key={k} type="button" onClick={() => gen(k, title)} disabled={!!busy} className="text-left rounded-xl border border-zinc-200 p-4 hover:border-brand-400 hover:bg-brand-50/30 transition-colors flex items-start gap-3 disabled:opacity-60">
              <span className="grid place-items-center w-10 h-10 rounded-xl bg-zinc-950 shrink-0">{busy === k ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <FileText className="w-5 h-5 text-white" />}</span>
              <span className="flex-1"><span className="block font-semibold text-zinc-900">{title}</span><span className="block text-sm text-zinc-500">{busy === k ? "L'IA sta scrivendo…" : sub}</span></span>
              <Download className="w-4 h-4 text-zinc-500 mt-1" aria-hidden="true" />
            </button>
          ))}
        </div>
      </DetailCard>
    </div>
  );
}

// ─── Scheda di una qualificazione (SOA o ISO) ───
function CertCard({ tipo, q, onUpload, busy }) {
  const isSoa = tipo === "soa";
  const deadlines = q ? (isSoa ? soaDeadlines(q) : isoDeadlines(q)) : [];
  const next = deadlines.find((d) => d.data >= new Date().toISOString().slice(0, 10));
  return (
    <DetailCard title={isSoa ? "Attestazione SOA" : "Certificazione ISO 9001"} icon={isSoa ? Award : BadgeCheck}
      action={q && <label className="text-sm font-medium text-brand-700 hover:underline cursor-pointer flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Aggiorna<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(tipo, f); }} /></label>}>
      {!q ? (
        <UploadBox busy={busy === tipo} onFile={(f) => onUpload(tipo, f)}
          label={isSoa ? "Carica l'attestato SOA" : "Carica il certificato ISO 9001"}
          hint="PDF o foto: l'IA legge categorie, date e scadenze e crea i promemoria" />
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-zinc-500">{isSoa ? "Organismo SOA" : "Ente"}</dt><dd className="text-zinc-900 font-medium">{q.organismo || "—"}</dd>
            <dt className="text-zinc-500">Numero</dt><dd className="text-zinc-900">{q.numero || "—"}</dd>
            <dt className="text-zinc-500">Rilascio</dt><dd className="text-zinc-900">{fmt(q.data_rilascio)}</dd>
            <dt className="text-zinc-500">Scadenza</dt><dd className="text-zinc-900">{fmt(q.data_scadenza || deadlines.find((d) => d.key === "scadenza")?.data)}</dd>
            {!isSoa && q.scopo && <><dt className="text-zinc-500">Campo</dt><dd className="text-zinc-900">{q.scopo}</dd></>}
          </dl>
          {isSoa && q.categorie?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{q.categorie.map((c) => <span key={c.codice} title={categoryName(c.codice)} className="rounded-lg bg-zinc-950 text-white text-xs font-semibold px-2.5 py-1">{c.codice} · {c.classifica} <span className="text-zinc-500 font-normal">fino a {eur(classLimit(c.classifica))}</span></span>)}</div>
          )}
          {next && <p className={`rounded-xl px-3 py-2 text-sm ${TONE[deadlineState(next.data).tone]}`}><b>{next.titolo}</b> entro il {fmt(next.data)} · {deadlineState(next.data).label}</p>}
        </div>
      )}
    </DetailCard>
  );
}

export default function Qualificazioni() {
  const { toast } = useToast();
  const [tab, setTab] = useState("panoramica");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [quals, worksites, segnalazioni, employeeDocs, equipment, transactions, profiles, employees] = await Promise.all([
      db.Qualificazione.list(), db.Worksite.list("-created_date", 1000), db.Segnalazione.list("-created_date", 500).catch(() => []),
      db.EmployeeDocument.list("-created_date", 1000).catch(() => []), db.Equipment.list().catch(() => []),
      db.WorksiteTransaction.filter({ tipo: "uscita" }, "-data", 2000).catch(() => []), db.CompanyProfile.list(), db.Employee.list().catch(() => []),
    ]);
    setData({ quals, worksites, segnalazioni, employeeDocs, equipment, transactions, profile: profiles[0] || null, employees });
  }, []);
  useEffect(() => { load().catch((e) => toast({ title: "Caricamento non riuscito", description: e.message, variant: "destructive" })); }, [load, toast]);

  const soa = data?.quals.find((q) => q.tipo === "soa");
  const iso = data?.quals.find((q) => q.tipo === "iso9001");
  const records = useMemo(() => (data ? qualityRecords({ segnalazioni: data.segnalazioni, employeeDocs: data.employeeDocs, equipment: data.equipment, transactions: data.transactions }) : null), [data]);

  const upload = async (tipo, file) => {
    setBusy(tipo);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      const read = await readCertificate(file_url, tipo);
      const existing = tipo === "soa" ? soa : iso;
      const saved = existing ? await db.Qualificazione.update(existing.id, read) : await db.Qualificazione.create(read);
      await syncReminders(db, saved);
      setData((d) => ({ ...d, quals: [...d.quals.filter((q) => q.id !== saved.id), saved] }));
      toast({ title: tipo === "soa" ? "Attestazione SOA letta" : "Certificato ISO 9001 letto", description: "Scadenze aggiunte ai promemoria. Controlla i dati." });
    } catch (e) { toast({ title: "Documento non letto", description: e.message, variant: "destructive" }); }
    finally { setBusy(""); }
  };

  if (!data) return <LoadingSpinner />;
  const all = [...(soa ? soaDeadlines(soa).map((d) => ({ ...d, tipo: "soa" })) : []), ...(iso ? isoDeadlines(iso).map((d) => ({ ...d, tipo: "iso" })) : [])].sort((a, b) => a.data.localeCompare(b.data));
  const maxClass = soa?.categorie?.reduce((m, c) => (classLimit(c.classifica) > classLimit(m) ? c.classifica : m), "I");
  const isoWarning = soa && needsIso(maxClass) && !iso;
  const ctx = {
    impresa: { ragione_sociale: data.profile?.ragione_sociale, dipendenti: data.employees.length, sede: data.profile?.citta },
    soa: soa && { organismo: soa.organismo, categorie: soa.categorie }, iso: iso && { ente: iso.organismo, scopo: iso.scopo, scadenza: iso.data_scadenza },
    lavori: { totali: data.worksites.length, finiti: data.worksites.filter((w) => w.stato === "finito").length, in_corso: data.worksites.filter((w) => w.stato === "in_corso").length },
    non_conformita: { totale: records.nonConformita.totale, aperte: records.nonConformita.aperte, per_tipo: records.nonConformita.elenco.reduce((m, s) => ({ ...m, [s.tipo]: (m[s.tipo] || 0) + 1 }), {}) },
    formazione: { documenti: records.formazione.totale, scaduti: records.formazione.scaduti },
    attrezzature: { mezzi: data.equipment.length, verifiche_scadute: records.attrezzature.scadute },
    fornitori: records.fornitori.slice(0, 25),
  };

  return (
    <div>
      <PageHeader title="ISO e SOA" subtitle="Le qualificazioni per gli appalti pubblici: carichi i certificati, l'IA fa il resto (scadenze, requisiti, gare, documenti ISO)." />
      <div className="mb-5"><DetailTabs tabs={[["panoramica", "Panoramica"], ["pratica_soa", "Pratica SOA"], ["pratica_iso", "Pratica ISO"], ["soa", "SOA e requisiti"], ["iso", "ISO 9001", records.nonConformita.aperte], ["gare", "Verifica gara"]]} value={tab} onChange={setTab} /></div>

      {tab === "panoramica" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex gap-3 text-sm text-zinc-700">
            <Info className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p><b>SOA</b>: l'attestazione che serve per le gare di lavori pubblici sopra i 150.000 €; dice in quali categorie (OG1 edifici, OS30 impianti elettrici…) e fino a che importo (classifica) puoi lavorare. Vale 5 anni, con una verifica al terzo anno. <b>ISO 9001</b>: certificazione del sistema qualità, obbligatoria per la SOA dalla classifica III (oltre 516.000 €); ogni anno c'è un audit di controllo.</p>
          </div>
          {isoWarning && <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />Hai categorie in classifica {maxClass}: serve la certificazione ISO 9001. Caricala qui sotto per controllare le scadenze.</p>}
          <div className="grid lg:grid-cols-2 gap-5">
            <CertCard tipo="soa" q={soa} onUpload={upload} busy={busy} />
            <CertCard tipo="iso9001" q={iso} onUpload={upload} busy={busy} />
          </div>
          {(!soa || !iso) && (
            <button type="button" onClick={() => setTab(!soa ? "pratica_soa" : "pratica_iso")} className="w-full text-left rounded-2xl bg-zinc-950 text-white p-5 flex items-center gap-4 hover:bg-zinc-900">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-brand-600 shrink-0"><Sparkles className="w-5 h-5" /></span>
              <span className="flex-1"><span className="block font-semibold">{!soa ? "Non hai ancora la SOA? Prepara la pratica con l'IA" : "Prepara la certificazione ISO 9001 con l'IA"}</span><span className="block text-sm text-zinc-400">Carichi visura, bilanci, CEL e gli altri documenti: l'IA compila i dati, il resto te lo chiede passo passo.</span></span>
            </button>
          )}
          {all.length > 0 && <DetailCard title="Prossime scadenze (già nei promemoria)" icon={CalendarClock}><Deadlines items={all} /></DetailCard>}
        </div>
      )}
      {tab === "soa" && <SoaTab soa={soa} worksites={data.worksites} setWorksites={(fn) => setData((d) => ({ ...d, worksites: fn(d.worksites) }))} />}
      {tab === "iso" && <IsoTab iso={iso} records={records} profile={data.profile} ctx={ctx} />}
      {tab === "gare" && <TenderCheck soa={soa} />}
      {(tab === "pratica_soa" || tab === "pratica_iso") && (
        <Pratica key={tab} tipo={tab === "pratica_soa" ? "soa" : "iso"} record={data.quals.find((q) => q.tipo === tab)}
          ctx={{ profile: data.profile || {}, employees: data.employees, equipment: data.equipment, worksites: data.worksites, soa, iso, summary: ctx }}
          onSaved={(saved) => setData((d) => ({ ...d, quals: [...d.quals.filter((q) => q.id !== saved.id), saved] }))} />
      )}
    </div>
  );
}
