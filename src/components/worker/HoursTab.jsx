import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import { sendWorker } from "@/lib/worker";
import { Card, BigButton, Pill, fmtDay } from "./ui";

const STATO_COLORE = { presente: "bg-emerald-500", ferie: "bg-sky-500", permesso: "bg-violet-500", malattia: "bg-amber-500", assente: "bg-red-500" };

// Le mie ore (calendario del mese) e richieste di ferie, permessi e malattia.
export default function HoursTab({ home, t, lang, onSent }) {
  const { toast } = useToast();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [records, setRecords] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const me = home.employee.id;

  useEffect(() => {
    const from = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
    const to = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-31`;
    db.DailyAttendance.filter({ data: { $gte: from, $lte: to } }, "data", 500).then(setRecords).catch(() => setRecords([]));
  }, [month]);

  const days = useMemo(() => {
    const map = {};
    for (const r of records || []) for (const p of r.presenze || []) {
      if (p.dipendente_id !== me) continue;
      const d = (map[r.data] ||= { ore: 0, stato: p.stato || "presente", cantieri: [] });
      d.ore += Number(p.ore) || 0;
      if ((p.stato || "presente") === "presente") { d.stato = "presente"; if (r.cantiere_nome) d.cantieri.push(r.cantiere_nome); }
      else if (d.stato !== "presente") d.stato = p.stato;
    }
    return map;
  }, [records, me]);

  const tot = useMemo(() => {
    const std = (Number(home.employee.ore_settimanali) || 40) / 5;
    let ore = 0, giorni = 0, extra = 0; const count = {};
    for (const d of Object.values(days)) {
      count[d.stato] = (count[d.stato] || 0) + 1;
      if (d.stato === "presente") { ore += d.ore; giorni++; extra += Math.max(0, d.ore - std); }
    }
    return { ore, giorni, extra, count };
  }, [days, home.employee.ore_settimanali]);

  const cells = useMemo(() => {
    const first = (month.getDay() + 6) % 7;
    const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];
  }, [month]);

  const sendRequest = async () => {
    if (!form.dal) return;
    setBusy(true);
    try {
      await sendWorker("richiesta", form);
      toast({ title: t("richiesta_ok") });
      setForm(null); onSent?.();
    } catch (e) { toast({ title: t("errore"), description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const monthLabel = month.toLocaleDateString(lang === "ro" ? "ro-RO" : lang === "sq" ? "sq-AL" : "it-IT", { month: "long", year: "numeric" });
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="w-11 h-11 grid place-items-center rounded-xl border border-zinc-200" aria-label="◀"><ChevronLeft className="w-5 h-5" /></button>
          <p className="font-display text-xl font-bold uppercase">{monthLabel}</p>
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="w-11 h-11 grid place-items-center rounded-xl border border-zinc-200" aria-label="▶"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div className="rounded-xl bg-zinc-50 p-2.5"><p className="font-display text-2xl font-bold tabular-nums">{tot.ore.toLocaleString("it-IT")}</p><p className="text-xs text-zinc-600">{t("ore_mese")}</p></div>
          <div className="rounded-xl bg-zinc-50 p-2.5"><p className="font-display text-2xl font-bold tabular-nums">{tot.giorni}</p><p className="text-xs text-zinc-600">{t("giorni_lavorati")}</p></div>
          <div className="rounded-xl bg-zinc-50 p-2.5"><p className="font-display text-2xl font-bold tabular-nums">{tot.extra.toLocaleString("it-IT")}</p><p className="text-xs text-zinc-600">{t("straordinari")}</p></div>
        </div>
        {records === null ? <div className="py-8 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div> : (
          <div className="grid grid-cols-7 gap-1 mt-3">
            {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => <span key={i} className="text-center text-[11px] text-zinc-500 font-medium">{d}</span>)}
            {cells.map((d, i) => d ? (
              <div key={d} className={`aspect-square rounded-lg border flex flex-col items-center justify-center ${d === todayIso ? "border-brand-600" : "border-zinc-100"}`}>
                <span className="text-xs text-zinc-700">{Number(d.slice(8))}</span>
                {days[d] && <span className={`mt-0.5 min-w-[22px] rounded text-[10px] font-semibold text-white px-1 ${STATO_COLORE[days[d].stato] || "bg-zinc-400"}`}>{days[d].stato === "presente" ? days[d].ore : days[d].stato[0].toUpperCase()}</span>}
              </div>
            ) : <span key={`x${i}`} />)}
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-600">
          {["presente", "ferie", "permesso", "malattia"].map((s) => <span key={s} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${STATO_COLORE[s]}`} />{t(s)}{tot.count[s] ? ` ${tot.count[s]}` : ""}</span>)}
        </div>
      </Card>

      <Card title={t("richieste")} action={!form && <button type="button" onClick={() => setForm({ tipo: "ferie", dal: todayIso, al: todayIso, note: "", certificato: "" })} className="h-9 px-3 rounded-lg bg-zinc-950 text-white text-sm font-semibold flex items-center gap-1"><Plus className="w-4 h-4" />{t("nuova_richiesta")}</button>}>
        {form && (
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-3 gap-1.5">
              {["ferie", "permesso", "malattia"].map((k) => <button key={k} type="button" onClick={() => setForm({ ...form, tipo: k })} className={`h-11 rounded-xl text-sm font-medium border ${form.tipo === k ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-200 text-zinc-700"}`}>{t(k)}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-sm font-medium text-zinc-800">{t("dal")}</span><input type="date" value={form.dal} onChange={(e) => setForm({ ...form, dal: e.target.value, al: form.al < e.target.value ? e.target.value : form.al })} className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-3" /></label>
              <label className="block"><span className="text-sm font-medium text-zinc-800">{t("al")}</span><input type="date" value={form.al} min={form.dal} onChange={(e) => setForm({ ...form, al: e.target.value })} className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-3" /></label>
            </div>
            {form.tipo === "malattia" && <label className="block"><span className="text-sm font-medium text-zinc-800">{t("certificato")}</span><input value={form.certificato} onChange={(e) => setForm({ ...form, certificato: e.target.value })} inputMode="numeric" className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-3" /></label>}
            <label className="block"><span className="text-sm font-medium text-zinc-800">{t("note")}</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full h-12 rounded-xl border border-zinc-300 px-3" /></label>
            <div className="grid grid-cols-2 gap-2">
              <BigButton onClick={() => setForm(null)} className="border border-zinc-300 bg-white text-zinc-800">{t("annulla")}</BigButton>
              <BigButton onClick={sendRequest} disabled={busy}>{busy && <Loader2 className="w-5 h-5 animate-spin" />}{t("invia")}</BigButton>
            </div>
          </div>
        )}
        {home.richieste.length === 0 && !form ? <p className="text-sm text-zinc-500">—</p> : (
          <ul className="divide-y divide-zinc-100">
            {home.richieste.map((r) => (
              <li key={r.id} className="py-2.5 flex items-center gap-3 text-sm">
                <span className="flex-1"><b className="font-semibold">{t(r.tipo)}</b> · {fmtDay(r.dal, lang)}{r.al && r.al !== r.dal ? ` → ${fmtDay(r.al, lang)}` : ""}{r.risposta ? <span className="block text-xs text-zinc-500">{r.risposta}</span> : null}</span>
                <Pill tone={r.stato === "approvata" ? "green" : r.stato === "respinta" ? "red" : "amber"}>{t(r.stato === "approvata" ? "approvata" : r.stato === "respinta" ? "respinta" : "in_attesa")}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
