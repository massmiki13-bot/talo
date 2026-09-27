import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, FileDown, Phone, Mail, AlertTriangle, Clock } from "lucide-react";
import SignaturePad from "@/components/shared/SignaturePad";
import { calcQuote, chapterTotals, rowTotal, isVoce, UNIT_OPTIONS, fmtEur, expiryDate, conditionsText } from "@/lib/quotes";
import { generateQuotePDF } from "@/utils/quoteTemplates";

// Pagina pubblica del preventivo: nessun login, accesso con il link segreto.
export default function PublicQuote() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null); // "accetta" | "rifiuta"
  const [nome, setNome] = useState("");
  const [commento, setCommento] = useState("");
  const [firma, setFirma] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch(`/api/quote-public?t=${encodeURIComponent(token)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Link non valido"); return j; })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  const q = data?.quote;
  const p = data?.profile || {};
  const totals = useMemo(() => (q ? calcQuote(q.righe || [], q) : null), [q]);
  const chapters = useMemo(() => (q ? chapterTotals(q.righe || []) : []), [q]);

  useEffect(() => { if (p.ragione_sociale) document.title = `Preventivo ${q?.numero || ""} – ${p.ragione_sociale}`; }, [p, q]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900">{error}</h1>
          <p className="text-sm text-slate-600 mt-2">Il link potrebbe essere stato sostituito da una versione più recente. Contatta l'azienda che te l'ha inviato.</p>
        </div>
      </div>
    );
  }
  if (!q) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></div>;

  const color = p.colore_principale || "#1d4ed8";
  const exp = expiryDate(q);
  const expired = exp && exp < new Date(new Date().toDateString());
  const answered = done || (["approvato", "rifiutato"].includes(q.stato) ? q.stato : null);
  const unit = (u) => UNIT_OPTIONS.find((x) => x.value === u)?.label || u || "";

  const submit = async () => {
    setFormError("");
    if (!nome.trim()) return setFormError("Inserisci nome e cognome");
    if (mode === "accetta" && !firma) return setFormError("Firma nel riquadro per accettare");
    setSending(true);
    try {
      const r = await fetch("/api/quote-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, esito: mode, nome, commento, firma: mode === "accetta" ? firma : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Invio non riuscito");
      setDone(j.stato);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSending(false);
    }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const blob = await generateQuotePDF(q.template_variante || "classica", {
        profile: p, quote: q, righe: q.righe || [], totals, chapters, conditions: conditionsText(q),
        selectedClient: data.cliente, clienteFirma: q.firma_cliente_url, unitOptions: UNIT_OPTIONS, calcRowTotal: rowTotal,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Preventivo_${q.numero || ""}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-6 sm:py-10 px-3">
      <article className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div style={{ background: color }} className="h-2" />
        {/* Intestazione azienda */}
        <header className="px-5 sm:px-8 pt-6 pb-5 flex flex-col sm:flex-row sm:items-start gap-4 border-b border-slate-100">
          <div className="flex-1">
            {p.logo_url && <img src={p.logo_url} alt={p.ragione_sociale} className="max-h-14 max-w-[200px] object-contain mb-3" />}
            <p className="font-semibold text-slate-900">{p.ragione_sociale}</p>
            <p className="text-xs text-slate-600">{[p.indirizzo, [p.cap, p.citta, p.provincia && `(${p.provincia})`].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
            {p.partita_iva && <p className="text-xs text-slate-600">P.IVA {p.partita_iva}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Preventivo</p>
            <p className="text-xl font-bold text-slate-900">N. {q.numero}{q.revisione ? ` · Rev. ${q.revisione}` : ""}</p>
            <p className="text-sm text-slate-600">del {q.data ? new Date(q.data).toLocaleDateString("it-IT") : ""}</p>
            {exp && <p className={`text-sm ${expired ? "text-red-700 font-medium" : "text-slate-600"}`}>{expired ? "Scaduto il" : "Valido fino al"} {exp.toLocaleDateString("it-IT")}</p>}
          </div>
        </header>

        <div className="px-5 sm:px-8 py-5 space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Per</p>
            <p className="font-semibold text-slate-900">{q.cliente_nome}</p>
            {q.oggetto && <p className="text-lg text-slate-800 mt-2"><span className="text-slate-500">Oggetto:</span> {q.oggetto}</p>}
          </div>

          {/* Voci */}
          <div className="overflow-x-auto -mx-5 sm:mx-0">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 px-5 sm:px-0">Descrizione</th><th className="py-2 text-right">Q.tà</th><th className="py-2 text-right">Prezzo</th><th className="py-2 text-right pr-5 sm:pr-0">Importo</th>
                </tr>
              </thead>
              <tbody>
                {(q.righe || []).map((r, i) => {
                  if (r.tipo === "capitolo") return <tr key={i}><td colSpan={4} className="pt-5 pb-1.5 px-5 sm:px-0 font-semibold uppercase tracking-wide text-slate-900 border-b-2" style={{ borderColor: color }}>{r.descrizione}</td></tr>;
                  if (r.tipo === "testo") return <tr key={i}><td colSpan={4} className="py-2 px-5 sm:px-0 text-slate-700 whitespace-pre-wrap">{r.descrizione}</td></tr>;
                  if (!isVoce(r)) return null;
                  return (
                    <tr key={i} className={`border-b border-slate-100 align-top ${r.opzionale ? "text-slate-500" : ""}`}>
                      <td className="py-2.5 px-5 sm:px-0 pr-3 whitespace-pre-wrap">
                        {r.opzionale && <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 mr-1.5">Opzionale</span>}
                        {r.descrizione}
                      </td>
                      <td className="py-2.5 text-right tabular-nums whitespace-nowrap">{Number(r.quantita || 0).toLocaleString("it-IT")} {unit(r.unita_misura)}</td>
                      <td className="py-2.5 text-right tabular-nums whitespace-nowrap">{fmtEur(r.prezzo_unitario)}{r.sconto ? <span className="block text-xs text-slate-500">−{r.sconto}%</span> : null}</td>
                      <td className="py-2.5 text-right tabular-nums whitespace-nowrap pr-5 sm:pr-0">{r.opzionale ? `(${fmtEur(rowTotal(r))})` : fmtEur(rowTotal(r))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totali */}
          <div className="sm:ml-auto sm:w-80 space-y-1.5 text-sm">
            {totals.sconto_importo > 0.005 && <div className="flex justify-between text-slate-600"><span>Sconto {q.sconto_globale}%</span><span className="tabular-nums">−{fmtEur(totals.sconto_importo)}</span></div>}
            <div className="flex justify-between"><span className="text-slate-600">Imponibile</span><span className="tabular-nums">{fmtEur(totals.imponibile)}</span></div>
            {totals.iva.map((x) => <div key={x.aliquota} className="flex justify-between text-slate-600"><span>IVA {x.aliquota}%</span><span className="tabular-nums">{fmtEur(x.imposta)}</span></div>)}
            <div className="flex justify-between text-lg font-bold border-t border-slate-200 pt-2"><span>Totale</span><span className="tabular-nums" style={{ color }}>{fmtEur(totals.totale)}</span></div>
            {totals.opzionali > 0.005 && <p className="text-xs text-slate-500">Voci opzionali escluse dal totale: {fmtEur(totals.opzionali)} + IVA</p>}
          </div>

          {conditionsText(q) && (
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">Condizioni</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{conditionsText(q)}</p>
            </div>
          )}
          {q.note && <p className="text-sm text-slate-700 whitespace-pre-wrap">{q.note}</p>}

          {(q.allegati || []).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {q.allegati.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={a.url} alt={a.name} className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                  <p className="text-xs text-slate-600 mt-1 truncate">{a.name}</p>
                </a>
              ))}
            </div>
          )}

          <Button variant="outline" onClick={downloadPdf} disabled={downloading} className="gap-1.5">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Scarica il PDF
          </Button>
        </div>

        {/* Risposta */}
        <footer className="border-t border-slate-200 bg-slate-50 px-5 sm:px-8 py-6">
          {answered === "approvato" ? (
            <div className="flex gap-3 items-start">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900">Preventivo accettato</p>
                <p className="text-sm text-slate-600">Grazie! {p.ragione_sociale} ha ricevuto la conferma e ti contatterà per i prossimi passi.</p>
              </div>
            </div>
          ) : answered === "rifiutato" ? (
            <div className="flex gap-3 items-start">
              <XCircle className="w-7 h-7 text-slate-500 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900">Risposta inviata</p>
                <p className="text-sm text-slate-600">Abbiamo comunicato a {p.ragione_sociale} che il preventivo non è stato accettato.</p>
              </div>
            </div>
          ) : expired ? (
            <div className="flex gap-3 items-start">
              <Clock className="w-6 h-6 text-amber-600 shrink-0" />
              <p className="text-sm text-slate-700">L'offerta è scaduta. Contatta {p.ragione_sociale} per ricevere un preventivo aggiornato.</p>
            </div>
          ) : !mode ? (
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <p className="text-sm text-slate-700 flex-1">Puoi accettare il preventivo firmando qui online, oppure indicarci che non ti interessa.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode("rifiuta")}>Non accetto</Button>
                <Button onClick={() => setMode("accetta")} style={{ background: color }} className="text-white hover:opacity-90">Accetta e firma</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-semibold text-slate-900">{mode === "accetta" ? "Accetta il preventivo" : "Non accetto il preventivo"}</p>
              <div><Label htmlFor="pub-nome">Nome e cognome</Label><Input id="pub-nome" className="mt-1 bg-white" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" /></div>
              {mode === "accetta" && (
                <div>
                  <p className="text-sm text-slate-700 mb-1.5">Firma per accettazione di {fmtEur(totals.totale)} IVA inclusa{q.condizioni_pagamento ? `, pagamento: ${q.condizioni_pagamento}` : ""}.</p>
                  <div className="bg-white rounded-lg"><SignaturePad value={firma} onChange={setFirma} label="Firma" /></div>
                </div>
              )}
              <div>
                <Label htmlFor="pub-commento">{mode === "accetta" ? "Note (facoltative)" : "Motivo (facoltativo, ci aiuta a migliorare)"}</Label>
                <textarea id="pub-commento" value={commento} onChange={(e) => setCommento(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-input p-2 text-sm bg-white" />
              </div>
              {formError && <p className="text-sm text-red-700">{formError}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setMode(null); setFormError(""); }}>Indietro</Button>
                <Button onClick={submit} disabled={sending} style={mode === "accetta" ? { background: color } : undefined} className={mode === "accetta" ? "text-white hover:opacity-90" : ""} variant={mode === "accetta" ? "default" : "destructive"}>
                  {sending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}{mode === "accetta" ? "Conferma accettazione" : "Invia risposta"}
                </Button>
              </div>
              {mode === "accetta" && <p className="text-xs text-slate-500">Confermando accetti il preventivo e le condizioni indicate. Registriamo nome, data e firma.</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-4 mt-5 pt-4 border-t border-slate-200 text-sm">
            {p.telefono && <a href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900"><Phone className="w-4 h-4" /> {p.telefono}</a>}
            {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900"><Mail className="w-4 h-4" /> {p.email}</a>}
          </div>
        </footer>
      </article>
      <p className="text-center text-xs text-slate-500 mt-4">Documento inviato con Talo</p>
    </div>
  );
}
