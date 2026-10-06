import React, { useEffect, useMemo, useState } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import {
  Building2, Save, X, Plus, Trash2, Bell, Palette, Mail, Database, Search, Loader2, CheckCircle2, AlertCircle, PenLine, Stamp, Image as ImageIcon, RotateCcw, FileText, History,
} from "lucide-react";
import { QUOTE_TEMPLATES } from "@/utils/quoteTemplates";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import PageHeader from "@/components/shared/PageHeader";
import { numerazioneOptions } from "@/utils/quoteNumbering";
import DataPrivacy from "@/components/settings/DataPrivacy";
import ActivityLog from "@/components/settings/ActivityLog";
import EmailAccountsSettings from "@/components/settings/EmailAccountsSettings";
import ColorSettings from "@/components/settings/ColorSettings";
import DrawSignatureDialog from "@/components/settings/DrawSignatureDialog";
import { useThemeColors } from "@/hooks/useThemeColors";
import { isValidPartitaIva, isValidCodiceFiscale, isValidIban, isValidCap, isValidProvincia, isValidSdi, isValidEmail, formatIban } from "@/lib/validators";

const SECTIONS = [
  { key: "anagrafica", label: "Dati dell'impresa", icon: Building2 },
  { key: "contatti", label: "Contatti", icon: Mail },
  { key: "immagine", label: "Logo, firma e colori", icon: Palette },
  { key: "documenti", label: "Documenti e preventivi", icon: FileText },
  { key: "posta", label: "Caselle email", icon: Mail },
  { key: "scadenze", label: "Avvisi di scadenza", icon: Bell },
  { key: "registro", label: "Registro attività", icon: History },
  { key: "dati", label: "Dati e privacy", icon: Database },
];

const EMPTY = {
  ragione_sociale: "", partita_iva: "", codice_fiscale: "", indirizzo: "", citta: "", cap: "", provincia: "", telefono: "", email: "", emails_extra: [], pec: "",
  iban: "", numero_rea: "", codice_destinatario: "", sito_web: "", colore_principale: "#1e40af", colore_secondario: "", colore_menu: "#0f172a",
  settore: "edilizia", termine_sezioni: "Cantiere", giorni_preavviso_scadenza: 30, ripeti_promemoria: false, numero_promemoria_ripetuti: 1,
  logo_su_ogni_pagina: true, template_predefinito: "classica",
};

// Campi che contano per documenti conformi (intestazione, fatture, contratti).
const REQUIRED = [
  ["ragione_sociale", "Ragione sociale"], ["partita_iva", "Partita IVA"], ["codice_fiscale", "Codice fiscale"], ["indirizzo", "Indirizzo"],
  ["citta", "Città"], ["cap", "CAP"], ["provincia", "Provincia"], ["telefono", "Telefono"], ["email", "Email"], ["pec", "PEC"],
  ["iban", "IBAN"], ["codice_destinatario", "Codice SDI"], ["logo_url", "Logo"], ["firma_url", "Firma"],
];

function checks(p) {
  const e = {};
  if (p.partita_iva && !isValidPartitaIva(p.partita_iva)) e.partita_iva = "Partita IVA non valida (11 cifre, controllo errato)";
  if (p.codice_fiscale && !isValidCodiceFiscale(p.codice_fiscale) && !isValidPartitaIva(p.codice_fiscale)) e.codice_fiscale = "Codice fiscale non valido";
  if (p.iban && !isValidIban(p.iban)) e.iban = "IBAN non valido";
  if (p.cap && !isValidCap(p.cap)) e.cap = "5 cifre";
  if (p.provincia && !isValidProvincia(p.provincia)) e.provincia = "Sigla di 2 lettere (es. BZ)";
  if (p.codice_destinatario && !isValidSdi(p.codice_destinatario)) e.codice_destinatario = "7 caratteri (es. 0000000 o M5UXCR1)";
  if (p.email && !isValidEmail(p.email)) e.email = "Email non valida";
  if (p.pec && !isValidEmail(p.pec)) e.pec = "PEC non valida";
  return e;
}

export default function CompanyProfile() {
  const { toast } = useToast();
  const [profile, setProfile] = useState(null);
  const [saved, setSaved] = useState("");
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState(() => {
    const s = new URLSearchParams(window.location.search).get("sezione");
    return SECTIONS.some((x) => x.key === s) ? s : "anagrafica";
  });
  const [vies, setVies] = useState({ loading: false, msg: null, ok: false });
  const [sigDrawOpen, setSigDrawOpen] = useState(false);
  const [uploading, setUploading] = useState("");

  useThemeColors(profile);

  useEffect(() => {
    (async () => {
      try {
        const active = (await db.CompanyProfile.list())[0];
        const p = active ? { ...EMPTY, ...active, settore: "edilizia", termine_sezioni: active.termine_sezioni || "Cantiere" } : { ...EMPTY };
        setProfile(p);
        setSaved(JSON.stringify(p));
        setProfileId(active?.id || null);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const dirty = profile && JSON.stringify(profile) !== saved;
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (field, value) => setProfile((p) => ({ ...p, [field]: value }));
  const errors = useMemo(() => (profile ? checks(profile) : {}), [profile]);
  const missing = useMemo(() => (profile ? REQUIRED.filter(([k]) => !String(profile[k] || "").trim()) : []), [profile]);
  const completeness = profile ? Math.round(((REQUIRED.length - missing.length) / REQUIRED.length) * 100) : 0;

  const save = async () => {
    if (Object.keys(errors).length && !confirm(`Ci sono ${Object.keys(errors).length} dati da correggere (${Object.values(errors)[0]}). Salvare comunque?`)) return;
    setSaving(true);
    try {
      const data = { ...profile };
      for (const k of ["id", "created_date", "updated_date", "created_by_id"]) delete data[k];
      data.emails_extra = (data.emails_extra || []).map((x) => x.trim()).filter(Boolean);
      if (data.iban) data.iban = data.iban.replace(/\s+/g, "").toUpperCase();
      if (data.provincia) data.provincia = data.provincia.toUpperCase();
      if (data.codice_fiscale) data.codice_fiscale = data.codice_fiscale.toUpperCase();
      if (data.codice_destinatario) data.codice_destinatario = data.codice_destinatario.toUpperCase();
      const rec = profileId ? await db.CompanyProfile.update(profileId, data) : await db.CompanyProfile.create(data);
      if (!profileId) setProfileId(rec.id);
      const next = { ...profile, ...data };
      setProfile(next);
      setSaved(JSON.stringify(next));
      toast({ title: "Profilo salvato", description: "I nuovi dati compaiono su preventivi, contratti ed email." });
    } catch (e) {
      toast({ title: "Salvataggio non riuscito", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const lookupVies = async () => {
    setVies({ loading: true, msg: null, ok: false });
    try {
      const res = await api.functions.invoke("vies", { partita_iva: profile.partita_iva });
      if (res.data?.error) throw new Error(res.data.error);
      if (!res.data.valid) { setVies({ loading: false, ok: false, msg: "Partita IVA non attiva nel registro europeo (VIES)" }); return; }
      const d = res.data;
      setProfile((p) => ({
        ...p,
        ragione_sociale: p.ragione_sociale || d.ragione_sociale || "",
        indirizzo: p.indirizzo || d.indirizzo || "", cap: p.cap || d.cap || "", citta: p.citta || d.citta || "", provincia: p.provincia || d.provincia || "",
        codice_fiscale: p.codice_fiscale || p.partita_iva.replace(/\D/g, ""),
      }));
      setVies({ loading: false, ok: true, msg: `Partita IVA attiva: ${String(d.ragione_sociale || "dati trovati").replace(/\.$/, "")}. Ho compilato i campi vuoti.` });
    } catch (e) {
      setVies({ loading: false, ok: false, msg: e.message });
    }
  };

  const upload = async (field, file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Immagine troppo grande (max 5 MB)", variant: "destructive" }); return; }
    setUploading(field);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      set(field, file_url);
    } catch { toast({ title: "Caricamento non riuscito", variant: "destructive" }); }
    finally { setUploading(""); }
  };

  if (loading || !profile) return <LoadingSpinner />;

  const field = (key, label, props = {}) => (
    <div className={props.wide ? "sm:col-span-2" : ""}>
      <Label htmlFor={`p-${key}`} className="text-sm font-medium text-slate-700">{label}</Label>
      <Input id={`p-${key}`} value={profile[key] ?? ""} onChange={(e) => set(key, e.target.value)} className={`mt-1 ${errors[key] ? "border-red-400 focus-visible:ring-red-400" : ""}`}
        placeholder={props.placeholder} inputMode={props.inputMode} autoComplete="off" spellCheck={false} />
      {errors[key] ? <p className="text-xs text-red-600 mt-1">{errors[key]}</p> : props.hint ? <p className="text-xs text-slate-500 mt-1">{props.hint}</p> : null}
    </div>
  );

  return (
    <div className="pb-24">
      <PageHeader title="Profilo ditta" subtitle="I dati che compaiono su preventivi, contratti, email e documenti: tienili completi e corretti." />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4 items-start">
        {/* Menu sezioni + completezza */}
        <aside className="lg:sticky lg:top-4 space-y-3 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              {profile.logo_url ? <img src={profile.logo_url} alt="" className="w-11 h-11 rounded-lg object-contain border border-slate-100 bg-white" /> : <div className="w-11 h-11 rounded-lg bg-slate-100 grid place-items-center"><Building2 className="w-5 h-5 text-slate-500" /></div>}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{profile.ragione_sociale || "La tua impresa"}</p>
                <p className="text-xs text-slate-500 truncate">{profile.partita_iva ? `P.IVA ${profile.partita_iva}` : "Dati da completare"}</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">Profilo completo</span><span className="font-semibold tabular-nums text-slate-900">{completeness}%</span></div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${completeness === 100 ? "bg-emerald-500" : "bg-brand-600"}`} style={{ width: `${completeness}%` }} /></div>
              {missing.length > 0 && <p className="text-xs text-slate-500 mt-2">Mancano: {missing.slice(0, 4).map(([, l]) => l).join(", ")}{missing.length > 4 ? ` e altri ${missing.length - 4}` : ""}</p>}
            </div>
          </div>
          <nav className="bg-white rounded-2xl border border-slate-200 p-1.5 flex lg:flex-col gap-0.5 overflow-x-auto no-scrollbar">
            {SECTIONS.map(({ key, label, icon: I }) => (
              <button key={key} onClick={() => setSection(key)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap text-left ${section === key ? "bg-brand-50 text-brand-800 font-medium" : "text-slate-700 hover:bg-slate-50"}`}>
                <I className="w-4 h-4 shrink-0" /> {label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          {section === "anagrafica" && (
            <Panel title="Dati dell'impresa" desc="Inserisci la partita IVA e premi Cerca: ragione sociale e indirizzo arrivano dal registro europeo VIES.">
              <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3 mb-5">
                <Label htmlFor="p-partita_iva" className="text-sm font-medium text-slate-800">Partita IVA</Label>
                <div className="flex gap-2 mt-1">
                  <Input id="p-partita_iva" value={profile.partita_iva || ""} onChange={(e) => set("partita_iva", e.target.value.replace(/\s/g, ""))} inputMode="numeric" className={`bg-white max-w-xs ${errors.partita_iva ? "border-red-400" : ""}`} placeholder="01234567890" />
                  <Button type="button" variant="outline" className="gap-1.5 bg-white" onClick={lookupVies} disabled={vies.loading || !isValidPartitaIva(profile.partita_iva)}>
                    {vies.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Cerca
                  </Button>
                </div>
                {errors.partita_iva && <p className="text-xs text-red-600 mt-1">{errors.partita_iva}</p>}
                {vies.msg && <p className={`text-xs mt-1.5 flex items-center gap-1 ${vies.ok ? "text-emerald-700" : "text-amber-800"}`}>{vies.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}{vies.msg}</p>}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {field("ragione_sociale", "Ragione sociale", { wide: true, placeholder: "Edil Rossi S.r.l." })}
                {field("codice_fiscale", "Codice fiscale", { hint: "Per le società di solito coincide con la partita IVA" })}
                {field("numero_rea", "Numero REA", { placeholder: "BZ-123456" })}
                {field("indirizzo", "Indirizzo della sede", { wide: true, placeholder: "Via Roma 12" })}
                {field("citta", "Città")}
                <div className="grid grid-cols-2 gap-3">
                  {field("cap", "CAP", { inputMode: "numeric" })}
                  {field("provincia", "Provincia", { placeholder: "BZ" })}
                </div>
                {field("codice_destinatario", "Codice destinatario SDI", { hint: "Per ricevere le fatture elettroniche" })}
                <div>
                  <Label htmlFor="p-iban" className="text-sm font-medium text-slate-700">IBAN</Label>
                  <Input id="p-iban" value={profile.iban || ""} onChange={(e) => set("iban", e.target.value)} onBlur={() => profile.iban && isValidIban(profile.iban) && set("iban", formatIban(profile.iban))} className={`mt-1 font-mono ${errors.iban ? "border-red-400" : ""}`} placeholder="IT60 X054 2811 1010 0000 0123 456" />
                  {errors.iban ? <p className="text-xs text-red-600 mt-1">{errors.iban}</p> : <p className="text-xs text-slate-500 mt-1">Compare nei preventivi per i pagamenti</p>}
                </div>
                <div>
                  <Label htmlFor="companyprofile-regime-fiscale" className="text-sm font-medium text-slate-700">Regime fiscale</Label>
                  <Select value={profile.regime_fiscale || "RF01"} onValueChange={(v) => set("regime_fiscale", v)}>
                    <SelectTrigger id="companyprofile-regime-fiscale" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="RF01">Ordinario</SelectItem><SelectItem value="RF19">Forfettario (L. 190/2014)</SelectItem></SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">Usato nelle fatture elettroniche</p>
                </div>
                <div>
                  <Label htmlFor="companyprofile-come-chiami-i-luoghi-di-lavo" className="text-sm font-medium text-slate-700">Come chiami i luoghi di lavoro</Label>
                  <Select value={profile.termine_sezioni || "Cantiere"} onValueChange={(v) => set("termine_sezioni", v)}>
                    <SelectTrigger id="companyprofile-come-chiami-i-luoghi-di-lavo" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Cantiere", "Lavoro", "Commessa", "Impianto"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">Usato nelle Presenze</p>
                </div>
              </div>
            </Panel>
          )}

          {section === "contatti" && (
            <Panel title="Contatti" desc="Compaiono nell'intestazione dei documenti e come riferimenti per i clienti.">
              <div className="grid sm:grid-cols-2 gap-4">
                {field("telefono", "Telefono", { inputMode: "tel", placeholder: "+39 0471 123456" })}
                {field("sito_web", "Sito web", { placeholder: "www.edilrossi.it" })}
                {field("email", "Email principale", { placeholder: "info@edilrossi.it" })}
                {field("pec", "PEC", { placeholder: "edilrossi@pec.it" })}
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium text-slate-700">Altre email (uffici, amministrazione…)</Label>
                  <Button size="sm" variant="outline" onClick={() => set("emails_extra", [...(profile.emails_extra || []), ""])} className="gap-1"><Plus className="w-3.5 h-3.5" /> Aggiungi</Button>
                </div>
                {!(profile.emails_extra || []).length ? <p className="text-sm text-slate-500">Nessuna email aggiuntiva.</p> : (
                  <div className="space-y-2">
                    {profile.emails_extra.map((em, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={em} onChange={(e) => set("emails_extra", profile.emails_extra.map((x, j) => (j === i ? e.target.value : x)))} placeholder="amministrazione@edilrossi.it" className={em && !isValidEmail(em) ? "border-red-400" : ""} />
                        <button onClick={() => set("emails_extra", profile.emails_extra.filter((_, j) => j !== i))} className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Rimuovi"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-2">Per inviare email da Talo configura le caselle nella sezione "Caselle email".</p>
              </div>
            </Panel>
          )}

          {section === "immagine" && (
            <div className="space-y-4">
              <Panel title="Logo, firma e timbro" desc="Immagini PNG con sfondo trasparente danno il risultato migliore sui PDF.">
                <div className="grid sm:grid-cols-3 gap-4">
                  {[["logo_url", "Logo", ImageIcon], ["firma_url", "Firma", PenLine], ["timbro_url", "Timbro", Stamp]].map(([key, label, I]) => (
                    <div key={key}>
                      <p className="text-sm font-medium text-slate-700 mb-1.5">{label}</p>
                      <div className="relative h-36 rounded-xl border-2 border-dashed border-slate-200 bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%,transparent_75%,#f8fafc_75%),linear-gradient(45deg,#f8fafc_25%,transparent_25%,transparent_75%,#f8fafc_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] grid place-items-center overflow-hidden">
                        {uploading === key ? <Loader2 className="w-6 h-6 animate-spin text-brand-600" /> : profile[key] ? (
                          <>
                            <img src={profile[key]} alt={label} className="max-h-28 max-w-[85%] object-contain" />
                            <button onClick={() => set(key, "")} className="absolute top-2 right-2 p-1 rounded-full bg-white shadow border border-slate-200 text-slate-500 hover:text-red-600" aria-label={`Rimuovi ${label}`}><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <label className="cursor-pointer flex flex-col items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 p-4 text-center">
                            <I className="w-6 h-6" /> Carica {label.toLowerCase()}
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { upload(key, e.target.files?.[0]); e.target.value = ""; }} />
                          </label>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1.5 text-xs">
                        {profile[key] && <label className="text-brand-700 hover:underline cursor-pointer">Sostituisci<input type="file" accept="image/*" className="hidden" onChange={(e) => { upload(key, e.target.files?.[0]); e.target.value = ""; }} /></label>}
                        {key === "firma_url" && <button onClick={() => setSigDrawOpen(true)} className="text-brand-700 hover:underline">Disegna a mano</button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
                  <div>
                    <Label htmlFor="companyprofile-posizione-del-logo" className="text-sm font-medium text-slate-700">Posizione del logo</Label>
                    <Select value={profile.logo_posizione || "alto_sinistra"} onValueChange={(v) => set("logo_posizione", v)}>
                      <SelectTrigger id="companyprofile-posizione-del-logo" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alto_sinistra">In alto a sinistra</SelectItem>
                        <SelectItem value="alto_centro">In alto al centro</SelectItem>
                        <SelectItem value="alto_destra">In alto a destra</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label htmlFor="companyprofile-larghezza-logo-mm" className="text-sm font-medium text-slate-700">Larghezza logo (mm)</Label><Input id="companyprofile-larghezza-logo-mm" type="number" min={10} max={80} value={profile.logo_larghezza ?? 35} onChange={(e) => set("logo_larghezza", parseInt(e.target.value) || 35)} className="mt-1" /></div>
                  <div><Label htmlFor="companyprofile-altezza-logo-mm" className="text-sm font-medium text-slate-700">Altezza logo (mm)</Label><Input id="companyprofile-altezza-logo-mm" type="number" min={5} max={50} value={profile.logo_altezza ?? 18} onChange={(e) => set("logo_altezza", parseInt(e.target.value) || 18)} className="mt-1" /></div>
                </div>
                <label className="flex items-center gap-2 mt-4 text-sm text-slate-700"><Switch checked={profile.logo_su_ogni_pagina ?? true} onCheckedChange={(v) => set("logo_su_ogni_pagina", v)} /> Logo su ogni pagina dei PDF</label>
              </Panel>

              <Panel title="Anteprima della carta intestata" desc="Così appare l'intestazione di preventivi e contratti.">
                <Letterhead p={profile} />
              </Panel>

              <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 [&>div]:mt-0 [&>div]:border-0 [&>div]:pt-0"><ColorSettings profile={profile} onChange={set} /></section>
            </div>
          )}

          {section === "documenti" && (
            <div className="space-y-4">
              <Panel title="Numerazione dei preventivi">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-3">
                    <Label htmlFor="companyprofile-formato" className="text-sm font-medium text-slate-700">Formato</Label>
                    <Select value={profile.numerazione_tipo || "progressiva_anno"} onValueChange={(v) => set("numerazione_tipo", v)}>
                      <SelectTrigger id="companyprofile-formato" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{numerazioneOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">{numerazioneOptions.find((o) => o.value === (profile.numerazione_tipo || "progressiva_anno"))?.description}</p>
                  </div>
                  {profile.numerazione_tipo === "prefisso" && <div><Label htmlFor="companyprofile-prefisso" className="text-sm font-medium text-slate-700">Prefisso</Label><Input id="companyprofile-prefisso" value={profile.numerazione_prefisso || "PREV"} onChange={(e) => set("numerazione_prefisso", e.target.value)} className="mt-1" /></div>}
                  {profile.numerazione_tipo === "codice" && <div><Label htmlFor="companyprofile-numero-di-partenza" className="text-sm font-medium text-slate-700">Numero di partenza</Label><Input id="companyprofile-numero-di-partenza" type="number" value={profile.numerazione_partenza ?? 1} onChange={(e) => set("numerazione_partenza", parseInt(e.target.value) || 1)} className="mt-1" /></div>}
                </div>
              </Panel>
              <Panel title="Modello di preventivo predefinito" desc="Il modello con cui partono i nuovi preventivi (puoi cambiarlo ogni volta).">
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {QUOTE_TEMPLATES.map((t) => (
                    <button key={t.id} onClick={() => set("template_predefinito", t.id)} className={`text-left p-3 rounded-xl border transition-colors ${(profile.template_predefinito || "classica") === t.id ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300"}`}>
                      <span className="block text-sm font-medium text-slate-900">{t.nome}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{t.descrizione}</span>
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {section === "posta" && (
            <div className="[&>div]:mt-0 [&>div]:rounded-2xl"><EmailAccountsSettings profile={profile} /></div>
          )}

          {section === "scadenze" && (
            <Panel title="Avvisi di scadenza" desc="Valori predefiniti per documenti, corsi e contratti: ogni documento può avere i suoi.">
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="companyprofile-giorni-di-preavviso" className="text-sm font-medium text-slate-700">Giorni di preavviso</Label>
                  <Input id="companyprofile-giorni-di-preavviso" type="number" min={0} max={365} value={profile.giorni_preavviso_scadenza ?? 30} onChange={(e) => set("giorni_preavviso_scadenza", parseInt(e.target.value) || 0)} className="mt-1" />
                  <p className="text-xs text-slate-500 mt-1">Quanti giorni prima avvisare</p>
                </div>
                <div>
                  <Label htmlFor="companyprofile-ripeti-l-avviso" className="text-sm font-medium text-slate-700">Ripeti l'avviso</Label>
                  <label className="flex items-center gap-2 mt-2.5 text-sm text-slate-700"><Switch id="companyprofile-ripeti-l-avviso" checked={!!profile.ripeti_promemoria} onCheckedChange={(v) => set("ripeti_promemoria", v)} />{profile.ripeti_promemoria ? "Sì, fino alla scadenza" : "No, una volta sola"}</label>
                </div>
                {profile.ripeti_promemoria && (
                  <div>
                    <Label htmlFor="companyprofile-numero-di-avvisi" className="text-sm font-medium text-slate-700">Numero di avvisi</Label>
                    <Input id="companyprofile-numero-di-avvisi" type="number" min={1} max={10} value={profile.numero_promemoria_ripetuti ?? 1} onChange={(e) => set("numero_promemoria_ripetuti", parseInt(e.target.value) || 1)} className="mt-1" />
                  </div>
                )}
              </div>
              <label className="flex items-start gap-3 mt-5 rounded-lg border border-slate-200 p-3 cursor-pointer">
                <Switch checked={profile.report_settimanale !== false} onCheckedChange={(v) => set("report_settimanale", v)} className="mt-0.5" />
                <span className="text-sm"><span className="font-medium text-slate-900">Report settimanale via email</span><span className="block text-slate-600">Ogni lunedì mattina: incassi della settimana, crediti da sollecitare, lavori in ritardo o con margine a rischio e scadenze dei prossimi 14 giorni.</span></span>
              </label>
              <p className="text-sm text-slate-600 mt-5 rounded-lg bg-slate-50 border border-slate-200 p-3">Ogni mattina Talo invia a ciascun utente un'email con i promemoria del giorno; con l'app aperta arriva anche la notifica sul dispositivo.</p>
            </Panel>
          )}

          {section === "registro" && <ActivityLog />}

          {section === "dati" && (
            <DataPrivacy profile={profile} />
          )}
        </div>
      </div>

      {/* Barra di salvataggio */}
      {dirty && (
        <div className="fixed bottom-20 lg:bottom-5 left-1/2 -translate-x-1/2 lg:left-[calc(50%+7.5rem)] z-40 flex items-center gap-3 rounded-full bg-slate-900 text-white pl-5 pr-2 py-2 shadow-xl">
          <span className="text-sm whitespace-nowrap">Modifiche non salvate</span>
          <Button size="sm" variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 gap-1.5 rounded-full" onClick={() => setProfile(JSON.parse(saved))}><RotateCcw className="w-4 h-4" /> Annulla</Button>
          <Button size="sm" onClick={save} disabled={saving} className="bg-brand-600 hover:bg-brand-500 gap-1.5 rounded-full">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva</Button>
        </div>
      )}

      <DrawSignatureDialog open={sigDrawOpen} onOpenChange={setSigDrawOpen} currentSignature={profile.firma_url}
        onSaved={(url) => { set("firma_url", url); toast({ title: "Firma pronta", description: "Premi Salva per usarla nei documenti." }); }} />
    </div>
  );
}

function Panel({ title, desc, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {desc && <p className="text-sm text-slate-500 mt-0.5">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Letterhead({ p }) {
  const color = p.colore_principale || "#1e40af";
  const pos = p.logo_posizione || "alto_sinistra";
  const addr = [p.indirizzo, [p.cap, p.citta].filter(Boolean).join(" "), p.provincia && `(${p.provincia})`].filter(Boolean).join(", ");
  const logo = p.logo_url
    ? <img src={p.logo_url} alt="" style={{ width: `${(p.logo_larghezza || 35) * 2.2}px`, maxHeight: `${(p.logo_altezza || 18) * 2.2}px` }} className="object-contain" />
    : <div className="h-10 w-24 rounded bg-slate-100 grid place-items-center text-[10px] text-slate-500">LOGO</div>;
  const info = (
    <div className={`text-[11px] leading-relaxed text-slate-600 ${pos === "alto_destra" ? "" : pos === "alto_centro" ? "text-center" : "text-right"}`}>
      <p className="text-sm font-bold" style={{ color }}>{p.ragione_sociale || "Ragione sociale"}</p>
      <p>{addr || "Indirizzo della sede"}</p>
      <p>{[p.partita_iva && `P.IVA ${p.partita_iva}`, p.numero_rea && `REA ${p.numero_rea}`].filter(Boolean).join(" · ") || "P.IVA"}</p>
      <p>{[p.telefono, p.email].filter(Boolean).join(" · ")}</p>
      {p.pec && <p>PEC {p.pec}</p>}
    </div>
  );
  return (
    <div className="rounded-lg bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-[560px] bg-white shadow-sm rounded-sm px-8 py-7 aspect-[210/140] flex flex-col">
        <div className={`flex gap-4 ${pos === "alto_centro" ? "flex-col items-center" : pos === "alto_destra" ? "flex-row-reverse justify-between items-start" : "justify-between items-start"}`}>
          {logo}{info}
        </div>
        <div className="h-0.5 mt-4" style={{ background: color }} />
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold text-slate-800">PREVENTIVO N. 2026/014</p>
          {[92, 80, 86, 60].map((w, i) => <div key={i} className="h-1.5 rounded bg-slate-100" style={{ width: `${w}%` }} />)}
        </div>
        <div className="mt-auto flex justify-end items-end gap-4">
          {p.timbro_url && <img src={p.timbro_url} alt="" className="h-12 object-contain opacity-90" />}
          {p.firma_url ? <img src={p.firma_url} alt="" className="h-10 object-contain" /> : <div className="w-24 border-t border-slate-300 text-[10px] text-slate-400 text-center pt-0.5">Firma</div>}
        </div>
      </div>
    </div>
  );
}
