import LinkedEmails from "@/components/email/LinkedEmails";
import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Plus, Trash2, Save, Send, FileDown, Sparkles, Copy, Bookmark, LayoutTemplate, Link2, Unlink, FolderOpen, Check, Loader2 } from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import StatusBadge from "@/components/shared/StatusBadge";
import EmailComposer from "@/components/shared/EmailComposer";
import SignaturePad from "@/components/shared/SignaturePad";
import QuoteTemplatePicker from "@/components/quotes/QuoteTemplatePicker";
import AutoTextarea from "@/components/shared/AutoTextarea";
import { QUOTE_TEMPLATES, generateQuotePDF } from "@/utils/quoteTemplates";
import { generateQuoteWord, generateQuoteExcel } from "@/utils/quoteWordExcel";
import { formatEuro } from "@/utils/pdfUtils";
import { generateQuoteNumber } from "@/utils/quoteNumbering";

const unitOptions = [
  { value: "mq", label: "m²", tooltip: "Metro quadrato" },
  { value: "mc", label: "m³", tooltip: "Metro cubo" },
  { value: "m", label: "m", tooltip: "Metro" },
  { value: "ml", label: "ml", tooltip: "Metro lineare" },
  { value: "cad", label: "cad", tooltip: "Cadauno" },
  { value: "ore", label: "ore", tooltip: "Ore lavorative" },
  { value: "corpo", label: "a corpo", tooltip: "A corpo (prezzo fisso per intervento)" },
  { value: "kg", label: "kg", tooltip: "Chilogrammo" },
];
const emptyRow = { descrizione: "", unita_misura: "cad", quantita: 1, prezzo_unitario: 0, sconto: 0, iva_percentuale: 22 };

export default function QuoteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "nuovo";
  const [quote, setQuote] = useState(null);
  const [righe, setRighe] = useState([{ ...emptyRow }]);
  const [contacts, setContacts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailComposer, setEmailComposer] = useState(false);
  const [emailDefaults, setEmailDefaults] = useState({ to: "", subject: "", body: "" });
  const [emailAttachment, setEmailAttachment] = useState(null);
  const [aiLoading, setAiLoading] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ nome: "", nome_privato: "", partita_iva: "", codice_fiscale: "", indirizzo: "", citta: "", cap: "", provincia: "", telefono: "", email: "" });
  const [clienteFirma, setClienteFirma] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("classica");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [worksites, setWorksites] = useState([]);
  const [showSendOption, setShowSendOption] = useState(false);
  const { toast } = useToast();

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      const cls = await db.Contact.filter({ tipo: "cliente" });
      setContacts(cls);

      const profiles = await db.CompanyProfile.list();
      const prof = profiles[0];
      setProfile(prof);

      const sites = await db.Worksite.list();
      setWorksites(sites);

      let templateData = null;
      let importData = null;
      if (isNew) {
        const params = new URLSearchParams(window.location.search);
        const tplId = params.get("template");
        if (tplId) {
          templateData = await db.SavedTemplate.get(tplId);
        }
        if (params.get("import")) {
          const stored = sessionStorage.getItem("quoteImport");
          if (stored) {
            importData = JSON.parse(stored);
            sessionStorage.removeItem("quoteImport");
          }
        }
        const defaultTemplate = prof?.template_predefinito || "classica";
        setSelectedTemplate(defaultTemplate);
        const existingQuotes = await db.Quote.list();
        const { numero, anno } = generateQuoteNumber(prof, existingQuotes);
        setQuote({
          numero,
          anno,
          data: new Date().toISOString().slice(0, 10),
          cliente_id: "",
          cliente_nome: importData?.cliente_nome || "",
          oggetto: importData?.oggetto || templateData?.oggetto || "",
          stato: "in_attesa",
          note: importData?.note || templateData?.note || "",
          validita_giorni: importData?.validita_giorni || templateData?.validita_giorni || 30,
          template_variante: defaultTemplate,
          worksite_id: "",
          worksite_nome: "",
        });
        if (importData?.righe?.length) setRighe(importData.righe);
        else if (templateData?.righe?.length) setRighe(templateData.righe);
      } else {
        const q = await db.Quote.get(id);
        q._oldWorksiteId = q.worksite_id || "";
        if (sessionStorage.getItem("quoteJustSaved") === "1") {
          sessionStorage.removeItem("quoteJustSaved");
          setShowSendOption(true);
        }
        setQuote(q);
        setRighe(q.righe?.length ? q.righe : [{ ...emptyRow }]);
        setClienteFirma(q.firma_cliente_url || "");
        setSelectedTemplate(q.template_variante || prof?.template_predefinito || "classica");
        const client = cls.find(c => c.id === q.cliente_id);
        if (client) setSelectedClient(client);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const calcRowTotal = (row) => {
    const subtotal = (row.quantita || 0) * (row.prezzo_unitario || 0);
    return subtotal * (1 - (row.sconto || 0) / 100);
  };

  const calcTotals = () => {
    const imponibile = righe.reduce((sum, r) => sum + calcRowTotal(r), 0);
    const ivaTotale = righe.reduce((sum, r) => sum + calcRowTotal(r) * (r.iva_percentuale || 0) / 100, 0);
    return { imponibile, iva_totale: ivaTotale, totale: imponibile + ivaTotale };
  };

  const updateRow = (idx, field, value) => {
    setRighe(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRighe(prev => [...prev, { ...emptyRow }]);
  const removeRow = (idx) => setRighe(prev => prev.filter((_, i) => i !== idx));

  const handleClientChange = (clientId) => {
    const client = contacts.find(c => c.id === clientId);
    setSelectedClient(client || null);
    setQuote(prev => ({ ...prev, cliente_id: clientId, cliente_nome: client?.nome || client?.nome_privato || "" }));
  };

  const handleWorksiteChange = (worksiteId) => {
    if (!worksiteId || worksiteId === "none") {
      setQuote(prev => ({ ...prev, worksite_id: "", worksite_nome: "" }));
    } else {
      const site = worksites.find(w => w.id === worksiteId);
      setQuote(prev => ({ ...prev, worksite_id: worksiteId, worksite_nome: site?.nome || "" }));
    }
  };

  const syncWorksiteLink = async (quoteId, newWorksiteId, oldWorksiteId) => {
    // Clear old worksite's preventivo_id if it pointed to this quote
    if (oldWorksiteId && oldWorksiteId !== newWorksiteId) {
      try {
        const oldSite = await db.Worksite.get(oldWorksiteId);
        if (oldSite?.preventivo_id === quoteId) {
          await db.Worksite.update(oldWorksiteId, { preventivo_id: "" });
        }
      } catch (e) { /* ignore */ }
    }
    // Set new worksite's preventivo_id
    if (newWorksiteId) {
      try {
        const newSite = await db.Worksite.get(newWorksiteId);
        if (newSite?.preventivo_id !== quoteId) {
          await db.Worksite.update(newWorksiteId, { preventivo_id: quoteId });
        }
      } catch (e) { /* ignore */ }
    }
  };

  const buildCtx = () => ({
    profile,
    quote,
    righe,
    totals: calcTotals(),
    selectedClient,
    clienteFirma,
    unitOptions,
    calcRowTotal,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const totals = calcTotals();
      let data = {
        ...quote,
        righe,
        ...totals,
        template_variante: selectedTemplate,
      };
      if (showNewClient && (newClient.nome || newClient.nome_privato)) {
        const created = await db.Contact.create({ ...newClient, tipo: "cliente" });
        data.cliente_id = created.id;
        data.cliente_nome = created.nome || created.nome_privato;
        setSelectedClient(created);
        setContacts(prev => [...prev, created]);
        setShowNewClient(false);
        toast({ title: "Cliente salvato in anagrafica" });
      }
      if (clienteFirma) {
        data.firma_cliente_url = clienteFirma;
        data.data_firma_cliente = new Date().toISOString().slice(0, 10);
        if (data.stato !== "approvato") data.stato = "approvato";
      }
      delete data.id; delete data.created_date; delete data.updated_date; delete data.created_by_id; delete data._oldWorksiteId;
      const oldWorksiteId = quote._oldWorksiteId;
      const newWorksiteId = data.worksite_id || "";
      if (isNew) {
        const created = await db.Quote.create(data);
        await syncWorksiteLink(created.id, newWorksiteId, null);
        toast({ title: "Preventivo salvato" });
        sessionStorage.setItem("quoteJustSaved", "1");
        navigate(`/preventivi/${created.id}`);
      } else {
        await db.Quote.update(id, data);
        await syncWorksiteLink(id, newWorksiteId, oldWorksiteId);
        setQuote(prev => ({ ...prev, _oldWorksiteId: newWorksiteId }));
        setShowSendOption(true);
        toast({ title: "Preventivo aggiornato" });
      }
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleSendEmail = async () => {
    setGeneratingPreview(true);
    try {
      const blob = await generateQuotePDF(selectedTemplate, buildCtx());
      setPreviewBlob(blob);
      const client = contacts.find(c => c.id === quote.cliente_id);
      setEmailAttachment({
        blob,
        filename: `Preventivo_${quote.numero || "bozza"}.pdf`,
      });
      setEmailDefaults({
        to: client?.email || "",
        subject: `Preventivo ${quote.numero} - ${quote.oggetto || ""}`,
        body: `Gentile ${quote.cliente_nome},\n\nIn allegato il preventivo n. ${quote.numero}.\n\nCordiali saluti`,
      });
      setShowSendOption(false);
      setEmailComposer(true);
    } catch (e) {
      toast({ title: "Errore generazione PDF", variant: "destructive" });
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleDownloadPdf = async () => {
    setGeneratingPreview(true);
    try {
      const blob = await generateQuotePDF(selectedTemplate, buildCtx());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Preventivo_${quote.numero || "bozza"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF scaricato" });
    } catch (e) {
      toast({ title: "Errore generazione PDF", variant: "destructive" });
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleDownloadExcel = () => {
    try {
      generateQuoteExcel(buildCtx());
      toast({ title: "Excel scaricato" });
    } catch (e) {
      toast({ title: "Errore generazione Excel", variant: "destructive" });
    }
  };

  const handleStatusChange = async (newStatus) => {
    setQuote(prev => ({ ...prev, stato: newStatus }));
    if (!isNew) {
      await db.Quote.update(id, { stato: newStatus });
      toast({ title: `Stato aggiornato` });
    }
  };

  const handleDuplicate = async () => {
    const existingQuotes = await db.Quote.list();
    const { numero, anno } = generateQuoteNumber(profile, existingQuotes);
    const totals = calcTotals();
    const created = await db.Quote.create({
      numero,
      anno,
      data: new Date().toISOString().slice(0, 10),
      cliente_id: quote.cliente_id || "",
      cliente_nome: quote.cliente_nome || "",
      oggetto: quote.oggetto ? `${quote.oggetto} (copia)` : "",
      righe,
      ...totals,
      stato: "in_attesa",
      note: quote.note || "",
      validita_giorni: quote.validita_giorni || 30,
      template_variante: selectedTemplate,
    });
    toast({ title: "Preventivo duplicato", description: `Nuovo n. ${numero}` });
    navigate(`/preventivi/${created.id}`);
  };

  const handleSaveAsTemplate = async () => {
    const nome = prompt("Nome del modello:", quote.oggetto || "Nuovo modello");
    if (!nome?.trim()) return;
    await db.SavedTemplate.create({
      nome: nome.trim(),
      tipo: "preventivo",
      oggetto: quote.oggetto || "",
      righe,
      note: quote.note || "",
      validita_giorni: quote.validita_giorni || 30,
    });
    toast({ title: "Modello salvato", description: nome.trim() });
  };

  const handleOpenPicker = async () => {
    setPickerOpen(true);
    await generatePreview(selectedTemplate);
  };

  const generatePreview = async (templateId) => {
    setSelectedTemplate(templateId);
    setGeneratingPreview(true);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    try {
      const blob = await generateQuotePDF(templateId, buildCtx());
      setPreviewBlob(blob);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (e) {
      toast({ title: "Errore generazione anteprima", variant: "destructive" });
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handlePickerAction = async (templateId, action) => {
    if (!previewBlob) return;
    // Save template choice to quote
    setSelectedTemplate(templateId);
    if (!isNew) {
      await db.Quote.update(id, { template_variante: templateId });
    }
    setQuote(prev => ({ ...prev, template_variante: templateId }));

    if (action === "download_pdf") {
      if (!previewBlob) return;
      const url = URL.createObjectURL(previewBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Preventivo_${quote.numero || "bozza"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setPickerOpen(false);
      toast({ title: "PDF scaricato" });
    } else if (action === "download_word") {
      generateQuoteWord(buildCtx());
      setPickerOpen(false);
      toast({ title: "Documento Word scaricato" });
    } else if (action === "download_excel") {
      generateQuoteExcel(buildCtx());
      setPickerOpen(false);
      toast({ title: "Foglio Excel scaricato" });
    } else if (action === "send") {
      const client = contacts.find(c => c.id === quote.cliente_id);
      setEmailAttachment({
        blob: previewBlob,
        filename: `Preventivo_${quote.numero || "bozza"}.pdf`,
      });
      setEmailDefaults({
        to: client?.email || "",
        subject: `Preventivo ${quote.numero} - ${quote.oggetto || ""}`,
        body: `Gentile ${quote.cliente_nome},\n\nIn allegato il preventivo n. ${quote.numero}.\n\nCordiali saluti`,
      });
      setPickerOpen(false);
      setEmailComposer(true);
    }
  };

  const generateAiDescription = async (idx) => {
    const row = righe[idx];
    if (!row.descrizione) return;
    setAiLoading(idx);
    try {
      const result = await api.integrations.Core.InvokeLLM({
        prompt: `Sei un esperto del settore edile italiano. Riscrivi questa voce di preventivo in linguaggio tecnico corretto e professionale. Voce originale: "${row.descrizione}". Rispondi solo con la descrizione riscritta, nient'altro.`,
      });
      updateRow(idx, "descrizione", result);
    } catch (e) {
      toast({ title: "Errore IA", variant: "destructive" });
    } finally { setAiLoading(null); }
  };

  if (loading) return <LoadingSpinner />;

  const totals = calcTotals();
  const currentTemplateName = QUOTE_TEMPLATES.find(t => t.id === selectedTemplate)?.nome || "Classica";

  return (
    <div>
      <Link to="/preventivi" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Torna ai preventivi
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            {isNew ? "Nuovo Preventivo" : `Preventivo ${quote.numero}`}
          </h1>
          {!isNew && <div className="mt-1"><StatusBadge status={quote.stato} /></div>}
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 sm:flex-wrap">
          {!isNew && (
            <>
              <Button variant="outline" onClick={handleOpenPicker} className="gap-2 h-10 col-span-2 sm:col-span-1 border-blue-300 text-blue-700 hover:bg-blue-50">
                <LayoutTemplate className="w-4 h-4" /> Modello e PDF
              </Button>
              <Button variant="outline" onClick={handleSendEmail} className="gap-2 h-10 col-span-2 sm:col-span-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" disabled={generatingPreview}>
                {generatingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Invia email
              </Button>
              <Button variant="outline" onClick={handleDuplicate} className="gap-2 h-10"><Copy className="w-4 h-4" />Duplica</Button>
              <Button variant="outline" onClick={handleSaveAsTemplate} className="gap-2 h-10 col-span-2 sm:col-span-1"><Bookmark className="w-4 h-4" />Modello</Button>
            </>
          )}
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 gap-2 h-10 col-span-2 sm:col-span-1" disabled={saving}>
            <Save className="w-4 h-4" />{saving ? "..." : "Salva"}
          </Button>
        </div>
      </div>

      {/* Template indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2 text-sm">
        <LayoutTemplate className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-blue-700">
          Modello: <strong>{currentTemplateName}</strong>
        </span>
        {!isNew && (
          <button
            onClick={handleOpenPicker}
            className="ml-auto text-blue-600 hover:text-blue-800 text-xs font-medium"
          >
            Cambia modello
          </button>
        )}
      </div>

      {/* Worksite link indicator */}
      {quote.worksite_id && (
        <Link to={`/lavori/${quote.worksite_id}`} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 mb-4 text-sm hover:bg-emerald-100 transition-colors">
          <FolderOpen className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="text-emerald-700">Lavoro collegato: <strong>{quote.worksite_nome}</strong></span>
          <span className="ml-auto text-emerald-600 text-xs">Apri →</span>
        </Link>
      )}

      {/* Header info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>N° Preventivo</Label>
            <Input value={quote.numero || ""} onChange={e => setQuote(prev => ({ ...prev, numero: e.target.value }))} />
          </div>
          <div>
            <Label>Data</Label>
            <Input type="date" value={quote.data || ""} onChange={e => setQuote(prev => ({ ...prev, data: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Cliente</Label>
            <div className="flex gap-2">
              <Select value={quote.cliente_id || ""} onValueChange={handleClientChange}>
                <SelectTrigger><SelectValue placeholder="Seleziona cliente" /></SelectTrigger>
                <SelectContent>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.nome || c.nome_privato}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" size="icon" variant="outline" onClick={() => setShowNewClient(!showNewClient)} title="Nuovo cliente">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {showNewClient && (
              <div className="mt-2 p-3 border border-slate-200 rounded-lg space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Ragione sociale" value={newClient.nome} onChange={e => setNewClient({ ...newClient, nome: e.target.value })} />
                  <Input placeholder="Nome" value={newClient.nome_privato} onChange={e => setNewClient({ ...newClient, nome_privato: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="P.IVA" value={newClient.partita_iva} onChange={e => setNewClient({ ...newClient, partita_iva: e.target.value })} />
                  <Input placeholder="Codice Fiscale" value={newClient.codice_fiscale} onChange={e => setNewClient({ ...newClient, codice_fiscale: e.target.value })} />
                </div>
                <Input placeholder="Indirizzo" value={newClient.indirizzo} onChange={e => setNewClient({ ...newClient, indirizzo: e.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="CAP" value={newClient.cap} onChange={e => setNewClient({ ...newClient, cap: e.target.value })} autoComplete="postal-code" autoCorrect="off" autoCapitalize="characters" spellCheck={false} inputMode="numeric" />
                  <Input placeholder="Città" value={newClient.citta} onChange={e => setNewClient({ ...newClient, citta: e.target.value })} autoComplete="address-level2" />
                  <Input placeholder="Prov." value={newClient.provincia} onChange={e => setNewClient({ ...newClient, provincia: e.target.value })} autoComplete="address-level1" autoCapitalize="characters" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Telefono" value={newClient.telefono} onChange={e => setNewClient({ ...newClient, telefono: e.target.value })} />
                  <Input placeholder="Email" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} />
                </div>
                <p className="text-xs text-slate-500">Compila almeno uno tra Ragione Sociale o Nome. Il cliente verrà salvato in anagrafica quando salvi il preventivo.</p>
              </div>
            )}
          </div>
          <div>
            <Label>Stato</Label>
            <Select value={quote.stato} onValueChange={handleStatusChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["in_attesa", "inviato", "approvato", "rifiutato", "scaduto"].map(s => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4">
            <Label>Oggetto</Label>
            <Input value={quote.oggetto || ""} onChange={e => setQuote(prev => ({ ...prev, oggetto: e.target.value }))} placeholder="Es. Ristrutturazione bagno" />
          </div>
          <div className="md:col-span-4">
            <Label>Lavoro collegato (opzionale)</Label>
            <Select value={quote.worksite_id || "none"} onValueChange={handleWorksiteChange}>
              <SelectTrigger><SelectValue placeholder="Nessun lavoro collegato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nessun lavoro collegato —</SelectItem>
                {worksites.map(w => <SelectItem key={w.id} value={w.id}>{w.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400 mt-1">Collega questo preventivo a un lavoro per raccoglierlo nella sua cartella. Puoi collegarlo, scollegarlo o spostarlo in qualsiasi momento.</p>
          </div>
        </div>
      </div>

      {/* Righe */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase">Righe preventivo</h2>
          <Button size="sm" variant="outline" onClick={addRow} className="gap-1"><Plus className="w-4 h-4" />Aggiungi riga</Button>
        </div>

        <div className="space-y-3">
          {righe.map((row, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-3">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-4">
                  <div className="flex gap-1 items-start">
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs">Descrizione</Label>
                      <AutoTextarea
                        value={row.descrizione}
                        onChange={e => updateRow(idx, "descrizione", e.target.value)}
                        placeholder="Scrivi la voce..."
                        className="mt-1"
                      />
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => generateAiDescription(idx)} disabled={aiLoading === idx || !row.descrizione} title="Migliora con IA" className="p-2 h-10 flex-shrink-0 mt-5">
                      <Sparkles className={`w-4 h-4 ${aiLoading === idx ? "animate-spin text-blue-500" : "text-slate-400"}`} />
                    </Button>
                  </div>
                </div>
                <div className="col-span-6 md:col-span-1">
                  <Label className="text-xs">U.M.</Label>
                  <Select value={row.unita_misura} onValueChange={v => updateRow(idx, "unita_misura", v)}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {unitOptions.map(u => (
                        <SelectItem key={u.value} value={u.value} title={u.tooltip}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-6 md:col-span-1">
                  <Label className="text-xs">Qtà</Label>
                  <Input type="number" value={row.quantita} onChange={e => updateRow(idx, "quantita", parseFloat(e.target.value) || 0)} className="h-10" />
                </div>
                <div className="col-span-12 md:col-span-2">
                  <Label className="text-xs">Prezzo Unit. (€)</Label>
                  <Input type="number" step="0.01" value={row.prezzo_unitario} onChange={e => updateRow(idx, "prezzo_unitario", parseFloat(e.target.value) || 0)} className="h-10" />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <Label className="text-xs">Sconto %</Label>
                  <Input type="number" value={row.sconto} onChange={e => updateRow(idx, "sconto", parseFloat(e.target.value) || 0)} className="h-10" />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <Label className="text-xs">IVA %</Label>
                  <Input type="number" value={row.iva_percentuale} onChange={e => updateRow(idx, "iva_percentuale", parseFloat(e.target.value) || 0)} className="h-10" />
                </div>
                <div className="col-span-8 md:col-span-1 text-right flex items-center justify-between md:justify-end gap-2">
                  <div>
                    <Label className="text-xs">Totale</Label>
                    <p className="text-sm font-semibold text-slate-900 py-2">{formatEuro(calcRowTotal(row))}</p>
                  </div>
                  {righe.length > 1 && (
                    <button onClick={() => removeRow(idx)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 mb-4">
        <div className="flex flex-col items-end gap-1">
          <div className="flex justify-between w-full sm:w-56 text-sm"><span className="text-slate-500">Imponibile:</span><span className="font-medium">{formatEuro(totals.imponibile)}</span></div>
          <div className="flex justify-between w-full sm:w-56 text-sm"><span className="text-slate-500">IVA:</span><span className="font-medium">{formatEuro(totals.iva_totale)}</span></div>
          <div className="flex justify-between w-full sm:w-56 text-lg border-t border-slate-200 pt-2 mt-1"><span className="font-semibold">Totale:</span><span className="font-bold text-blue-600">{formatEuro(totals.totale)}</span></div>
        </div>
      </div>

      {/* Note */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <Label>Note</Label>
        <textarea value={quote.note || ""} onChange={e => setQuote(prev => ({ ...prev, note: e.target.value }))} className="w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[80px] mt-1" placeholder="Note aggiuntive..." />
      </div>

      {/* Client signature */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Firma del Cliente (per accettazione)</h3>
        <SignaturePad value={clienteFirma} onChange={setClienteFirma} label="Firma cliente" />
        {clienteFirma && (
          <p className="text-xs text-emerald-600 mt-2">Il preventivo verrà automaticamente contrassegnato come "approvato" al salvataggio.</p>
        )}
      </div>

      {/* Send option after save */}
      {showSendOption && !isNew && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 mb-4">
          <div className="flex items-center gap-2 text-sm text-emerald-700 mb-3">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Preventivo salvato correttamente.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleDownloadPdf} className="gap-2 border-red-300 text-red-700 hover:bg-red-50" disabled={generatingPreview}>
              {generatingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Scarica PDF
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadExcel} className="gap-2 border-green-300 text-green-700 hover:bg-green-50">
              <FileDown className="w-4 h-4" />
              Scarica Excel
            </Button>
            <Button size="sm" onClick={handleSendEmail} className="bg-blue-600 hover:bg-blue-700 gap-2 ml-auto" disabled={generatingPreview}>
              {generatingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Invia per email
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowSendOption(false)}>Chiudi</Button>
          </div>
        </div>
      )}

      {/* Send info */}
      {quote.data_invio && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-sm text-blue-700">
          Inviato a <strong>{quote.inviato_a}</strong> il {new Date(quote.data_invio).toLocaleDateString("it-IT")}
        </div>
      )}

      {!isNew && (
        <LinkedEmails
          field="quote_id"
          id={id}
          title="Email del preventivo"
          composeDefaults={{
            defaultTo: contacts.find(c => c.id === quote.cliente_id)?.email || "",
            templateVars: { cliente: quote.cliente_nome, numero_preventivo: quote.numero, oggetto_preventivo: quote.oggetto, cantiere: quote.worksite_nome },
            links: { contact_id: quote.cliente_id || "", worksite_id: quote.worksite_id || "" },
          }}
        />
      )}

      <EmailComposer
        open={emailComposer}
        onOpenChange={setEmailComposer}
        defaultTo={emailDefaults.to}
        defaultSubject={emailDefaults.subject}
        defaultBody={emailDefaults.body}
        attachment={emailAttachment}
        context={`Invio preventivo n. ${quote?.numero} a ${quote?.cliente_nome}. Oggetto: ${quote?.oggetto}.`}
        links={{ quote_id: isNew ? "" : id, contact_id: quote?.cliente_id || "", worksite_id: quote?.worksite_id || "" }}
        templateVars={{
          cliente: quote?.cliente_nome,
          numero_preventivo: quote?.numero,
          oggetto_preventivo: quote?.oggetto,
          totale: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(calcTotals().totale || 0),
          cantiere: quote?.worksite_nome,
        }}
        onSent={async ({ to }) => {
          if (!isNew) {
            const today = new Date().toISOString().slice(0, 10);
            await db.Quote.update(id, { inviato_a: to, data_invio: today, stato: "inviato" });
            setQuote(prev => ({ ...prev, stato: "inviato", inviato_a: to, data_invio: today }));
            toast({ title: "Preventivo inviato", description: `Email inviata a ${to}` });
          }
        }}
      />

      <QuoteTemplatePicker
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setPreviewBlob(null);
          }
          setPickerOpen(open);
        }}
        templates={QUOTE_TEMPLATES}
        selectedTemplate={selectedTemplate}
        onSelectTemplate={generatePreview}
        onAction={handlePickerAction}
        previewUrl={previewUrl}
        generating={generatingPreview}
      />
    </div>
  );
}