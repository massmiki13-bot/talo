import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, CheckCircle2, XCircle, Megaphone, Loader2, Package, Wrench, ShieldAlert, Ambulance, MessageSquare, Plus, Trash2, Languages } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { DetailCard, DetailTabs } from "@/components/shared/DetailLayout";
import { dayEntries, saveDay, isWorkingDay, addDays } from "@/lib/attendance";
import { detailRows } from "@/lib/workerFields";

const TIPI = { materiale: ["Manca materiale", Package], guasto: ["Guasto a un mezzo", Wrench], sicurezza: ["Sicurezza / quasi incidente", ShieldAlert], infortunio: ["Infortunio", Ambulance], altro: ["Altro", MessageSquare] };
const RICH = { ferie: "Ferie", permesso: "Permesso", malattia: "Malattia" };
const fmt = (d) => (d ? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");
const fmtTime = (d) => new Date(d).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const LINGUE = { ro: "rumeno", sq: "albanese", it: "italiano" };

function Segnalazioni({ list, onChange }) {
  const [filter, setFilter] = useState("aperta");
  const shown = list.filter((s) => filter === "tutte" || (s.stato || "aperta") === filter);
  const close = async (s, stato) => onChange(await db.Segnalazione.update(s.id, { stato, chiusa_il: stato === "chiusa" ? new Date().toISOString() : null }));
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">{[["aperta", "Aperte"], ["chiusa", "Risolte"], ["tutte", "Tutte"]].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1.5 text-sm ${filter === k ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-700"}`}>{l}</button>)}</div>
      {shown.length === 0 ? <div className="bg-white rounded-2xl border border-zinc-200 py-12 text-center text-sm text-zinc-500"><CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto mb-2" aria-hidden="true" />Nessuna segnalazione {filter === "aperta" ? "aperta" : ""}</div> : shown.map((s) => {
        const [label, I] = TIPI[s.tipo] || TIPI.altro;
        return (
          <div key={s.id} className={`bg-white rounded-2xl border p-4 ${s.urgente && s.stato !== "chiusa" ? "border-red-300" : "border-zinc-200"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`grid place-items-center w-9 h-9 rounded-lg ${s.tipo === "infortunio" ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-700"}`}><I className="w-4 h-4" aria-hidden="true" /></span>
              <p className="font-semibold text-zinc-900">{label}</p>
              {s.urgente && <span className="text-[11px] font-bold uppercase rounded-full bg-red-100 text-red-800 px-2 py-0.5">Urgente</span>}
              <span className="text-xs text-zinc-500 ml-auto">{s.dipendente_nome} · {fmtTime(s.created_date)}</span>
            </div>
            {(s.worksite_nome || s.mezzo_nome) && <p className="text-sm text-zinc-600 mt-2">{s.worksite_id ? <Link to={`/lavori/${s.worksite_id}`} className="hover:underline">{s.worksite_nome}</Link> : null}{s.mezzo_nome ? `${s.worksite_nome ? " · " : ""}Mezzo: ${s.mezzo_nome}` : ""}</p>}
            {detailRows(s.tipo, s.dettagli).length > 0 && (
              <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm">
                {detailRows(s.tipo, s.dettagli).map(([k, v]) => <React.Fragment key={k}><dt className="text-zinc-500">{k}</dt><dd className="text-zinc-900 font-medium">{v}</dd></React.Fragment>)}
              </dl>
            )}
            {s.testo && <p className="text-[15px] text-zinc-900 mt-2 whitespace-pre-wrap">{s.testo}</p>}
            {s.testo_originale && s.testo_originale !== s.testo && <p className="text-xs text-zinc-500 mt-1 flex gap-1"><Languages className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />Originale in {LINGUE[s.lingua] || s.lingua}: {s.testo_originale}</p>}
            {s.audio_url && <audio controls src={s.audio_url} className="mt-2 w-full max-w-sm h-10" />}
            {s.foto_urls?.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{s.foto_urls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" className="w-20 h-20 rounded-lg object-cover border border-zinc-200" /></a>)}</div>}
            <div className="flex gap-2 mt-3">
              {s.stato === "chiusa" ? <Button size="sm" variant="outline" onClick={() => close(s, "aperta")}>Riapri</Button> : <Button size="sm" onClick={() => close(s, "chiusa")} className="gap-1.5 bg-zinc-950 hover:bg-zinc-800"><CheckCircle2 className="w-4 h-4" />Segna come risolta</Button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Richieste({ list, onChange }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState({});
  const pending = list.filter((r) => (r.stato || "in_attesa") === "in_attesa");
  const done = list.filter((r) => r.stato && r.stato !== "in_attesa").slice(0, 30);

  // Approvata: ferie, permesso o malattia finiscono nella giornaliera di ogni giorno lavorativo del periodo.
  const decide = async (r, stato) => {
    setBusy(r.id);
    try {
      if (stato === "approvata") {
        const days = [];
        for (let d = r.dal; d <= (r.al || r.dal) && days.length < 62; d = addDays(d, 1)) if (isWorkingDay(d)) days.push(d);
        for (const d of days) {
          const existing = await db.DailyAttendance.filter({ data: d }, "-data", 200);
          const map = dayEntries(existing, d);
          const hourly = r.tipo === "permesso" && r.dalle && r.alle;
          const nota = hourly ? `Permesso ${r.dalle}–${r.alle}${r.note ? ` (${r.note})` : ""}` : r.note || (r.certificato ? `Certificato ${r.certificato}` : "");
          const cur = map[r.dipendente_id];
          map[r.dipendente_id] = hourly && cur && (cur.stato || "presente") === "presente"
            ? { ...cur, note: [cur.note, nota].filter(Boolean).join(" · ") }
            : { dipendente_id: r.dipendente_id, dipendente_nome: r.dipendente_nome, stato: r.tipo, note: nota, cantieri: [] };
          await saveDay(db, d, Object.values(map), existing);
        }
      }
      onChange(await db.Richiesta.update(r.id, { stato, risposta: note[r.id] || "", deciso_il: new Date().toISOString() }));
      toast({ title: stato === "approvata" ? "Richiesta approvata" : "Richiesta respinta", description: stato === "approvata" ? "Le giornate sono state segnate nelle presenze." : undefined });
    } catch (e) { toast({ title: "Operazione non riuscita", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      {pending.length === 0 ? <div className="bg-white rounded-2xl border border-zinc-200 py-12 text-center text-sm text-zinc-500">Nessuna richiesta da approvare</div> : pending.map((r) => (
        <div key={r.id} className="bg-white rounded-2xl border border-amber-200 p-4">
          <p className="font-semibold text-zinc-900">{r.dipendente_nome} · {RICH[r.tipo]}</p>
          <p className="text-sm text-zinc-700 mt-0.5">{fmt(r.dal)}{r.al && r.al !== r.dal ? ` → ${fmt(r.al)}` : ""}{r.dalle && r.alle ? ` · dalle ${r.dalle} alle ${r.alle}${r.ore ? ` (${String(r.ore).replace(".", ",")} h)` : ""}` : ""}{r.certificato ? ` · certificato ${r.certificato}` : ""}</p>
          {r.note && <p className="text-sm text-zinc-600 mt-1">“{r.note}”</p>}
          <Input value={note[r.id] || ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} placeholder="Risposta per il dipendente (facoltativa)" className="mt-3" aria-label="Risposta" />
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => decide(r, "approvata")} disabled={busy === r.id} className="gap-1.5 bg-emerald-700 hover:bg-emerald-800">{busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Approva</Button>
            <Button size="sm" variant="outline" onClick={() => decide(r, "respinta")} disabled={busy === r.id} className="gap-1.5 text-red-700"><XCircle className="w-4 h-4" />Respingi</Button>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <DetailCard title="Già decise">
          <ul className="divide-y divide-zinc-100 -my-2 text-sm">{done.map((r) => <li key={r.id} className="py-2 flex gap-3"><span className="flex-1">{r.dipendente_nome} · {RICH[r.tipo]} · {fmt(r.dal)}{r.al && r.al !== r.dal ? ` → ${fmt(r.al)}` : ""}</span><span className={r.stato === "approvata" ? "text-emerald-700" : "text-red-700"}>{r.stato}</span></li>)}</ul>
        </DetailCard>
      )}
    </div>
  );
}

function Bacheca({ list, worksites, employeesCount, onChange, onDelete }) {
  const { toast } = useToast();
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.titolo.trim() || !f.testo.trim()) return toast({ title: "Scrivi titolo e testo", variant: "destructive" });
    setSaving(true);
    try {
      const w = worksites.find((x) => x.id === f.worksite_id);
      onChange(await db.Avviso.create({ ...f, worksite_nome: w?.nome || "", letture: [] }));
      setF(null); toast({ title: "Avviso pubblicato", description: "Gli operai lo vedono nell'app; possono tradurlo nella loro lingua." });
    } catch (e) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-3">
      {f ? (
        <DetailCard title="Nuovo avviso" icon={Megaphone}>
          <div className="space-y-3">
            <Input value={f.titolo} onChange={(e) => setF({ ...f, titolo: e.target.value })} placeholder="Es. Riunione di sicurezza lunedì alle 7:30" aria-label="Titolo" />
            <Textarea value={f.testo} onChange={(e) => setF({ ...f, testo: e.target.value })} rows={4} placeholder="Testo dell'avviso" aria-label="Testo" />
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={f.worksite_id || "tutti"} onValueChange={(v) => setF({ ...f, worksite_id: v === "tutti" ? "" : v })}>
                <SelectTrigger className="w-64" aria-label="Destinatari"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tutti">Tutti gli operai</SelectItem>{worksites.map((w) => <SelectItem key={w.id} value={w.id}>Solo la squadra di {w.nome}</SelectItem>)}</SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm"><Switch checked={f.richiede_firma} onCheckedChange={(v) => setF({ ...f, richiede_firma: v })} />Richiedi la firma per presa visione</label>
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setF(null)}>Annulla</Button><Button onClick={save} disabled={saving} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Pubblica</Button></div>
          </div>
        </DetailCard>
      ) : <Button onClick={() => setF({ titolo: "", testo: "", worksite_id: "", richiede_firma: false })} className="gap-1.5 bg-brand-600 hover:bg-brand-700"><Plus className="w-4 h-4" />Nuovo avviso</Button>}
      {list.map((a) => (
        <DetailCard key={a.id} title={a.titolo} action={<button type="button" onClick={() => onDelete(a)} className="text-zinc-500 hover:text-red-600" aria-label="Elimina avviso"><Trash2 className="w-4 h-4" /></button>}>
          <p className="text-xs text-zinc-500 -mt-2">{fmtTime(a.created_date)} · {a.worksite_nome ? `squadra di ${a.worksite_nome}` : "tutti"}{a.richiede_firma ? " · con firma" : ""}</p>
          <p className="text-sm text-zinc-800 mt-2 whitespace-pre-wrap">{a.testo}</p>
          <p className="text-sm font-medium text-zinc-900 mt-3">Letto da {(a.letture || []).length}{!a.worksite_id ? ` di ${employeesCount}` : ""}</p>
          {(a.letture || []).length > 0 && <div className="flex flex-wrap gap-1.5 mt-1.5">{a.letture.map((l) => <span key={l.dipendente_id} className="text-xs rounded-full bg-emerald-50 text-emerald-800 px-2 py-0.5" title={fmtTime(l.at)}>{l.nome}{l.firma ? " ✍" : ""}</span>)}</div>}
        </DetailCard>
      ))}
    </div>
  );
}

export default function Squadra() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "segnalazioni");
  const load = useCallback(async () => {
    const safe = (p) => p.catch(() => []);
    const [s, r, a, w, e] = await Promise.all([safe(db.Segnalazione.list("-created_date", 300)), safe(db.Richiesta.list("-created_date", 300)), safe(db.Avviso.list("-created_date", 100)),
      safe(db.Worksite.fields(["nome", "stato"], { limit: 1000 })), safe(db.Employee.fields(["stato"], { limit: 2000 }))]);
    setData({ s, r, a, w: w.filter((x) => x.stato !== "finito"), eCount: e.filter((x) => x.stato !== "cessato").length });
  }, []);
  useEffect(() => { load(); }, [load]);
  const upd = (key) => (u) => setData((d) => ({ ...d, [key]: d[key].some((x) => x.id === u.id) ? d[key].map((x) => (x.id === u.id ? u : x)) : [u, ...d[key]] }));
  const counts = useMemo(() => data ? { s: data.s.filter((x) => (x.stato || "aperta") === "aperta").length, r: data.r.filter((x) => (x.stato || "in_attesa") === "in_attesa").length } : {}, [data]);
  if (!data) return <LoadingSpinner />;
  return (
    <div className="space-y-5">
      <PageHeader title="Richieste e segnalazioni" subtitle="Quello che arriva dagli operai dall'app: problemi di cantiere, ferie e permessi. E la bacheca per i tuoi avvisi." />
      {counts.s > 0 && data.s.some((x) => x.urgente && x.stato !== "chiusa") && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" aria-hidden="true" />Ci sono segnalazioni urgenti da gestire.</p>}
      <DetailTabs tabs={[["segnalazioni", "Segnalazioni", counts.s], ["richieste", "Ferie e permessi", counts.r], ["bacheca", "Bacheca"]]} value={tab} onChange={setTab} />
      {tab === "segnalazioni" && <Segnalazioni list={data.s} onChange={upd("s")} />}
      {tab === "richieste" && <Richieste list={data.r} onChange={upd("r")} />}
      {tab === "bacheca" && <Bacheca list={data.a} worksites={data.w} employeesCount={data.eCount} onChange={upd("a")} onDelete={async (a) => { if (!confirm("Eliminare l'avviso?")) return; await db.Avviso.delete(a.id); setData((d) => ({ ...d, a: d.a.filter((x) => x.id !== a.id) })); }} />}
    </div>
  );
}
