import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Building2, Upload, Save, X, Plus, Trash2, Bell, Hash, LayoutTemplate } from "lucide-react";
import { QUOTE_TEMPLATES } from "@/utils/quoteTemplates";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import PageHeader from "@/components/shared/PageHeader";
import { numerazioneOptions } from "@/utils/quoteNumbering";
import BackupExport from "@/components/shared/BackupExport";
import EmailAccountsSettings from "@/components/settings/EmailAccountsSettings";
import ColorSettings from "@/components/settings/ColorSettings";
import DrawSignatureDialog from "@/components/settings/DrawSignatureDialog";
import { useThemeColors } from "@/hooks/useThemeColors";
import { PenLine } from "lucide-react";

export default function CompanyProfile() {
  const [profile, setProfile] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoPrompt, setLogoPrompt] = useState(null); // { type: "logo"|"firma", url }
  const [sigDrawOpen, setSigDrawOpen] = useState(false);
  const { toast } = useToast();

  useThemeColors(profile);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const profiles = await db.CompanyProfile.list();
      const active = profiles[0];
      if (active) {
        setProfile({ ...active, settore: "edilizia", termine_sezioni: "Cantiere" });
        setProfileId(active.id);
      } else {
        setProfile({ ragione_sociale: "", partita_iva: "", codice_fiscale: "", indirizzo: "", citta: "", cap: "", provincia: "", telefono: "", email: "", emails_extra: [], pec: "", iban: "", numero_rea: "", colore_principale: "#1e40af", colore_secondario: "", colore_terziario: "", colore_quaternario: "", colore_menu: "#0f172a", settore: "edilizia", termine_sezioni: "Cantiere", giorni_preavviso_scadenza: 30, ripeti_promemoria: false, numero_promemoria_ripetuti: 1, logo_su_ogni_pagina: true, template_predefinito: "classica" });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleChange = (field, value) => setProfile(prev => ({ ...prev, [field]: value }));

  const addExtraEmail = () => setProfile(prev => ({ ...prev, emails_extra: [...(prev.emails_extra || []), ""] }));
  const updateExtraEmail = (idx, value) => setProfile(prev => ({ ...prev, emails_extra: prev.emails_extra.map((e, i) => i === idx ? value : e) }));
  const removeExtraEmail = (idx) => setProfile(prev => ({ ...prev, emails_extra: prev.emails_extra.filter((_, i) => i !== idx) }));

  const handleFileUpload = async (field, e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      handleChange(field, file_url);
      if (field === "logo_url" || field === "firma_url") {
        setLogoPrompt({ type: field === "logo_url" ? "logo" : "firma", url: file_url, field });
      }
    } catch (err) {
      toast({ title: "Errore upload", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = { ...profile };
      delete data.id; delete data.created_date; delete data.updated_date; delete data.created_by_id;
      if (profileId) {
        await db.CompanyProfile.update(profileId, data);
      } else {
        const created = await db.CompanyProfile.create(data);
        setProfileId(created.id);
      }
      toast({ title: "Salvato", description: "Profilo aggiornato" });
    } catch (e) {
      toast({ title: "Errore", variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingSpinner />;

  const fields = [
    { key: "ragione_sociale", label: "Ragione Sociale" },
    { key: "partita_iva", label: "Partita IVA" },
    { key: "codice_fiscale", label: "Codice Fiscale" },
    { key: "indirizzo", label: "Indirizzo" },
    { key: "citta", label: "Città" },
    { key: "cap", label: "CAP", autoComplete: "postal-code", autoCorrect: "off", autoCapitalize: "characters", spellCheck: false, inputMode: "numeric" },
    { key: "provincia", label: "Provincia" },
    { key: "telefono", label: "Telefono" },
    { key: "iban", label: "IBAN" },
    { key: "numero_rea", label: "Numero REA" },
    { key: "codice_destinatario", label: "Codice di Fatturazione" },
    { key: "sito_web", label: "Sito Web" },
  ];

  const imageFields = [
    { key: "logo_url", label: "Logo" },
    { key: "firma_url", label: "Firma" },
    { key: "timbro_url", label: "Timbro" },
  ];

  return (
    <div>
      <PageHeader title="Profilo Ditta" subtitle="Dati aziendali, logo, firma e timbro" actionLabel="Salva" onAction={handleSave} actionIcon={Save} />

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {fields.map(f => (
            <div key={f.key}>
              <Label className="text-sm font-medium text-slate-700">{f.label}</Label>
              <Input value={profile[f.key] || ""} onChange={e => handleChange(f.key, e.target.value)} className="mt-1" placeholder={f.label} autoComplete={f.autoComplete || "off"} autoCorrect={f.autoCorrect} autoCapitalize={f.autoCapitalize} spellCheck={f.spellCheck} inputMode={f.inputMode} />
            </div>
          ))}
        </div>

        {/* Email */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-sm font-medium text-slate-700">Email Principale</Label>
              <Input value={profile.email || ""} onChange={e => handleChange("email", e.target.value)} className="mt-1" placeholder="email@esempio.it" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">PEC</Label>
              <Input value={profile.pec || ""} onChange={e => handleChange("pec", e.target.value)} className="mt-1" placeholder="pec@esempio.it" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium text-slate-700">Email Aggiuntive</Label>
              <Button size="sm" variant="outline" onClick={addExtraEmail} className="gap-1"><Plus className="w-3 h-3" /> Aggiungi email</Button>
            </div>
            {(!profile.emails_extra || profile.emails_extra.length === 0) ? (
              <p className="text-sm text-slate-400 italic">Nessuna email aggiuntiva.</p>
            ) : (
              <div className="space-y-2">
                {profile.emails_extra.map((email, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input value={email} onChange={e => updateExtraEmail(idx, e.target.value)} placeholder="email@esempio.it" />
                    <button onClick={() => removeExtraEmail(idx)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Email accounts for sending */}
        <EmailAccountsSettings profile={profile} />

        {/* Notification settings */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-700">Impostazioni Notifiche Scadenze</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <Label className="text-sm font-medium text-slate-700">Giorni di preavviso</Label>
              <Input type="number" value={profile.giorni_preavviso_scadenza ?? 30} onChange={e => handleChange("giorni_preavviso_scadenza", parseInt(e.target.value) || 30)} className="mt-1" />
              <p className="text-xs text-slate-400 mt-1">Quanti giorni prima della scadenza avvisare</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Ripeti promemoria</Label>
              <div className="flex items-center gap-2 mt-2">
                <Switch checked={profile.ripeti_promemoria || false} onCheckedChange={v => handleChange("ripeti_promemoria", v)} />
                <span className="text-sm text-slate-600">{profile.ripeti_promemoria ? "Sì" : "No"}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Più avvisi ripetuti fino alla scadenza</p>
            </div>
            {profile.ripeti_promemoria && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Numero di promemoria</Label>
                <Input type="number" value={profile.numero_promemoria_ripetuti ?? 1} onChange={e => handleChange("numero_promemoria_ripetuti", parseInt(e.target.value) || 1)} className="mt-1" />
                <p className="text-xs text-slate-400 mt-1">Quanti avvisi ripetuti ricevere</p>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Switch checked={profile.logo_su_ogni_pagina ?? true} onCheckedChange={v => handleChange("logo_su_ogni_pagina", v)} />
            <Label className="text-sm text-slate-700">Mostra logo su ogni pagina dei documenti PDF</Label>
          </div>
        </div>

        {/* Logo settings */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Impostazioni Logo nei Documenti</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <Label className="text-sm font-medium text-slate-700">Posizione logo</Label>
              <Select value={profile.logo_posizione || "alto_sinistra"} onValueChange={v => handleChange("logo_posizione", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alto_sinistra">Alto a sinistra</SelectItem>
                  <SelectItem value="alto_centro">Alto al centro</SelectItem>
                  <SelectItem value="alto_destra">Alto a destra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Larghezza logo (mm)</Label>
              <Input type="number" value={profile.logo_larghezza ?? 35} onChange={e => handleChange("logo_larghezza", parseInt(e.target.value) || 35)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Altezza logo (mm)</Label>
              <Input type="number" value={profile.logo_altezza ?? 18} onChange={e => handleChange("logo_altezza", parseInt(e.target.value) || 18)} className="mt-1" />
            </div>
          </div>
        </div>

        {/* Numerazione preventivi */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-700">Numerazione Preventivi</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-3">
              <Label className="text-sm font-medium text-slate-700">Formato numerazione</Label>
              <Select value={profile.numerazione_tipo || "progressiva_anno"} onValueChange={v => handleChange("numerazione_tipo", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {numerazioneOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">{numerazioneOptions.find(o => o.value === (profile.numerazione_tipo || "progressiva_anno"))?.description}</p>
            </div>
            {(profile.numerazione_tipo === "prefisso") && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Prefisso</Label>
                <Input value={profile.numerazione_prefisso || "PREV"} onChange={e => handleChange("numerazione_prefisso", e.target.value)} className="mt-1" placeholder="es. PREV, OFF" />
              </div>
            )}
            {(profile.numerazione_tipo === "codice") && (
              <div>
                <Label className="text-sm font-medium text-slate-700">Numero di partenza</Label>
                <Input type="number" value={profile.numerazione_partenza ?? 1} onChange={e => handleChange("numerazione_partenza", parseInt(e.target.value) || 1)} className="mt-1" />
                <p className="text-xs text-slate-400 mt-1">I nuovi preventivi inizieranno da questo numero. Dall'esterno non si capirà quanti ne sono stati emessi.</p>
              </div>
            )}
          </div>
        </div>

        {/* Color palette */}
        <ColorSettings profile={profile} onChange={handleChange} />

        {/* Default quote template */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <LayoutTemplate className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-700">Modello Preventivo Predefinito</h3>
          </div>
          <p className="text-xs text-slate-400 mb-3">Scegli il modello con cui iniziano i nuovi preventivi. Puoi sempre cambiarlo durante la creazione.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {QUOTE_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => handleChange("template_predefinito", t.id)}
                className={`flex flex-col items-start text-left p-3 rounded-lg border transition-colors ${
                  (profile.template_predefinito || "classica") === t.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="text-sm font-medium text-slate-900">{t.nome}</span>
                <span className="text-xs text-slate-500 mt-0.5">{t.descrizione}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Images */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {imageFields.map(f => (
            <div key={f.key}>
              <Label className="text-sm font-medium text-slate-700 mb-2 block">{f.label}</Label>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center">
                {profile[f.key] ? (
                  <div className="relative">
                    <img src={profile[f.key]} alt={f.label} className="max-h-24 mx-auto object-contain" />
                    <button onClick={() => handleChange(f.key, "")} className="absolute top-0 right-0 p-1 bg-red-100 rounded-full text-red-600 hover:bg-red-200">
                      <X className="w-3 h-3" />
                    </button>
                    {f.key === "firma_url" && (
                      <button onClick={() => setSigDrawOpen(true)} className="absolute top-0 left-0 p-1 bg-blue-100 rounded-full text-blue-600 hover:bg-blue-200" title="Disegna firma">
                        <PenLine className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2 py-2">
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-sm text-slate-500">Carica {f.label.toLowerCase()}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(f.key, e)} />
                    {f.key === "firma_url" && (
                      <button type="button" onClick={(e) => { e.preventDefault(); setSigDrawOpen(true); }} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                        <PenLine className="w-3 h-3" /> o disegna a mano libera
                      </button>
                    )}
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>

        <DrawSignatureDialog
          open={sigDrawOpen}
          onOpenChange={setSigDrawOpen}
          currentSignature={profile.firma_url}
          onSaved={(url) => {
            handleChange("firma_url", url);
            setLogoPrompt({ type: "firma", url });
            toast({ title: "Firma salvata", description: "Disponibile per documenti e timbri" });
          }}
        />
      </div>

      {/* Account Email per invio */}
      <EmailAccountsSettings profile={profile} />

      {/* Backup & Export */}
      <BackupExport />

      {/* Logo/Firma auto-use prompt */}
      {logoPrompt && (
        <div className="fixed bottom-4 right-4 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-4 max-w-sm">
          <div className="flex gap-3">
            <img src={logoPrompt.url} alt="" className="w-12 h-12 object-contain rounded-lg border border-slate-100" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{logoPrompt.type === "logo" ? "Logo caricato!" : "Firma caricata!"}</p>
              <p className="text-xs text-slate-500 mt-0.5">Vuoi aggiungerlo automaticamente a tutti i documenti (preventivi, contratti)?</p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-7 text-xs" onClick={() => { handleSave(); setLogoPrompt(null); toast({ title: `${logoPrompt.type === "logo" ? "Logo" : "Firma"} sarà usato in tutti i documenti` }); }}>Sì, aggiungi</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLogoPrompt(null)}>No, grazie</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}