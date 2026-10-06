import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, Plus, Save, Send, FileDown, Copy, Bookmark, LayoutTemplate, FolderOpen, Check, Loader2, Link2, MoreHorizontal,
  History, HardHat, Sparkles, ShieldCheck, XCircle, CheckCircle2, Eye, Image as ImageIcon, X, Upload, UserPlus, AlertTriangle, Clock,
} from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import SignaturePad from "@/components/shared/SignaturePad";
import QuoteTemplatePicker from "@/components/quotes/QuoteTemplatePicker";
import QuoteLines from "@/components/quotes/QuoteLines";
import ContactForm from "@/components/contacts/ContactForm";
import ComposeDialog from "@/components/email/ComposeDialog";
import LinkedEmails from "@/components/email/LinkedEmails";
import { QUOTE_TEMPLATES, generateQuotePDF } from "@/utils/quoteTemplates";
import { generateQuoteWord, generateQuoteExcel } from "@/utils/quoteWordExcel";
import { generateQuoteNumber } from "@/utils/quoteNumbering";
import {
  UNIT_OPTIONS, emptyRow, rowTotal, calcQuote, chapterTotals, QUOTE_STATES, effectiveState, expiryDate, fmtEur,
  conditionsText, DEFAULT_CLAUSOLE, randomToken,
} from "@/lib/quotes";
import { MODALITA_PAGAMENTO, displayName } from "@/lib/contacts";
import { escapeHtml } from "@/lib/email";

const STRIP = ["id", "created_date", "updated_date", "created_by", "created_by_id", "_oldWorksiteId"];
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !STRIP.includes(k)));

function Section({ title, children, action, className = "" }) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide flex-1">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export default function QuoteEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isNew = id === "nuovo";

  const [quote, setQuote] = useState(null);
  const [righe, setRighe] = useState([emptyRow()]);
  const [contacts, setContacts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [worksites, setWorksites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showCosts, setShowCosts] = useState(false);
  const [clienteFirma, setClienteFirma] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("classica");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [compose, setCompose] = useState(null);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const client = contacts.find((c) => c.id === quote?.cliente_id) || null;
  const totals = useMemo(() => calcQuote(righe, quote || {}), [righe, quote]);
  const chapters = useMemo(() => chapterTotals(righe), [righe]);
  const state = quote ? effectiveState(quote) : "in_attesa";
  const exp = quote ? expiryDate(quote) : null;
  const locked = !isNew && ["approvato"].includes(quote?.stato);

  const set = (patch) => { setQuote((q) => ({ ...q, ...patch })); setDirty(true); };
  const setRows = (updater) => { setRighe(updater); setDirty(true); };

  useEffect(() => { load(); }, [id]);

  // Avviso se si esce con modifiche non salvate.
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const load = async () => {
    setLoading(true);
    try {
      const [cls, profiles, sites] = await Promise.all([
        db.Contact.list("nome", 5000),
        db.CompanyProfile.list(),
        db.Worksite.list("-created_date", 1000),
      ]);
      const clienti = cls.filter((c) => c.tipo !== "fornitore" && !c.archiviato);
      setContacts(clienti);
      const prof = profiles[0] || null;
      setProfile(prof);
      setWorksites(sites);

      if (isNew) {
        let templateData = null;
        let importData = null;
        if (params.get("template")) templateData = await db.SavedTemplate.get(params.get("template")).catch(() => null);
        if (params.get("import")) {
          const stored = sessionStorage.getItem("quoteImport");
          if (stored) { importData = JSON.parse(stored); sessionStorage.removeItem("quoteImport"); }
        }
        const tpl = prof?.template_predefinito || "classica";
        setSelectedTemplate(tpl);
        const existing = await db.Quote.fields(["numero", "anno"], { limit: 10000 });
        const { numero, anno } = generateQuoteNumber(prof, existing);
        const base = {
          numero, anno,
          data: new Date().toISOString().slice(0, 10),
          cliente_id: "", cliente_nome: importData?.cliente_nome || "",
          oggetto: importData?.oggetto || templateData?.oggetto || "",
          stato: "in_attesa",
          note: importData?.note || templateData?.note || "",
          validita_giorni: importData?.validita_giorni || templateData?.validita_giorni || 30,
          template_variante: tpl,
          worksite_id: params.get("lavoro") || importData?.worksite_id || "", worksite_nome: sites.find((w) => w.id === (params.get("lavoro") || importData?.worksite_id))?.nome || "",
          sconto_globale: Number(importData?.sconto_globale) || 0,
          condizioni_pagamento: importData?.condizioni_pagamento || "", tempi_esecuzione: importData?.tempi_esecuzione || "", clausole: importData?.clausole || DEFAULT_CLAUSOLE,
          copertina: false, allegati: [], revisione: 0, revisioni: [],
        };
        setQuote(base);
        setRighe(importData?.righe?.length ? importData.righe : templateData?.righe?.length ? templateData.righe : [emptyRow()]);
        const preselect = params.get("cliente");
        if (preselect) {
          const c = clienti.find((x) => x.id === preselect);
          if (c) applyClient(c, base, true);
        }
        setDirty(false);
      } else {
        const q = await db.Quote.get(id);
        q._oldWorksiteId = q.worksite_id || "";
        setQuote(q);
        setRighe(q.righe?.length ? q.righe : [emptyRow()]);
        setClienteFirma(q.firma_cliente_url || "");
        setSelectedTemplate(q.template_variante || prof?.template_predefinito || "classica");
        if ((q.righe || []).some((r) => r.costo_unitario !== null && r.costo_unitario !== undefined && r.costo_unitario !== "")) setShowCosts(true);
        setDirty(false);
      }
    } catch (e) {
      toast({ title: "Preventivo non trovato", variant: "destructive" });
      navigate("/preventivi");
    } finally {
      setLoading(false);
    }
  };

  // Condizioni abituali del cliente sul preventivo (solo dove non già compilate).
  const applyClient = (c, base = quote, silent = false) => {
    const patch = { cliente_id: c?.id || "", cliente_nome: c ? displayName(c) : "" };
    if (c) {
      if (c.pagamento_default && !base.condizioni_pagamento) patch.condizioni_pagamento = c.pagamento_default;
      if (c.sconto_default && !Number(base.sconto_globale)) patch.sconto_globale = Number(c.sconto_default);
      if (c.iva_default !== null && c.iva_default !== undefined && c.iva_default !== "") {
        setRighe((rows) => rows.map((r) => (r.tipo && r.tipo !== "voce") || rowTotal(r) > 0 ? r : { ...r, iva_percentuale: Number(c.iva_default) }));
      }
    }
    setQuote((q) => ({ ...(q || base), ...patch }));
    setDirty(true);
    if (!silent && c && (patch.condizioni_pagamento || patch.sconto_globale)) toast({ title: "Applicate le condizioni abituali del cliente" });
  };

  // L'IA propone l'oggetto partendo da voci, cliente e cantiere.
  const [oggettoBusy, setOggettoBusy] = useState(false);
  const suggestOggetto = async () => {
    const voci = righe.filter((r) => r.descrizione).map((r) => (r.tipo === "capitolo" ? `## ${r.descrizione}` : `- ${r.descrizione}`)).join("\n").slice(0, 6000);
    if (!voci) return toast({ title: "Inserisci prima qualche voce", description: "L'oggetto viene proposto a partire dalle voci del preventivo." });
    setOggettoBusy(true);
    try {
      const r = await api.integrations.Core.InvokeLLM({
        prompt: `Proponi l'oggetto di un preventivo edile italiano: una riga di massimo 90 caratteri, chiara e professionale, del tipo "Ristrutturazione bagno e cucina – Via Roma 88, Bolzano". Usa l'indirizzo del cantiere se presente.
Cliente: ${quote.cliente_nome || "—"}
Cantiere: ${quote.worksite_nome || client?.indirizzo || "—"}
Voci:
${voci}`,
        response_json_schema: { type: "object", properties: { oggetto: { type: "string" } } },
      });
      if (r?.oggetto) set({ oggetto: r.oggetto.trim().slice(0, 140) });
    } catch (e) { toast({ title: "Suggerimento non riuscito", description: e.message, variant: "destructive" }); }
    finally { setOggettoBusy(false); }
  };

  const defaultIva = client?.iva_default !== null && client?.iva_default !== undefined && client?.iva_default !== "" ? Number(client.iva_default) : 22;

  const buildCtx = (q = quote) => ({
    profile,
    quote: { ...q, template_variante: selectedTemplate },
    righe,
    totals,
    chapters,
    conditions: conditionsText(q),
    selectedClient: client,
    clienteFirma,
    unitOptions: UNIT_OPTIONS,
    calcRowTotal: rowTotal,
  });

  const payload = () => ({
    ...clean(quote),
    righe,
    imponibile: totals.imponibile,
    iva_totale: totals.iva_totale,
    totale: totals.totale,
    costo_totale: totals.costo,
    margine: totals.margine,
    template_variante: selectedTemplate,
    ...(clienteFirma && clienteFirma !== quote.firma_cliente_url
      ? { firma_cliente_url: clienteFirma, data_firma_cliente: new Date().toISOString().slice(0, 10), stato: "approvato" }
      : {}),
  });

  const syncWorksiteLink = async (quoteId, newId, oldId) => {
    if (oldId && oldId !== newId) {
      const old = await db.Worksite.get(oldId).catch(() => null);
      if (old?.preventivo_id === quoteId) await db.Worksite.update(oldId, { preventivo_id: "" }).catch(() => {});
    }
    if (newId) {
      const site = await db.Worksite.get(newId).catch(() => null);
      if (site && site.preventivo_id !== quoteId) await db.Worksite.update(newId, { preventivo_id: quoteId }).catch(() => {});
    }
  };

  const save = async ({ silent = false } = {}) => {
    if (!quote.numero?.trim()) { toast({ title: "Inserisci il numero del preventivo", variant: "destructive" }); return null; }
    setSaving(true);
    try {
      const data = payload();
      let saved;
      if (isNew) {
        saved = await db.Quote.create(data);
        await syncWorksiteLink(saved.id, data.worksite_id || "", null);
        setDirty(false);
        if (!silent) toast({ title: "Preventivo salvato" });
        navigate(`/preventivi/${saved.id}`, { replace: true });
      } else {
        saved = await db.Quote.update(id, data);
        await syncWorksiteLink(id, data.worksite_id || "", quote._oldWorksiteId);
        setQuote({ ...saved, _oldWorksiteId: data.worksite_id || "" });
        setDirty(false);
        if (!silent) toast({ title: "Preventivo aggiornato" });
      }
      return saved;
    } catch (e) {
      toast({ title: e.message || "Salvataggio non riuscito", variant: "destructive" });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const pdfBlob = async () => generateQuotePDF(selectedTemplate, buildCtx());

  const download = async (kind) => {
    setGenerating(true);
    try {
      if (kind === "pdf") {
        const blob = await pdfBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `Preventivo_${quote.numero || "bozza"}${quote.revisione ? `_Rev${quote.revisione}` : ""}.pdf`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } else if (kind === "excel") generateQuoteExcel(buildCtx());
      else if (kind === "word") generateQuoteWord(buildCtx());
    } catch (e) {
      toast({ title: "Generazione non riuscita", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // Link pubblico: il cliente vede, accetta con firma o rifiuta.
  const ensureLink = async () => {
    if (isNew || dirty) {
      const saved = await save({ silent: true });
      if (!saved) return null;
      if (isNew) { toast({ title: "Preventivo salvato: ora puoi condividere il link" }); return null; }
    }
    let token = quote.public_token;
    if (!token) {
      token = randomToken();
      await db.Quote.update(id, { public_token: token });
      setQuote((q) => ({ ...q, public_token: token }));
    }
    return `${window.location.origin}/p/${token}`;
  };

  const copyLink = async () => {
    const link = await ensureLink();
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => {});
    toast({ title: "Link copiato", description: "Incollalo in un messaggio o su WhatsApp: il cliente potrà accettare e firmare online." });
  };

  const openSend = async () => {
    const link = await ensureLink();
    if (!link) return;
    setGenerating(true);
    try {
      const blob = await pdfBlob();
      const nome = quote.cliente_nome || "Cliente";
      const body = `<p>Gentile ${escapeHtml(nome)},</p>
<p>come da accordi Le inviamo il preventivo n. ${escapeHtml(quote.numero)}${quote.revisione ? ` (revisione ${quote.revisione})` : ""}${quote.oggetto ? ` relativo a <strong>${escapeHtml(quote.oggetto)}</strong>` : ""}, per un importo complessivo di <strong>${fmtEur(totals.totale)}</strong> IVA inclusa.</p>
<p>Lo trova in allegato in PDF. Può anche consultarlo e <strong>accettarlo con firma online</strong> da questo link: <a href="${link}">${link}</a></p>
${exp ? `<p>L'offerta è valida fino al ${exp.toLocaleDateString("it-IT")}.</p>` : ""}
<p>Restiamo a disposizione per qualsiasi chiarimento.</p><p>Cordiali saluti</p>`;
      setCompose({
        defaultTo: client?.email || client?.pec || "",
        defaultSubject: `Preventivo n. ${quote.numero}${quote.oggetto ? ` – ${quote.oggetto}` : ""}`,
        defaultBody: body,
        attachment: { blob, filename: `Preventivo_${quote.numero || "bozza"}${quote.revisione ? `_Rev${quote.revisione}` : ""}.pdf` },
      });
    } catch (e) {
      toast({ title: "Generazione PDF non riuscita", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const onSent = async ({ to }) => {
    const today = new Date().toISOString().slice(0, 10);
    const patch = { inviato_a: to, data_invio: today, ...(["in_attesa", "scaduto"].includes(quote.stato) ? { stato: "inviato" } : {}) };
    await db.Quote.update(id, patch);
    setQuote((q) => ({ ...q, ...patch }));
    // Promemoria per sollecitare il cliente 3 giorni prima della scadenza.
    if (exp) {
      const when = new Date(exp); when.setDate(when.getDate() - 3);
      if (when > new Date()) {
        await db.Reminder.create({
          titolo: `Sollecita preventivo ${quote.numero} – ${quote.cliente_nome || ""}`,
          descrizione: `Il preventivo "${quote.oggetto || quote.numero}" (${fmtEur(totals.totale)}) scade il ${exp.toLocaleDateString("it-IT")} e non ha ancora risposta.`,
          data: when.toISOString().slice(0, 10), tipo: "sollecito_preventivo", completato: false, is_preavviso: true,
          riferimento_id: id, riferimento_tipo: "Quote",
        }).catch(() => {});
      }
    }
  };

  const changeState = async (stato) => {
    set({ stato });
    if (!isNew) { await db.Quote.update(id, { stato }); setDirty(false); toast({ title: `Stato: ${QUOTE_STATES[stato]?.label}` }); }
  };

  const duplicate = async () => {
    const existing = await db.Quote.fields(["numero", "anno"], { limit: 10000 });
    const { numero, anno } = generateQuoteNumber(profile, existing);
    const data = { ...payload(), numero, anno, data: new Date().toISOString().slice(0, 10), oggetto: quote.oggetto ? `${quote.oggetto} (copia)` : "",
      stato: "in_attesa", firma_cliente_url: "", data_firma_cliente: "", inviato_a: "", data_invio: "", public_token: null, visto_il: null,
      risposta_cliente: null, revisione: 0, revisioni: [], worksite_id: "", worksite_nome: "" };
    const created = await db.Quote.create(data);
    toast({ title: "Preventivo duplicato", description: `Nuovo n. ${numero}` });
    navigate(`/preventivi/${created.id}`);
  };

  // Nuova revisione: congela la versione attuale nello storico e riapre il preventivo.
  const newRevision = async () => {
    const motivo = prompt("Cosa cambia in questa revisione? (facoltativo)", "") ?? null;
    if (motivo === null) return;
    const current = await db.Quote.get(id);
    const snapshot = {
      rev: current.revisione || 0, data_revisione: new Date().toISOString(), motivo,
      data: current.data, oggetto: current.oggetto, righe: current.righe, totale: current.totale, imponibile: current.imponibile,
      note: current.note, condizioni_pagamento: current.condizioni_pagamento, tempi_esecuzione: current.tempi_esecuzione,
      clausole: current.clausole, sconto_globale: current.sconto_globale, stato: current.stato, risposta_cliente: current.risposta_cliente,
    };
    const patch = {
      revisioni: [...(current.revisioni || []), snapshot], revisione: (current.revisione || 0) + 1,
      stato: "in_attesa", data: new Date().toISOString().slice(0, 10), firma_cliente_url: "", data_firma_cliente: "",
      risposta_cliente: null, visto_il: null,
    };
    const saved = await db.Quote.update(id, patch);
    setQuote({ ...saved, _oldWorksiteId: saved.worksite_id || "" });
    setClienteFirma("");
    toast({ title: `Revisione ${patch.revisione} creata`, description: "La versione precedente è nello storico." });
  };

  const restoreRevision = (r) => {
    if (!confirm(`Riportare nell'editor il contenuto della Rev. ${r.rev}? Le modifiche diventano definitive quando salvi.`)) return;
    setRighe(r.righe || []);
    set({ oggetto: r.oggetto, note: r.note, condizioni_pagamento: r.condizioni_pagamento, tempi_esecuzione: r.tempi_esecuzione, clausole: r.clausole, sconto_globale: r.sconto_globale || 0 });
    setRevisionsOpen(false);
  };

  const saveAsTemplate = async () => {
    const nome = prompt("Nome del modello:", quote.oggetto || "Nuovo modello");
    if (!nome?.trim()) return;
    await db.SavedTemplate.create({ nome: nome.trim(), tipo: "preventivo", oggetto: quote.oggetto || "", righe, note: quote.note || "", validita_giorni: quote.validita_giorni || 30 });
    toast({ title: "Modello salvato", description: nome.trim() });
  };

  // Da preventivo accettato a lavoro, con cliente, importo e collegamento già pronti.
  const createWorksite = async () => {
    if (dirty && !(await save({ silent: true }))) return;
    const site = await db.Worksite.create({
      nome: quote.oggetto || `Lavoro ${quote.cliente_nome || ""}`.trim(),
      indirizzo: client ? [client.indirizzo, [client.cap, client.citta, client.provincia].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
      cliente_id: quote.cliente_id || "", cliente_nome: quote.cliente_nome || "",
      preventivo_id: id, importo_totale: totals.totale, stato: "da_iniziare", stato_pagamento: "non_pagato", attivo: true,
      note: [quote.condizioni_pagamento && `Pagamento: ${quote.condizioni_pagamento}`, quote.tempi_esecuzione && `Tempi: ${quote.tempi_esecuzione}`].filter(Boolean).join("\n"),
    });
    await db.Quote.update(id, { worksite_id: site.id, worksite_nome: site.nome });
    toast({ title: "Lavoro creato", description: site.nome });
    navigate(`/lavori/${site.id}`);
  };

  const uploadAttachments = async (files) => {
    setUploading(true);
    try {
      const added = [];
      for (const f of files) {
        if (!f.type.startsWith("image/")) { toast({ title: `${f.name}: solo immagini (JPG, PNG)`, variant: "destructive" }); continue; }
        const { file_url } = await api.integrations.Core.UploadFile({ file: f });
        added.push({ url: file_url, name: f.name.replace(/\.[^.]+$/, ""), type: f.type });
      }
      set({ allegati: [...(quote.allegati || []), ...added] });
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    await generatePreview(selectedTemplate);
  };

  const generatePreview = async (templateId) => {
    setSelectedTemplate(templateId);
    setGenerating(true);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    try {
      const blob = await generateQuotePDF(templateId, { ...buildCtx(), quote: { ...quote, template_variante: templateId } });
      setPreviewBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      toast({ title: "Anteprima non riuscita", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const pickerAction = async (templateId, action) => {
    setSelectedTemplate(templateId);
    set({ template_variante: templateId });
    if (!isNew) await db.Quote.update(id, { template_variante: templateId });
    setPickerOpen(false);
    if (action === "download_pdf" && previewBlob) {
      const url = URL.createObjectURL(previewBlob);
      const a = document.createElement("a"); a.href = url; a.download = `Preventivo_${quote.numero || "bozza"}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } else if (action === "download_word") generateQuoteWord(buildCtx());
    else if (action === "download_excel") generateQuoteExcel(buildCtx());
    else if (action === "send") openSend();
  };

  if (loading || !quote) return <LoadingSpinner />;

  const templateName = QUOTE_TEMPLATES.find((t) => t.id === selectedTemplate)?.nome || "Classica";
  const st = QUOTE_STATES[state] || QUOTE_STATES.in_attesa;
  const risposta = quote.risposta_cliente;

  return (
    <div className="pb-24">
      <Link to="/preventivi" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft className="w-4 h-4" /> Preventivi</Link>

      {/* Intestazione */}
      <div className="flex flex-col xl:flex-row xl:items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-[30px] leading-tight font-bold text-zinc-950">{isNew ? "Nuovo preventivo" : `Preventivo ${quote.numero}`}</h1>
            {quote.revisione > 0 && <span className="text-xs font-semibold rounded-full bg-slate-800 text-white px-2 py-0.5">Rev. {quote.revisione}</span>}
            {!isNew && <span className={`text-xs font-semibold rounded-full border px-2 py-0.5 ${st.className}`}>{st.label}</span>}
            {dirty && <span className="text-xs text-amber-700">· modifiche non salvate</span>}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {quote.cliente_nome || "Nessun cliente"}{exp && ` · valido fino al ${exp.toLocaleDateString("it-IT")}`}
            {quote.visto_il && ` · visto dal cliente il ${new Date(quote.visto_il).toLocaleDateString("it-IT")}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew && (
            <>
              <Button variant="outline" onClick={openPicker} className="gap-1.5"><LayoutTemplate className="w-4 h-4" /> Anteprima PDF</Button>
              <Button variant="outline" onClick={copyLink} className="gap-1.5"><Link2 className="w-4 h-4" /> Link per il cliente</Button>
              <Button variant="outline" onClick={openSend} disabled={generating} className="gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Invia
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Altre azioni"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => download("pdf")}><FileDown className="w-4 h-4 mr-2" /> Scarica PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => download("excel")}><FileDown className="w-4 h-4 mr-2" /> Scarica Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => download("word")}><FileDown className="w-4 h-4 mr-2" /> Scarica Word</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={newRevision}><History className="w-4 h-4 mr-2" /> Nuova revisione</DropdownMenuItem>
                  {(quote.revisioni || []).length > 0 && <DropdownMenuItem onClick={() => setRevisionsOpen(true)}><History className="w-4 h-4 mr-2" /> Storico revisioni ({quote.revisioni.length})</DropdownMenuItem>}
                  <DropdownMenuItem onClick={duplicate}><Copy className="w-4 h-4 mr-2" /> Duplica</DropdownMenuItem>
                  <DropdownMenuItem onClick={saveAsTemplate}><Bookmark className="w-4 h-4 mr-2" /> Salva come modello</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <Button onClick={() => save()} disabled={saving} className="gap-1.5 bg-brand-600 hover:bg-brand-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva
          </Button>
        </div>
      </div>

      {/* Risposta del cliente / azioni di stato */}
      {risposta && (
        <div className={`flex gap-3 rounded-xl border p-4 mb-4 ${risposta.esito === "accetta" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          {risposta.esito === "accetta" ? <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" /> : <XCircle className="w-5 h-5 text-red-700 shrink-0" />}
          <div className="text-sm flex-1">
            <p className="font-semibold text-slate-900">{risposta.esito === "accetta" ? "Accettato e firmato online" : "Rifiutato online"} da {risposta.nome} il {new Date(risposta.data).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</p>
            {risposta.commento && <p className="text-slate-700 mt-1">“{risposta.commento}”</p>}
          </div>
        </div>
      )}
      {!isNew && quote.stato === "approvato" && !quote.worksite_id && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-emerald-200 bg-white p-4 mb-4">
          <HardHat className="w-5 h-5 text-emerald-700 shrink-0" />
          <p className="text-sm text-slate-700 flex-1"><strong>Preventivo accettato.</strong> Crea il lavoro con cliente, importo e condizioni già compilati.</p>
          <Button onClick={createWorksite} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4" /> Crea il lavoro</Button>
        </div>
      )}
      {!isNew && quote.stato === "approvato" && (
        <div className="flex justify-end -mt-2 mb-4">
          <Button variant="outline" size="sm" onClick={() => navigate(`/fatture?da_preventivo=${quote.id}`)} className="gap-1.5"><Plus className="w-4 h-4" /> Crea la fattura</Button>
        </div>
      )}
      {!isNew && state === "scaduto" && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-sm text-amber-900">
          <Clock className="w-4 h-4 shrink-0" /> Offerta scaduta il {exp?.toLocaleDateString("it-IT")}. Per riproporla crea una nuova revisione o aumenta la validità.
        </div>
      )}
      {quote.worksite_id && (
        <Link to={`/lavori/${quote.worksite_id}`} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 mb-4 text-sm hover:bg-emerald-100">
          <FolderOpen className="w-4 h-4 text-emerald-700" /> <span className="text-emerald-900">Lavoro collegato: <strong>{quote.worksite_nome || worksites.find((w) => w.id === quote.worksite_id)?.nome || ""}</strong></span>
          <span className="ml-auto text-emerald-700 text-xs">Apri →</span>
        </Link>
      )}

      <div className="grid xl:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* Dati */}
          <Section title="Dati del preventivo">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label htmlFor="quoteeditor-n-preventivo">N° preventivo</Label><Input id="quoteeditor-n-preventivo" className="mt-1" value={quote.numero || ""} onChange={(e) => set({ numero: e.target.value })} /></div>
              <div><Label htmlFor="quoteeditor-data">Data</Label><Input id="quoteeditor-data" className="mt-1" type="date" value={quote.data || ""} onChange={(e) => set({ data: e.target.value })} /></div>
              <div><Label htmlFor="quoteeditor-validita-giorni">Validità (giorni)</Label><Input id="quoteeditor-validita-giorni" className="mt-1" type="number" inputMode="numeric" value={quote.validita_giorni ?? ""} onChange={(e) => set({ validita_giorni: e.target.value === "" ? "" : Number(e.target.value) })} /></div>
              <div>
                <Label htmlFor="quoteeditor-stato">Stato</Label>
                <Select value={quote.stato || "in_attesa"} onValueChange={changeState}>
                  <SelectTrigger id="quoteeditor-stato" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(QUOTE_STATES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="quoteeditor-cliente">Cliente</Label>
                <div className="flex gap-2 mt-1">
                  <Select value={quote.cliente_id || "none"} onValueChange={(v) => applyClient(contacts.find((c) => c.id === v) || null)}>
                    <SelectTrigger id="quoteeditor-cliente"><SelectValue placeholder="Seleziona cliente" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nessun cliente —</SelectItem>
                      {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{displayName(c)}{c.citta ? ` · ${c.citta}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setNewClientOpen(true)} aria-label="Nuovo cliente" title="Nuovo cliente"><UserPlus className="w-4 h-4" /></Button>
                </div>
                {client && <p className="text-xs text-slate-500 mt-1"><Link to={`/contatti/${client.id}`} className="text-brand-700 hover:underline">Scheda cliente</Link>{client.pagamento_default && ` · pagamento abituale: ${client.pagamento_default}`}</p>}
              </div>
              <div className="col-span-2">
                <Label htmlFor="quoteeditor-lavoro-collegato">Lavoro collegato</Label>
                <Select value={quote.worksite_id || "none"} onValueChange={(v) => set(v === "none" ? { worksite_id: "", worksite_nome: "" } : { worksite_id: v, worksite_nome: worksites.find((w) => w.id === v)?.nome || "" })}>
                  <SelectTrigger id="quoteeditor-lavoro-collegato" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nessuno —</SelectItem>
                    {worksites.map((w) => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 md:col-span-4">
                <div className="flex items-center justify-between"><Label htmlFor="quoteeditor-oggetto">Oggetto</Label>
                  <button type="button" onClick={suggestOggetto} disabled={oggettoBusy} className="text-xs font-medium text-brand-700 hover:underline inline-flex items-center gap-1 disabled:opacity-60">{oggettoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}Suggerisci con l'IA</button>
                </div>
                <Input id="quoteeditor-oggetto" className="mt-1" value={quote.oggetto || ""} onChange={(e) => set({ oggetto: e.target.value })} placeholder="Es. Ristrutturazione bagno – Via Roma 12" />
              </div>
            </div>
          </Section>

          {locked && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Il preventivo è già accettato: per cambiare prezzi o voci conviene creare una <button className="underline font-medium" onClick={newRevision}>nuova revisione</button>.
            </div>
          )}

          <QuoteLines righe={righe} setRighe={setRows} defaultIva={defaultIva} showCosts={showCosts} setShowCosts={setShowCosts} />

          {/* Condizioni */}
          <Section title="Condizioni">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="quoteeditor-pagamento">Pagamento</Label>
                <Input id="quoteeditor-pagamento" className="mt-1" list="modalita-pagamento" value={quote.condizioni_pagamento || ""} onChange={(e) => set({ condizioni_pagamento: e.target.value })} placeholder="Es. Acconto 30% – saldo a fine lavori" />
                <datalist id="modalita-pagamento">{MODALITA_PAGAMENTO.map((m) => <option key={m} value={m} />)}</datalist>
              </div>
              <div><Label htmlFor="quoteeditor-tempi-di-esecuzione">Tempi di esecuzione</Label><Input id="quoteeditor-tempi-di-esecuzione" className="mt-1" value={quote.tempi_esecuzione || ""} onChange={(e) => set({ tempi_esecuzione: e.target.value })} placeholder="Es. 15 giorni lavorativi dall'accettazione" /></div>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Clausole e condizioni generali</Label>
                  <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => set({ clausole: DEFAULT_CLAUSOLE })}>Ripristina le clausole standard</button>
                </div>
                <textarea value={quote.clausole || ""} onChange={(e) => set({ clausole: e.target.value })} rows={5} className="mt-1 w-full rounded-md border border-input p-2 text-sm" />
              </div>
              <div className="md:col-span-2"><Label htmlFor="quoteeditor-note-per-il-cliente">Note per il cliente</Label><textarea id="quoteeditor-note-per-il-cliente" value={quote.note || ""} onChange={(e) => set({ note: e.target.value })} rows={3} className="mt-1 w-full rounded-md border border-input p-2 text-sm" placeholder="Note aggiuntive…" /></div>
            </div>
          </Section>

          {/* Documento */}
          <Section title="Documento PDF">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-600">Grafica: <strong>{templateName}</strong></span>
                {!isNew && <button onClick={openPicker} className="text-brand-700 hover:underline text-sm">cambia</button>}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4" checked={!!quote.copertina} onChange={(e) => set({ copertina: e.target.checked })} />
                Pagina di copertina con sommario dei capitoli
              </label>
              <div>
                <p className="text-sm text-slate-700 mb-1.5">Allegati in coda al PDF (foto del sopralluogo, schede tecniche, render…)</p>
                <div className="flex flex-wrap gap-2">
                  {(quote.allegati || []).map((a, i) => (
                    <div key={i} className="relative w-24">
                      <img src={a.url} alt={a.name} className="w-24 h-20 object-cover rounded-md border border-slate-200" />
                      <button type="button" aria-label={`Rimuovi ${a.name}`} onClick={() => set({ allegati: quote.allegati.filter((_, j) => j !== i) })} className="absolute -top-2 -right-2 rounded-full bg-white border border-slate-200 p-0.5 shadow"><X className="w-3.5 h-3.5" /></button>
                      <input value={a.name} onChange={(e) => set({ allegati: quote.allegati.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="mt-1 w-full text-[11px] border-b border-slate-200 focus:outline-none" aria-label="Didascalia" />
                    </div>
                  ))}
                  <label className="w-24 h-20 rounded-md border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-xs text-slate-500 cursor-pointer hover:border-brand-400">
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ImageIcon className="w-5 h-5 mb-1" /> Aggiungi</>}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadAttachments([...e.target.files]); e.target.value = ""; }} />
                  </label>
                </div>
              </div>
            </div>
          </Section>

          {/* Firma */}
          <Section title="Firma del cliente">
            {quote.firma_cliente_url && quote.risposta_cliente?.esito === "accetta" ? (
              <div>
                <img src={quote.firma_cliente_url} alt="Firma del cliente" className="h-20 border-b border-slate-300" />
                <p className="text-xs text-slate-500 mt-1">Firmato online il {new Date(quote.risposta_cliente.data).toLocaleString("it-IT")}</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-2">Per firmare di persona, su tablet o telefono. In alternativa manda il link al cliente e firmerà online.</p>
                <SignaturePad value={clienteFirma} onChange={(v) => { setClienteFirma(v); setDirty(true); }} label="Firma cliente" />
                {clienteFirma && clienteFirma !== quote.firma_cliente_url && <p className="text-xs text-emerald-700 mt-2">Al salvataggio il preventivo risulterà accettato.</p>}
              </>
            )}
          </Section>

          {!isNew && (
            <LinkedEmails field="quote_id" id={id} title="Email del preventivo"
              composeDefaults={{
                defaultTo: client?.email || "",
                templateVars: { cliente: quote.cliente_nome, numero_preventivo: quote.numero, oggetto_preventivo: quote.oggetto, totale: fmtEur(totals.totale), cantiere: quote.worksite_nome },
                links: { contact_id: quote.cliente_id || "", worksite_id: quote.worksite_id || "" },
              }} />
          )}
        </div>

        {/* Riepilogo (fisso a destra su schermi larghi) */}
        <aside className="space-y-4 xl:sticky xl:top-4">
          <Section title="Riepilogo">
            <dl className="space-y-1.5 text-sm">
              {chapters.length > 0 && chapters.map((c, i) => (
                <div key={i} className="flex justify-between text-slate-600"><dt className="truncate pr-2">{c.titolo || "Capitolo"}</dt><dd className="tabular-nums">{fmtEur(c.totale)}</dd></div>
              ))}
              {chapters.length > 0 && <div className="border-t border-slate-100 my-1" />}
              <div className="flex justify-between"><dt className="text-slate-600">Totale voci</dt><dd className="tabular-nums">{fmtEur(totals.lordo)}</dd></div>
              <div className="flex justify-between items-center gap-2">
                <dt className="text-slate-600">Sconto sul totale</dt>
                <dd className="flex items-center gap-1">
                  <Input type="number" inputMode="decimal" value={quote.sconto_globale ?? 0} onChange={(e) => set({ sconto_globale: e.target.value === "" ? 0 : Number(e.target.value) })} className="h-7 w-16 text-right tabular-nums" aria-label="Sconto sul totale in percentuale" />
                  <span className="text-slate-500">%</span>
                </dd>
              </div>
              {totals.sconto_importo > 0.005 && <div className="flex justify-between text-slate-600"><dt>Sconto</dt><dd className="tabular-nums">−{fmtEur(totals.sconto_importo)}</dd></div>}
              <div className="flex justify-between font-medium"><dt>Imponibile</dt><dd className="tabular-nums">{fmtEur(totals.imponibile)}</dd></div>
              {totals.iva.map((x) => (
                <div key={x.aliquota} className="flex justify-between text-slate-600"><dt>IVA {x.aliquota}%</dt><dd className="tabular-nums">{fmtEur(x.imposta)}</dd></div>
              ))}
              <div className="flex justify-between text-lg font-bold border-t border-slate-200 pt-2 mt-2"><dt>Totale</dt><dd className="tabular-nums text-brand-700">{fmtEur(totals.totale)}</dd></div>
              {totals.opzionali > 0.005 && <p className="text-xs text-slate-500">+ voci opzionali {fmtEur(totals.opzionali)} (non incluse)</p>}
            </dl>
          </Section>

          {showCosts && (
            <Section title="Margine (interno)">
              {totals.costo === null ? (
                <p className="text-sm text-slate-500">Inserisci il costo unitario delle voci per vedere il margine. Non compare mai nel PDF né al cliente.</p>
              ) : (
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-600">Costi</dt><dd className="tabular-nums">{fmtEur(totals.costo)}</dd></div>
                  <div className={`flex justify-between font-semibold ${totals.margine < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    <dt>Margine</dt><dd className="tabular-nums">{fmtEur(totals.margine)} {totals.margine_pct !== null && `(${Math.round(totals.margine_pct)}%)`}</dd>
                  </div>
                  {totals.voci_senza_costo > 0 && <p className="text-xs text-amber-700">{totals.voci_senza_costo} {totals.voci_senza_costo === 1 ? "voce" : "voci"} senza costo non conteggiate.</p>}
                </dl>
              )}
            </Section>
          )}
        </aside>
      </div>

      {/* Barra di salvataggio sempre raggiungibile su telefono */}
      <div className="fixed bottom-16 inset-x-3 md:hidden z-30 flex gap-2 rounded-xl bg-white/95 backdrop-blur border border-slate-200 shadow-lg p-2">
        <div className="flex-1 pl-2">
          <p className="text-[11px] text-slate-500">Totale</p>
          <p className="text-base font-bold tabular-nums">{fmtEur(totals.totale)}</p>
        </div>
        <Button onClick={() => save()} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva</Button>
      </div>

      <ComposeDialog
        open={!!compose}
        onOpenChange={(v) => { if (!v) setCompose(null); }}
        {...(compose || {})}
        context={`Invio del preventivo n. ${quote.numero} a ${quote.cliente_nome || "cliente"}. Oggetto: ${quote.oggetto || ""}. Totale ${fmtEur(totals.totale)}.`}
        links={{ quote_id: isNew ? "" : id, contact_id: quote.cliente_id || "", worksite_id: quote.worksite_id || "" }}
        templateVars={{ cliente: quote.cliente_nome, numero_preventivo: quote.numero, oggetto_preventivo: quote.oggetto, totale: fmtEur(totals.totale), cantiere: quote.worksite_nome }}
        onSent={onSent}
      />

      <ContactForm open={newClientOpen} onOpenChange={setNewClientOpen} defaultTipo="cliente"
        onSaved={(c) => { if (c) { setContacts((prev) => [...prev, c]); applyClient(c); } }} />

      <Dialog open={revisionsOpen} onOpenChange={setRevisionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Storico revisioni</DialogTitle>
            <DialogDescription>Versioni precedenti di questo preventivo. Puoi riportarne una nell'editor.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {[...(quote.revisioni || [])].reverse().map((r) => (
              <li key={r.rev} className="py-3 flex items-start gap-3">
                <span className="text-xs font-semibold rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 mt-0.5">Rev. {r.rev}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900">{fmtEur(r.totale)} · {r.righe?.length || 0} righe · {QUOTE_STATES[r.stato]?.label || r.stato}</p>
                  <p className="text-xs text-slate-500">Sostituita il {new Date(r.data_revisione).toLocaleDateString("it-IT")}{r.motivo ? ` · ${r.motivo}` : ""}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => restoreRevision(r)}>Ripristina</Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <QuoteTemplatePicker
        open={pickerOpen}
        onOpenChange={(open) => { if (!open) { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setPreviewBlob(null); } setPickerOpen(open); }}
        templates={QUOTE_TEMPLATES}
        selectedTemplate={selectedTemplate}
        onSelectTemplate={generatePreview}
        onAction={pickerAction}
        previewUrl={previewUrl}
        generating={generating}
      />
    </div>
  );
}
