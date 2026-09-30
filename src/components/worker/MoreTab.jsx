import React, { useEffect, useState } from "react";
import { FileText, IdCard, Megaphone, HardHat, Truck, Languages, LogOut, Loader2, CheckCircle2, ChevronRight, Wrench, ArrowLeft, Volume2, Square, AlertTriangle } from "lucide-react";
import { api, db } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import SignaturePad from "@/components/shared/SignaturePad";
import { generateBadgePdf, downloadBlob } from "@/utils/employeePdf";
import { translate } from "@/lib/worker";
import { LANGS } from "@/lib/workerI18n";
import { deadlines } from "@/lib/equipment";
import { Card, BigButton, Pill, fmtDay, inputCls, locale } from "./ui";

const daysTo = (iso) => Math.ceil((new Date(iso) - new Date(new Date().toDateString())) / 86_400_000);

function Avvisi({ home, t, lang, onChanged }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(null);
  const [firma, setFirma] = useState("");
  const [tr, setTr] = useState({}); // id → testo tradotto | "…" in corso
  const [orig, setOrig] = useState({});
  const [speaking, setSpeaking] = useState(null);
  const [busy, setBusy] = useState(false);

  // Nella lingua dell'operaio gli avvisi si traducono da soli (una volta per avviso).
  useEffect(() => {
    if (lang === "it") return;
    let alive = true;
    (async () => {
      for (const a of home.avvisi.slice(0, 10)) {
        if (!alive) return;
        setTr((x) => (x[a.id] ? x : { ...x, [a.id]: "…" }));
        try { const out = await translate(`${a.titolo}\n\n${a.testo}`, lang); if (alive) setTr((x) => ({ ...x, [a.id]: out })); }
        catch { if (alive) setTr((x) => ({ ...x, [a.id]: null })); }
      }
    })();
    return () => { alive = false; };
  }, [home.avvisi, lang]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const speak = (a, text) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    if (speaking === a.id) { setSpeaking(null); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale(lang);
    u.onend = () => setSpeaking(null);
    setSpeaking(a.id);
    synth.speak(u);
  };

  const read = async (a) => {
    if (a.richiede_firma && !firma) return toast({ title: t("firma_richiesta"), variant: "destructive" });
    setBusy(true);
    try { await api.operaio.submit("lettura", { avviso_id: a.id, firma }); setOpen(null); setFirma(""); onChanged(); }
    catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  if (!home.avvisi.length) return <Card><p className="text-sm text-zinc-500">—</p></Card>;
  return (
    <div className="space-y-2">
      {home.avvisi.map((a) => {
        const translated = tr[a.id] && tr[a.id] !== "…" ? tr[a.id] : null;
        const showOrig = orig[a.id] || !translated;
        const text = showOrig ? `${a.titolo}\n\n${a.testo}` : translated;
        return (
          <Card key={a.id}>
            <div className="flex items-start gap-2">
              <p className="flex-1 font-semibold text-zinc-900 whitespace-pre-wrap">{showOrig ? a.titolo : translated.split("\n")[0]}</p>
              {a.letto ? <Pill tone="green">{t("letto")}</Pill> : a.richiede_firma ? <Pill tone="amber">{t("firma")}</Pill> : <Pill tone="amber">!</Pill>}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{fmtDay(a.data, lang)}{translated && !showOrig ? ` · ${t("traduzione_auto")}` : ""}</p>
            <p className="text-[15px] text-zinc-800 mt-2 whitespace-pre-wrap">{showOrig ? a.testo : translated.split("\n").slice(1).join("\n").trim()}</p>
            {tr[a.id] === "…" && <p className="mt-2 text-sm text-zinc-500 flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" />{t("traduci")}…</p>}
            <div className="flex flex-wrap gap-3 mt-2">
              {"speechSynthesis" in window && <button type="button" onClick={() => speak(a, text)} className="text-sm font-medium text-brand-700 flex items-center gap-1">{speaking === a.id ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}{speaking === a.id ? t("ferma") : t("ascolta")}</button>}
              {translated && <button type="button" onClick={() => setOrig({ ...orig, [a.id]: !orig[a.id] })} className="text-sm font-medium text-zinc-600 flex items-center gap-1"><Languages className="w-4 h-4" />{showOrig ? t("traduci") : t("testo_originale")}</button>}
            </div>
            {!a.letto && (open === a.id ? (
              <div className="mt-3 space-y-2">
                {a.richiede_firma && <div className="rounded-xl border border-zinc-200"><SignaturePad value={firma} onChange={setFirma} label={t("firma")} /></div>}
                <BigButton onClick={() => read(a)} disabled={busy}>{busy && <Loader2 className="w-5 h-5 animate-spin" />}{t("segna_letto")}</BigButton>
              </div>
            ) : <BigButton onClick={() => (a.richiede_firma ? setOpen(a.id) : read(a))} className="mt-3 border border-zinc-300 bg-white text-zinc-900">{a.richiede_firma ? t("firma") : t("segna_letto")}</BigButton>)}
          </Card>
        );
      })}
    </div>
  );
}

function Documenti({ home, t, lang }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { db.EmployeeDocument.filter({ dipendente_id: home.employee.id }, "-data_emissione", 300).then(setDocs).catch(() => setDocs([])); }, [home.employee.id]);
  const badge = async () => {
    setBusy(true);
    try {
      const [emp, prof] = await Promise.all([db.Employee.get(home.employee.id), db.CompanyProfile.list().then((l) => l[0])]);
      downloadBlob(await generateBadgePdf(emp, prof), `Tesserino_${emp.cognome || ""}.pdf`);
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const buste = (docs || []).filter((d) => d.tipo === "busta_paga");
  const altri = (docs || []).filter((d) => d.tipo !== "busta_paga");
  const row = (d) => {
    const g = d.data_scadenza ? daysTo(d.data_scadenza) : null;
    return (
      <li key={d.id}>
        <a href={d.file_url || "#"} className="py-3 flex items-center gap-3">
          <FileText className="w-5 h-5 text-zinc-400 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-zinc-900 truncate">{d.titolo}</span><span className="block text-xs text-zinc-500">{d.data_emissione ? fmtDay(d.data_emissione, lang) : ""}</span></span>
          {g !== null && <Pill tone={g < 0 ? "red" : g <= 30 ? "amber" : "green"}>{g < 0 ? t("scaduto") : `${t("scade")} ${fmtDay(d.data_scadenza, lang)}`}</Pill>}
        </a>
      </li>
    );
  };
  return (
    <div className="space-y-3">
      <BigButton onClick={badge} disabled={busy} className="bg-zinc-950 text-white">{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <IdCard className="w-5 h-5" />}{t("tesserino")}</BigButton>
      {docs === null ? <div className="py-8 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div> : (
        <>
          <Card title={t("buste_paga")}>{buste.length ? <ul className="divide-y divide-zinc-100 -my-2">{buste.map(row)}</ul> : <p className="text-sm text-zinc-500">{t("nessun_documento")}</p>}</Card>
          <Card title={t("corsi_visite")}>{altri.length ? <ul className="divide-y divide-zinc-100 -my-2">{altri.map(row)}</ul> : <p className="text-sm text-zinc-500">{t("nessun_documento")}</p>}</Card>
        </>
      )}
    </div>
  );
}

function Firme({ home, t, lang, onChanged }) {
  const { toast } = useToast();
  const [idx, setIdx] = useState(null);
  const [firma, setFirma] = useState("");
  const [busy, setBusy] = useState(false);
  const pos = home.worksites.flatMap((w) => w.pos.map((p) => ({ ...p, cantiere: w.nome })));
  const dpi = home.employee.dpi_consegnati || [];
  const sign = async () => {
    if (!firma) return;
    setBusy(true);
    try { await api.operaio.submit("firma_dpi", { index: idx, firma }); setIdx(null); setFirma(""); onChanged(); }
    catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <Card title={t("pos_da_firmare")} icon={HardHat}>
        {pos.length === 0 ? <p className="text-sm text-zinc-500">—</p> : <ul className="divide-y divide-zinc-100 -my-2">{pos.map((p) => (
          <li key={p.firma_token}><a href={`/firma/${p.firma_token}`} className="py-3 flex items-center gap-3"><span className="flex-1 text-sm"><b className="font-semibold">{p.titolo}</b><span className="block text-xs text-zinc-500">{p.cantiere}</span></span>{p.firmato ? <Pill tone="green">{t("firmato")}</Pill> : <Pill tone="amber">{t("firma_ora")}</Pill>}</a></li>
        ))}</ul>}
      </Card>
      <Card title={t("dpi_consegnati")}>
        {dpi.length === 0 ? <p className="text-sm text-zinc-500">—</p> : <ul className="divide-y divide-zinc-100 -my-2">{dpi.map((d, i) => (
          <li key={i} className="py-3">
            <div className="flex items-center gap-3"><span className="flex-1 text-sm"><b className="font-semibold">{d.articolo}</b><span className="block text-xs text-zinc-500">{d.data_consegna ? fmtDay(d.data_consegna, lang) : ""}{d.taglia ? ` · ${d.taglia}` : ""}{d.quantita ? ` · ×${d.quantita}` : ""}</span></span>
              {d.firma ? <Pill tone="green">{t("firmato")}</Pill> : <button type="button" onClick={() => { setIdx(i); setFirma(""); }} className="h-9 px-3 rounded-lg bg-zinc-950 text-white text-sm font-semibold">{t("firma")}</button>}</div>
            {idx === i && <div className="mt-3 space-y-2"><div className="rounded-xl border border-zinc-200"><SignaturePad value={firma} onChange={setFirma} label={t("firma_consegna")} /></div><BigButton onClick={sign} disabled={busy || !firma}>{busy && <Loader2 className="w-5 h-5 animate-spin" />}{t("firma_consegna")}</BigButton></div>}
          </li>
        ))}</ul>}
      </Card>
    </div>
  );
}

function Mezzi({ home, t, lang, onChanged, onGuasto }) {
  const { toast } = useToast();
  const [km, setKm] = useState({});
  const [saving, setSaving] = useState(null);
  const num = (v) => Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  const save = async (m) => {
    setSaving(m.id);
    try { await api.operaio.submit("km", { mezzo_id: m.id, ore_km: km[m.id] }); toast({ title: "✓" }); setKm({ ...km, [m.id]: undefined }); onChanged(); }
    catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setSaving(null); }
  };
  if (!home.mezzi_miei.length) return <Card><p className="text-sm text-zinc-500">—</p></Card>;
  return (
    <div className="space-y-2">
      {home.mezzi_miei.map((m) => {
        const v = km[m.id];
        const lower = v && m.ore_km && num(v) < num(m.ore_km);
        const sc = deadlines(m).slice(0, 4);
        return (
          <Card key={m.id}>
            <p className="font-semibold text-zinc-900 flex items-center gap-2"><Truck className="w-4 h-4 text-zinc-500" aria-hidden="true" />{m.nome}</p>
            <p className="text-xs text-zinc-500">{[m.tipo, m.targa, m.worksite_nome].filter(Boolean).join(" · ")}</p>
            {sc.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2" aria-label={t("scadenze")}>
                {sc.map((d) => <Pill key={d.key} tone={d.stato === "scaduta" ? "red" : d.stato === "vicina" ? "amber" : "zinc"}>{t(`sc_${d.key}`)} · {fmtDay(d.data, lang)}</Pill>)}
              </div>
            )}
            <label className="block mt-3">
              <span className="text-sm font-medium text-zinc-800">{t("km_ore")}</span>
              <div className="flex gap-2 mt-1">
                <input inputMode="numeric" value={v ?? ""} onChange={(e) => setKm({ ...km, [m.id]: e.target.value })} className={`${inputCls} flex-1 ${lower ? "border-amber-500" : ""}`} placeholder={m.ore_km ? `${t("ultimo_valore")}: ${m.ore_km}` : ""} />
                <button type="button" onClick={() => save(m)} disabled={!v || saving === m.id} className="h-12 px-4 rounded-xl bg-zinc-950 text-white font-semibold disabled:opacity-50">{saving === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : t("aggiorna")}</button>
              </div>
            </label>
            {lower && <p className="text-xs text-amber-800 mt-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />{t("valore_basso")} ({m.ore_km})</p>}
            <button type="button" onClick={() => onGuasto(m)} className="mt-3 w-full h-11 rounded-xl border border-red-200 text-red-700 font-semibold flex items-center justify-center gap-2"><Wrench className="w-4 h-4" aria-hidden="true" />{t("segnala_guasto")}</button>
          </Card>
        );
      })}
    </div>
  );
}

// Altro: avvisi, documenti, firme, mezzi, lingua ed esci.
export default function MoreTab({ home, t, lang, setLang, section, setSection, onChanged, onGuasto }) {
  const unread = home.avvisi.filter((a) => !a.letto).length;
  const toSign = home.worksites.flatMap((w) => w.pos).filter((p) => !p.firmato).length + (home.employee.dpi_consegnati || []).filter((d) => !d.firma).length;
  const items = [
    ["avvisi", t("avvisi"), Megaphone, unread],
    ["documenti", t("documenti"), FileText, 0],
    ["firme", t("firme"), CheckCircle2, toSign],
    ["mezzi", t("i_miei_mezzi"), Truck, 0],
  ];
  if (section) {
    const title = items.find((i) => i[0] === section)?.[1];
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setSection(null)} className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 h-10"><ArrowLeft className="w-4 h-4" />{t("altro")}</button>
        <h2 className="font-display text-2xl font-bold uppercase">{title}</h2>
        {section === "avvisi" && <Avvisi home={home} t={t} lang={lang} onChanged={onChanged} />}
        {section === "documenti" && <Documenti home={home} t={t} lang={lang} />}
        {section === "firme" && <Firme home={home} t={t} lang={lang} onChanged={onChanged} />}
        {section === "mezzi" && <Mezzi home={home} t={t} lang={lang} onChanged={onChanged} onGuasto={onGuasto} />}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Card>
        <ul className="divide-y divide-zinc-100 -my-2">
          {items.map(([k, label, I, n]) => (
            <li key={k}><button type="button" onClick={() => setSection(k)} className="w-full py-4 flex items-center gap-3 text-left">
              <span className="grid place-items-center w-10 h-10 rounded-xl bg-zinc-100"><I className="w-5 h-5 text-zinc-700" aria-hidden="true" /></span>
              <span className="flex-1 font-semibold text-zinc-900">{label}</span>
              {n > 0 && <span className="min-w-[24px] h-6 rounded-full bg-brand-600 text-white text-xs font-bold grid place-items-center px-1.5">{n}</span>}
              <ChevronRight className="w-5 h-5 text-zinc-400" aria-hidden="true" />
            </button></li>
          ))}
        </ul>
      </Card>
      <Card title={t("lingua")} icon={Languages}>
        <div className="grid grid-cols-3 gap-2">
          {LANGS.map((l) => <button key={l.code} type="button" onClick={() => setLang(l.code)} className={`h-12 rounded-xl border font-semibold ${lang === l.code ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-200 text-zinc-700"}`}>{l.label}</button>)}
        </div>
      </Card>
      <BigButton onClick={() => api.auth.logout("/login")} className="border border-zinc-300 bg-white text-zinc-800"><LogOut className="w-5 h-5" />{t("esci")}</BigButton>
    </div>
  );
}
