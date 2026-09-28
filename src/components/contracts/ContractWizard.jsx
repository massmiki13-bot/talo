import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { api, db } from "@/lib/db";
import { ArrowLeft, Sparkles, Loader2, ChevronDown, ChevronRight, Eye, Save, FileSignature, Users, HardHat, Handshake, Bookmark, Paperclip } from "lucide-react";
import { contractVariants, buildBody, getFieldsForType, extractFields } from "@/utils/contractTemplates";
import { fillTemplate } from "@/utils/docExportUtils";
import { contractSchemas } from "@/utils/contracts";
import { CATEGORIES, typeTitle, partyKind, fromEmployee, fromContact, fromWorksite, missingRequired, fieldLabel, aiFillFields } from "@/lib/contracts";

const NONE = "__none";
const CAT_ICON = { lavoro: Users, commerciale: HardHat, altro: Handshake };
const COMPANY_KEYS = ["DITTA", "SEDE", "PIVA", "CITTA_DITTA", "EMAIL_DITTA", "PEC_DITTA"];

/**
 * Nuovo contratto in due passi: modello → dati (con anagrafiche e IA) e anteprima dal vivo.
 * onSave({ tipo, variant, fields, links, content, templateText, saveAsTemplate, templateName })
 */
export default function ContractWizard({ open, onOpenChange, customTemplates, employees, contacts, worksites, profile, initial, onSave, onPreviewPdf }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState("");
  const [variant, setVariant] = useState("pro");
  const [fields, setFields] = useState({});
  const [links, setLinks] = useState({ dipendente_id: "", contatto_id: "", worksite_id: "" });
  const [showOptional, setShowOptional] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [asTemplate, setAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(initial?.tipo ? 2 : 1);
    setTipo(initial?.tipo || "");
    setVariant("pro");
    setFields({ DATA_CONTRATTO: new Date().toISOString().slice(0, 10), ...(initial?.fields || {}) });
    setLinks({ dipendente_id: "", contatto_id: "", worksite_id: "", ...(initial?.links || {}) });
    setShowOptional(false); setAiText(""); setAiFile(null); setAsTemplate(false); setTemplateName(""); setTouched(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCustom = tipo.startsWith("custom_");
  const templateText = useMemo(() => {
    if (!tipo) return "";
    if (isCustom) return customTemplates.find((t) => `custom_${t.id}` === tipo)?.contenuto || "";
    const body = buildBody(tipo, variant);
    // Appalto: di norma l'impresa è l'Appaltatore che esegue i lavori per il cliente committente.
    if (tipo === "appalto" && (fields.RUOLO_DITTA || "appaltatore") === "appaltatore") {
      return body.replace("(di seguito, \"Committente\");", "(di seguito, \"@@A\");").replace("(di seguito, \"Appaltatore\");", "(di seguito, \"Committente\");").replace("@@A", "Appaltatore");
    }
    return body;
  }, [tipo, variant, isCustom, customTemplates, fields.RUOLO_DITTA]);

  const { required, optional } = useMemo(() => {
    if (!tipo) return { required: [], optional: [] };
    if (isCustom) return { required: extractFields(templateText).filter((k) => !COMPANY_KEYS.includes(k)).map((key) => ({ key })), optional: [] };
    return getFieldsForType(tipo);
  }, [tipo, isCustom, templateText]);

  const content = useMemo(() => (templateText ? fillTemplate(templateText, fields, profile) : ""), [templateText, fields, profile]);
  const missing = isCustom ? required.filter((f) => !String(fields[f.key] ?? "").trim()).map((f) => f.key) : missingRequired(tipo, fields);

  const pick = (t) => {
    setTipo(t);
    setStep(2);
    // porta con sé i dati già scelti dall'anagrafica
    const e = employees.find((x) => x.id === links.dipendente_id);
    const c = contacts.find((x) => x.id === links.contatto_id);
    setFields((f) => ({ ...f, ...(partyKind(t) === "dipendente" ? fromEmployee(e) : fromContact(c)) }));
  };

  const merge = (data) => setFields((f) => {
    const n = { ...f };
    for (const [k, v] of Object.entries(data)) if (v !== "" && v != null) n[k] = String(v);
    return n;
  });

  const linkEmployee = (id) => { setLinks((l) => ({ ...l, dipendente_id: id })); merge(fromEmployee(employees.find((e) => e.id === id))); };
  const linkContact = (id) => { setLinks((l) => ({ ...l, contatto_id: id })); merge(fromContact(contacts.find((c) => c.id === id))); };
  const linkWorksite = (id) => {
    setLinks((l) => ({ ...l, worksite_id: id }));
    const w = worksites.find((x) => x.id === id);
    merge(fromWorksite(w));
    if (w?.cliente_id && partyKind(tipo) === "contatto" && !links.contatto_id && tipo === "appalto") linkContact(w.cliente_id);
  };

  // IA: descrizione (facoltativa) + documento allegato + dati collegati (lavoro, preventivi, controparte, impresa)
  const [aiFile, setAiFile] = useState(null); // { url, name }
  const [aiUploading, setAiUploading] = useState(false);
  const attachForAi = async (file) => {
    if (!file) return;
    setAiUploading(true);
    try { setAiFile({ url: (await api.integrations.Core.UploadFile({ file, private: true })).file_url, name: file.name }); }
    catch (e) { toast({ title: "Caricamento non riuscito", description: e.message, variant: "destructive" }); }
    finally { setAiUploading(false); }
  };
  const canAi = !!(aiText.trim() || aiFile || links.worksite_id || links.contatto_id || links.dipendente_id);

  const runAi = async () => {
    if (!canAi) return;
    setAiBusy(true);
    try {
      const w = worksites.find((x) => x.id === links.worksite_id);
      const quotes = w ? await db.Quote.filter({ worksite_id: w.id }, "-data", 5).catch(() => []) : [];
      const pick = (o, ks) => (o ? Object.fromEntries(ks.filter((k) => o[k] != null && o[k] !== "").map((k) => [k, o[k]])) : undefined);
      const context = {
        impresa: pick(profile, ["ragione_sociale", "partita_iva", "indirizzo", "citta", "provincia"]),
        ruolo_impresa: tipo === "appalto" ? (fields.RUOLO_DITTA || "appaltatore") : undefined,
        lavoro: pick(w, ["nome", "indirizzo", "tipo_intervento", "cliente_nome", "importo_totale", "data_inizio", "data_fine_prevista", "direttore_lavori", "coordinatore_sicurezza", "piano_pagamenti", "fasi"]),
        preventivi: quotes.map((q) => ({ numero: q.numero, oggetto: q.oggetto, stato: q.stato, imponibile: q.imponibile, totale: q.totale, condizioni_pagamento: q.condizioni_pagamento, tempi_esecuzione: q.tempi_esecuzione,
          capitoli: (q.righe || []).filter((r) => r.tipo === "capitolo").map((r) => r.descrizione), voci: (q.righe || []).filter((r) => !r.tipo || r.tipo === "voce").slice(0, 40).map((r) => r.descrizione) })),
        controparte: pick(contacts.find((x) => x.id === links.contatto_id), ["nome", "nome_privato", "partita_iva", "codice_fiscale", "indirizzo", "cap", "citta", "provincia", "iban", "pagamento_default"])
          || pick(employees.find((x) => x.id === links.dipendente_id), ["nome", "cognome", "codice_fiscale", "data_nascita", "luogo_nascita", "indirizzo", "ruolo", "qualifica", "livello", "ccnl", "ore_settimanali", "data_assunzione", "iban"]),
      };
      const keys = [...required, ...optional].map((f) => f.key);
      const filled = await aiFillFields(tipo, keys, aiText, fields, { context, fileUrls: aiFile ? [aiFile.url] : [], optionalKeys: optional.map((f) => f.key) });
      // non sovrascrive quello che hai già scritto a mano
      const fresh = Object.fromEntries(Object.entries(filled).filter(([k]) => !String(fields[k] ?? "").trim()));
      const n = Object.keys(fresh).length;
      merge(fresh);
      if (optional.some((f) => fresh[f.key])) setShowOptional(true);
      toast({ title: n ? `L'IA ha compilato ${n} campi` : "L'IA non ha trovato altri dati", description: n ? "Controlla tutto prima di salvare." : "Aggiungi una descrizione o allega un documento." });
    } catch (e) {
      toast({ title: "IA non disponibile", description: "Riprova tra poco.", variant: "destructive" });
    } finally { setAiBusy(false); }
  };

  const submit = async () => {
    setTouched(true);
    if (missing.length && !confirm(`Mancano ${missing.length} campi principali (${missing.slice(0, 3).map(fieldLabel).join(", ")}${missing.length > 3 ? "…" : ""}). Salvare comunque come bozza?`)) return;
    setSaving(true);
    try {
      await onSave({ tipo, variant, fields, links, content, templateText, saveAsTemplate: asTemplate && templateName.trim(), templateName: templateName.trim() });
    } finally { setSaving(false); }
  };

  const renderField = (f) => {
    const def = { label: fieldLabel(f.key), type: "text", ...(f.label ? { label: f.label } : {}), ...(f.type ? { type: f.type } : {}) };
    const bad = touched && missing.includes(f.key);
    return (
      <div key={f.key} className={def.type === "textarea" ? "sm:col-span-2" : ""}>
        <Label htmlFor={`f-${f.key}`} className={`text-xs ${bad ? "text-red-700" : "text-slate-600"}`}>{def.label}</Label>
        {def.type === "textarea" ? (
          <Textarea id={`f-${f.key}`} rows={3} value={fields[f.key] || ""} onChange={(e) => setFields((x) => ({ ...x, [f.key]: e.target.value }))} className={bad ? "border-red-400" : ""} />
        ) : (
          <Input id={`f-${f.key}`} type={def.type} value={fields[f.key] || ""} onChange={(e) => setFields((x) => ({ ...x, [f.key]: e.target.value }))} className={bad ? "border-red-400" : ""} />
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-6xl w-[96vw] h-[92vh] p-0 flex flex-col overflow-hidden gap-0">
        <DialogHeader className="px-5 py-3 border-b border-slate-100 text-left">
          <DialogTitle className="flex items-center gap-2">
            {step === 2 && <button onClick={() => setStep(1)} className="p-1 -ml-1 rounded hover:bg-slate-100" aria-label="Cambia modello"><ArrowLeft className="w-4 h-4" /></button>}
            {step === 1 ? "Nuovo contratto: scegli il modello" : typeTitle(tipo, customTemplates)}
          </DialogTitle>
          <DialogDescription>{step === 1 ? "Modelli aggiornati alla normativa italiana, con intestazione e dati della tua impresa." : "I dati dell'impresa si inseriscono da soli dal Profilo ditta."}</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {CATEGORIES.map((cat) => {
              const I = CAT_ICON[cat.key];
              return (
                <section key={cat.key}>
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><I className="w-4 h-4 text-brand-600" />{cat.label}<span className="font-normal text-slate-500">· {cat.desc}</span></h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                    {cat.types.filter((t) => contractSchemas[t]).map((t) => (
                      <button key={t} onClick={() => pick(t)} className="text-left rounded-lg border border-slate-200 p-3 hover:border-brand-500 hover:bg-brand-50/40 transition-colors">
                        <p className="text-sm font-medium text-slate-900">{contractSchemas[t].title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{contractSchemas[t].required.length} dati principali</p>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {customTemplates.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Bookmark className="w-4 h-4 text-brand-600" />I tuoi modelli</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                  {customTemplates.map((t) => (
                    <button key={t.id} onClick={() => pick(`custom_${t.id}`)} className="text-left rounded-lg border border-slate-200 p-3 hover:border-brand-500 hover:bg-brand-50/40">
                      <p className="text-sm font-medium text-slate-900">{t.nome}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Modello personalizzato</p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {step === 2 && (
          <>
            <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="overflow-y-auto p-5 space-y-5 border-r border-slate-100">
                {/* Collegamenti che precompilano */}
                <div className="grid sm:grid-cols-2 gap-3">
                  {partyKind(tipo) === "dipendente" ? (
                    <div>
                      <Label htmlFor="contractwizard-dipendente" className="text-xs text-slate-600">Dipendente</Label>
                      <Select value={links.dipendente_id || NONE} onValueChange={(v) => v === NONE ? setLinks((l) => ({ ...l, dipendente_id: "" })) : linkEmployee(v)}>
                        <SelectTrigger id="contractwizard-dipendente"><SelectValue placeholder="Scegli per compilare i dati" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— Nuova persona —</SelectItem>
                          {employees.map((e) => <SelectItem key={e.id} value={e.id}>{`${e.nome || ""} ${e.cognome || ""}`.trim()}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="contractwizard-cliente-fornitore" className="text-xs text-slate-600">Cliente / fornitore</Label>
                      <Select value={links.contatto_id || NONE} onValueChange={(v) => v === NONE ? setLinks((l) => ({ ...l, contatto_id: "" })) : linkContact(v)}>
                        <SelectTrigger id="contractwizard-cliente-fornitore"><SelectValue placeholder="Scegli per compilare i dati" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— Nessuno —</SelectItem>
                          {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome || c.nome_privato || "Senza nome"}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="contractwizard-lavoro-collegato" className="text-xs text-slate-600">Lavoro collegato</Label>
                    <Select value={links.worksite_id || NONE} onValueChange={(v) => v === NONE ? setLinks((l) => ({ ...l, worksite_id: "" })) : linkWorksite(v)}>
                      <SelectTrigger id="contractwizard-lavoro-collegato"><SelectValue placeholder="Facoltativo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Nessuno —</SelectItem>
                        {worksites.map((w) => <SelectItem key={w.id} value={w.id}>{w.nome || "Lavoro"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {tipo === "appalto" && (
                  <div>
                    <Label className="text-xs text-slate-600">La mia impresa è</Label>
                    <div className="grid sm:grid-cols-2 gap-2 mt-1">
                      {[["appaltatore", "Appaltatore", "Esegue i lavori per il cliente"], ["committente", "Committente", "Affida i lavori a un'altra impresa"]].map(([v, l, d]) => (
                        <button key={v} type="button" onClick={() => setFields((x) => ({ ...x, RUOLO_DITTA: v }))} className={`rounded-lg border p-2 text-left ${(fields.RUOLO_DITTA || "appaltatore") === v ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300"}`}>
                          <span className="block text-sm font-medium text-slate-900">{l}</span><span className="block text-xs text-slate-500">{d}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* IA */}
                <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3 space-y-2">
                  <Label htmlFor="ai-desc" className="text-sm font-medium text-slate-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-brand-600" /> Compila con l'IA</Label>
                  <p className="text-xs text-slate-600">Usa i dati del lavoro, dei preventivi e della controparte collegati; puoi aggiungere una descrizione o allegare un documento (preventivo accettato, capitolato, offerta).</p>
                  <Textarea id="ai-desc" rows={2} value={aiText} onChange={(e) => setAiText(e.target.value)} className="bg-white" placeholder={partyKind(tipo) === "dipendente" ? "es. muratore 3° livello, 40 ore, dal 1 ottobre per 6 mesi, 1.800 € lordi, prova 30 giorni, cantieri in provincia di Bolzano" : "es. rifacimento tetto condominio via Roma 12, 48.000 € + IVA, inizio 15/10 fine 20/12, SAL al 30%, penale 100 € al giorno"} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={runAi} disabled={!canAi || aiBusy || aiUploading} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Compila tutto</Button>
                    <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 bg-white text-sm cursor-pointer hover:bg-slate-50">
                      {aiUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}{aiFile ? <span className="max-w-[160px] truncate">{aiFile.name}</span> : "Allega documento"}
                      <input type="file" accept=".pdf,image/*,.txt" className="hidden" onChange={(e) => { attachForAi(e.target.files[0]); e.target.value = ""; }} aria-label="Documento per l'IA" />
                    </label>
                    {aiFile && <button type="button" onClick={() => setAiFile(null)} className="text-xs text-slate-500 hover:text-red-600">Rimuovi</button>}
                  </div>
                </div>

                {!isCustom && (
                  <div>
                    <Label className="text-xs text-slate-600">Livello di dettaglio</Label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {contractVariants.map((v) => (
                        <button key={v.value} type="button" onClick={() => setVariant(v.value)} className={`rounded-lg border p-2 text-center ${variant === v.value ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300"}`}>
                          <span className="block text-sm font-medium text-slate-900">{v.label}</span>
                          <span className="block text-xs text-slate-500">{v.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-2 flex items-center justify-between">Dati principali {missing.length > 0 && <span className="text-xs font-normal text-amber-700">{missing.length} da compilare</span>}</p>
                  <div className="grid sm:grid-cols-2 gap-3">{required.map(renderField)}</div>
                </div>

                {optional.length > 0 && (
                  <div className="border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => setShowOptional(!showOptional)} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900">
                      {showOptional ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Clausole e dati facoltativi ({optional.filter((f) => fields[f.key]).length}/{optional.length})
                    </button>
                    {showOptional && <div className="grid sm:grid-cols-2 gap-3 mt-3">{optional.map(renderField)}</div>}
                  </div>
                )}

                <div className="border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} /> Salva anche come mio modello
                  </label>
                  {asTemplate && <Input className="mt-2" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Nome del modello" />}
                </div>
              </div>

              {/* Anteprima testo */}
              <div className="hidden lg:flex flex-col min-h-0 bg-slate-100">
                <p className="px-5 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> Anteprima del testo</p>
                <div className="flex-1 overflow-y-auto px-5 pb-5">
                  <div className="bg-white shadow-sm rounded-md px-8 py-7 text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap font-serif">{content || "—"}</div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={() => onPreviewPdf({ tipo, content, fields })} className="gap-1.5"><Eye className="w-4 h-4" /> Anteprima PDF</Button>
              <Button onClick={submit} disabled={saving} className="bg-brand-600 hover:bg-brand-700 gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva contratto</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
