import React, { useEffect, useRef, useState } from "react";
import { db, api } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Loader2, Sparkles, CheckCircle2, Circle, FileText, Download, ArrowRight, Plus, Trash2, AlertTriangle, Wand2, XCircle } from "lucide-react";
import { DetailCard } from "@/components/shared/DetailLayout";
import { downloadWordDoc } from "@/utils/wordExport";
import {
  DOC_TYPES, SOA_SECTIONS, ISO_SECTIONS, ANNO_FIELDS, LAVORO_FIELDS, progress, missingFields, mergeFields, mergeRows,
  fromApp, readPracticeDocument, draftDescriptiveFields, missingDocs, checkEconomics,
} from "@/lib/pratiche";

const eur = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(v) || 0);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONTE = { app: "dall'app", ia: "bozza IA", manuale: "" };

function FieldInput({ f, value, onChange, autoFocus }) {
  if (f.type === "textarea") return <Textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} autoFocus={autoFocus} aria-label={f.label} />;
  return <Input type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={value ?? ""} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} aria-label={f.label} />;
}

/** Pratica SOA o ISO 9001: documenti → campi compilati dall'IA → completamento guidato → dossier in Word. */
export default function Pratica({ tipo, record, ctx, onSaved }) {
  const { toast } = useToast();
  const sections = tipo === "soa" ? SOA_SECTIONS : ISO_SECTIONS;
  const [p, setP] = useState(() => record || { tipo: tipo === "soa" ? "pratica_soa" : "pratica_iso", campi: {}, documenti: [], anni: [], lavori: [] });
  const [queue, setQueue] = useState([]); // [{ name, stato, n }]
  const [drafting, setDrafting] = useState(false);
  const [skip, setSkip] = useState([]);
  const [guided, setGuided] = useState("");
  const saveTimer = useRef(null);
  const latest = useRef(p);
  latest.current = p;

  const persist = async (next) => {
    const data = { ...next };
    for (const k of ["id", "created_date", "updated_date", "created_by_id", "created_by"]) delete data[k];
    const saved = next.id ? await db.Qualificazione.update(next.id, data) : await db.Qualificazione.create(data);
    setP((cur) => ({ ...cur, id: saved.id }));
    onSaved?.(saved);
    return saved;
  };
  const scheduleSave = (next) => { clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => persist(latest.current).catch(() => {}), 700); return next; };
  const update = (fn) => setP((cur) => scheduleSave(fn(cur)));
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Prima apertura: i dati che l'app conosce già entrano da soli.
  useEffect(() => {
    if (record?.id) return;
    const { values, lavori = [] } = fromApp(tipo, ctx);
    const merged = mergeRows(mergeFields(p, values, "app").p, [], lavori);
    setP(merged);
    persist(merged).catch(() => {});
     
  }, []);

  const setField = (k, v) => update((cur) => ({ ...cur, campi: { ...cur.campi, [k]: { value: v, fonte: "manuale" } } }));

  const upload = async (files) => {
    const list = [...files];
    setQueue((q) => [...q, ...list.map((f) => ({ name: f.name, stato: "in coda" }))]);
    for (const file of list) {
      setQueue((q) => q.map((x) => (x.name === file.name && x.stato === "in coda" ? { ...x, stato: "lettura" } : x)));
      try {
        const { file_url } = await api.integrations.Core.UploadFile({ file });
        const r = await readPracticeDocument(file_url, tipo, file.name);
        let added = 0;
        setP((cur) => {
          const m = mergeFields(cur, r.campi, file.name);
          added = m.n + r.anni.length + r.lavori.length;
          const next = mergeRows({ ...m.p, documenti: [...(cur.documenti || []), { nome: file.name, file_url, tipo_documento: r.tipo_documento, campi_trovati: m.n, letto_il: new Date().toISOString() }] }, r.anni, r.lavori);
          persist(next).catch(() => {});
          return next;
        });
        setQueue((q) => q.map((x) => (x.name === file.name && x.stato === "lettura" ? { ...x, stato: "letto", n: added } : x)));
      } catch (e) {
        setQueue((q) => q.map((x) => (x.name === file.name && x.stato === "lettura" ? { ...x, stato: "errore", err: e.message } : x)));
      }
    }
  };

  const draft = async () => {
    setDrafting(true);
    try {
      const values = await draftDescriptiveFields(tipo, p, ctx.summary);
      const m = mergeFields(p, values, "ia");
      setP(m.p); await persist(m.p);
      toast({ title: `${m.n} campi scritti dall'IA`, description: "Sono bozze: rileggile e correggi dove serve." });
    } catch (e) { toast({ title: "Bozze non generate", description: e.message, variant: "destructive" }); }
    finally { setDrafting(false); }
  };

  const prog = progress(tipo, p);
  const missing = missingFields(tipo, p).filter((f) => !skip.includes(f.k));
  const next = missing[0];
  const docsMissing = missingDocs(tipo, p);
  const eco = tipo === "soa" ? checkEconomics(p.anni) : null;
  const hasAiFields = tipo === "iso" && missingFields(tipo, p).some((f) => f.ai);

  const exportDoc = () => {
    const rowsHtml = (title, cols, rows) => rows.length ? `<h2 style="font-size:13pt;margin:18px 0 6px">${title}</h2><table><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${cols.map(([k]) => `<td>${esc(typeof r[k] === "number" ? eur(r[k]) : r[k])}</td>`).join("")}</tr>`).join("")}</table>` : "";
    let body = sections.map((s) => `<h2 style="font-size:13pt;margin:18px 0 6px">${esc(s.titolo)}</h2><table>${s.campi.map((f) => `<tr><td style="width:38%;background:#f8fafc"><b>${esc(f.label)}</b></td><td>${esc(p.campi?.[f.k]?.value ?? "") || "<i style='color:#b45309'>da completare</i>"}</td></tr>`).join("")}</table>`).join("");
    if (tipo === "soa") body += rowsHtml("Dati economici per anno", ANNO_FIELDS, p.anni || []) + rowsHtml("Lavori eseguiti", LAVORO_FIELDS, p.lavori || []);
    body += `<h2 style="font-size:13pt;margin:18px 0 6px">Documenti raccolti</h2><ul>${(p.documenti || []).map((d) => `<li>${esc(d.nome)} (${esc(d.tipo_documento)})</li>`).join("") || "<li>—</li>"}</ul>`;
    if (docsMissing.length) body += `<p><b>Documenti ancora da reperire:</b> ${docsMissing.map((d) => esc(d.label)).join("; ")}.</p>`;
    downloadWordDoc(tipo === "soa" ? "Dossier pratica SOA" : "Dossier sistema qualità ISO 9001", tipo === "soa" ? "Dossier per la pratica SOA" : "Dossier per la certificazione ISO 9001", body, ctx.profile);
  };

  const setRow = (key, i, k, v) => update((cur) => ({ ...cur, [key]: cur[key].map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));
  const addRow = (key) => update((cur) => ({ ...cur, [key]: [...(cur[key] || []), {}] }));
  const delRow = (key, i) => update((cur) => ({ ...cur, [key]: cur[key].filter((_, j) => j !== i) }));

  return (
    <div className="space-y-5">
      {/* Avanzamento e azioni */}
      <div className="rounded-2xl bg-zinc-950 text-white p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[220px]">
            <p className="text-[11px] uppercase tracking-[0.18em] text-brand-300">{tipo === "soa" ? "Pratica SOA" : "Pratica ISO 9001"}</p>
            <p className="font-display text-4xl font-bold mt-1 tabular-nums">{prog.pct}%<span className="text-base font-sans font-normal text-zinc-500 ml-2">{prog.done} di {prog.tot} dati pronti</span></p>
            <div className="h-2 rounded-full bg-zinc-800 mt-3 overflow-hidden"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${prog.pct}%` }} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 font-semibold text-sm cursor-pointer">
              <Upload className="w-4 h-4" />Carica documenti
              <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) upload(f); }} />
            </label>
            {hasAiFields && <Button onClick={draft} disabled={drafting} variant="secondary" className="gap-2">{drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Scrivi le parti descrittive con l'IA</Button>}
            <Button onClick={exportDoc} variant="secondary" className="gap-2"><Download className="w-4 h-4" />Scarica dossier</Button>
          </div>
        </div>
        <p className="text-sm text-zinc-500 mt-4">Carica tutti i documenti che hai, anche insieme: l'IA riconosce di cosa si tratta e compila i campi. I dati già presenti in Talo (profilo ditta, dipendenti, mezzi, lavori) sono già inseriti. Non sovrascrive mai quello che hai scritto tu.</p>
        {queue.length > 0 && (
          <ul className="mt-4 grid sm:grid-cols-2 gap-2">
            {queue.map((q, i) => (
              <li key={`${q.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                {q.stato === "letto" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : q.stato === "errore" ? <XCircle className="w-4 h-4 text-red-400 shrink-0" /> : <Loader2 className={`w-4 h-4 shrink-0 ${q.stato === "lettura" ? "animate-spin text-brand-300" : "text-zinc-500"}`} />}
                <span className="truncate flex-1">{q.name}</span>
                <span className="text-xs text-zinc-500 shrink-0">{q.stato === "letto" ? `${q.n} dati trovati` : q.stato === "lettura" ? "l'IA sta leggendo…" : q.stato === "errore" ? "non letto" : "in coda"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr,340px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {/* Compilazione guidata */}
          {next ? (
            <DetailCard title={`Completa i dati mancanti · ne restano ${missing.length}`} icon={ArrowRight} className="border-brand-200">
              <p className="font-semibold text-zinc-900">{next.label}</p>
              {next.hint && <p className="text-sm text-zinc-500 mt-0.5">Dove lo trovi: {next.hint}</p>}
              <div className="mt-3"><FieldInput key={next.k} f={next} value={guided} onChange={setGuided} autoFocus /></div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button onClick={() => { if (String(guided).trim()) { setField(next.k, guided); setGuided(""); } }} disabled={!String(guided).trim()} className="gap-1.5 bg-zinc-950 hover:bg-zinc-800">Salva e vai avanti<ArrowRight className="w-4 h-4" /></Button>
                <Button variant="outline" onClick={() => { setSkip([...skip, next.k]); setGuided(""); }}>Lo cerco dopo</Button>
              </div>
            </DetailCard>
          ) : (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" />{skip.length ? `Hai completato tutto tranne ${skip.length} campi rimandati: li trovi qui sotto.` : "Tutti i campi sono compilati. Scarica il dossier e invialo all'organismo o al consulente."}</p>
          )}

          {sections.map((s) => (
            <DetailCard key={s.titolo} title={s.titolo} icon={FileText}>
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
                {s.campi.map((f) => {
                  const c = p.campi?.[f.k];
                  return (
                    <label key={f.k} className={`block ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
                      <span className="flex items-center gap-2 text-xs font-medium text-zinc-600 mb-1">
                        {String(c?.value ?? "").trim() ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> : <Circle className="w-3.5 h-3.5 text-zinc-300" />}
                        {f.label}
                        {c?.fonte && FONTE[c.fonte] !== "" && <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.fonte === "ia" ? "bg-violet-100 text-violet-800" : "bg-zinc-100 text-zinc-600"}`}>{FONTE[c.fonte] ?? `da ${c.fonte}`}</span>}
                      </span>
                      <FieldInput f={f} value={c?.value} onChange={(v) => setField(f.k, v)} />
                    </label>
                  );
                })}
              </div>
            </DetailCard>
          ))}

          {tipo === "soa" && (
            <>
              <DetailCard title="Dati economici per anno" icon={FileText} action={<Button size="sm" variant="outline" onClick={() => addRow("anni")} className="gap-1"><Plus className="w-4 h-4" />Anno</Button>}>
                <p className="text-sm text-zinc-500 -mt-2 mb-3">Dai bilanci: l'IA li compila da sola. Contano i 5 anni migliori degli ultimi 10.</p>
                <RowsTable cols={ANNO_FIELDS} rows={p.anni || []} onChange={(i, k, v) => setRow("anni", i, k, v)} onDelete={(i) => delRow("anni", i)} />
                {eco && (
                  <div className="grid sm:grid-cols-3 gap-2 mt-4 text-sm">
                    <div className="rounded-xl bg-zinc-50 p-3"><p className="text-xs text-zinc-500">Fatturato lavori ({eco.anni.length} anni migliori)</p><p className="font-semibold tabular-nums">{eur(eco.fatturato)}</p></div>
                    {[["Costo del personale", eco.personale, 15], ["Attrezzatura tecnica", eco.attrezzatura, 2]].map(([l, x, min]) => (
                      <div key={l} className={`rounded-xl p-3 ${x.ok ? "bg-emerald-50" : "bg-amber-50"}`}><p className={`text-xs ${x.ok ? "text-emerald-900" : "text-amber-950"}`}>{l} (minimo {min}%)</p><p className={`font-semibold tabular-nums ${x.ok ? "text-emerald-800" : "text-amber-900"}`}>{x.pct.toFixed(1).replace(".", ",")}% {x.ok ? "✓" : "– sotto la soglia"}</p></div>
                    ))}
                  </div>
                )}
              </DetailCard>
              <DetailCard title="Lavori eseguiti" icon={FileText} action={<Button size="sm" variant="outline" onClick={() => addRow("lavori")} className="gap-1"><Plus className="w-4 h-4" />Lavoro</Button>}>
                <p className="text-sm text-zinc-500 -mt-2 mb-3">Presi dai lavori finiti in Talo e dai CEL e contratti caricati.</p>
                <RowsTable cols={LAVORO_FIELDS} rows={p.lavori || []} onChange={(i, k, v) => setRow("lavori", i, k, v)} onDelete={(i) => delRow("lavori", i)} />
              </DetailCard>
            </>
          )}
        </div>

        {/* Documenti */}
        <div className="space-y-5 lg:sticky lg:top-6">
          <DetailCard title="Documenti consigliati" icon={Sparkles}>
            <ul className="space-y-2.5">
              {DOC_TYPES[tipo].map((d) => {
                const have = (p.documenti || []).filter((x) => x.tipo_documento === d.k);
                return (
                  <li key={d.k} className="flex gap-2.5">
                    {have.length ? <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> : <Circle className="w-4 h-4 text-zinc-300 mt-0.5 shrink-0" />}
                    <span className="text-sm"><span className={`font-medium ${have.length ? "text-zinc-900" : "text-zinc-700"}`}>{d.label}</span><span className="block text-xs text-zinc-500">{have.length ? have.map((h) => h.nome).join(", ") : d.why}</span></span>
                  </li>
                );
              })}
            </ul>
            {(p.documenti || []).some((x) => x.tipo_documento === "altro") && <p className="text-xs text-zinc-500 mt-3">Altri documenti: {(p.documenti || []).filter((x) => x.tipo_documento === "altro").map((x) => x.nome).join(", ")}</p>}
          </DetailCard>
          {docsMissing.length > 0 && <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />Senza questi documenti alcuni campi restano da compilare a mano: puoi farlo con la guida a sinistra.</p>}
        </div>
      </div>
    </div>
  );
}

function RowsTable({ cols, rows, onChange, onDelete }) {
  if (!rows.length) return <p className="text-sm text-zinc-500">Nessun dato ancora.</p>;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">{cols.map(([k, l]) => <th key={k} className="px-1 py-1 font-medium whitespace-nowrap">{l}</th>)}<th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(([k, l]) => <td key={k} className="px-1 py-1"><Input value={r[k] ?? ""} onChange={(e) => onChange(i, k, e.target.value)} aria-label={l} className={`h-8 text-sm ${["oggetto", "committente"].includes(k) ? "min-w-[160px]" : "min-w-[90px]"}`} /></td>)}
              <td className="px-1"><button type="button" onClick={() => onDelete(i)} className="p-1.5 text-zinc-500 hover:text-red-600" aria-label="Elimina riga"><Trash2 className="w-4 h-4" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
