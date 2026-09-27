import React, { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Mail, Plus, Trash2, Star, CheckCircle2, AlertCircle, Shield, HelpCircle, Settings2, Send, RefreshCw } from "lucide-react";

// Server di invio (SMTP) e di ricezione (IMAP) dei provider più diffusi.
const SMTP_PRESETS = [
  { value: "aruba", label: "Aruba", host: "smtps.aruba.it", port: 465, imap: "imaps.aruba.it" },
  { value: "gmail", label: "Gmail (password per app)", host: "smtp.gmail.com", port: 587, imap: "imap.gmail.com" },
  { value: "outlook", label: "Outlook / Office 365", host: "smtp.office365.com", port: 587, imap: "outlook.office365.com" },
  { value: "hotmail", label: "Hotmail / Outlook.com", host: "smtp-mail.outlook.com", port: 587, imap: "outlook.office365.com" },
  { value: "libero", label: "Libero", host: "smtp.libero.it", port: 465, imap: "imapmail.libero.it" },
  { value: "virgilio", label: "Virgilio", host: "out.virgilio.it", port: 465, imap: "in.virgilio.it" },
  { value: "tiscali", label: "Tiscali", host: "smtp.tiscali.it", port: 465, imap: "imap.tiscali.it" },
  { value: "fastweb", label: "Fastweb", host: "smtp.fastwebnet.it", port: 587, imap: "imap.fastwebnet.it" },
  { value: "register", label: "Register.it", host: "authsmtp.register.it", port: 465, imap: "imap.register.it" },
  { value: "aruba_pec", label: "PEC Aruba", host: "smtps.pec.aruba.it", port: 465, imap: "imaps.pec.aruba.it", pec: true },
  { value: "legalmail", label: "PEC Legalmail (InfoCert)", host: "sendm.cert.legalmail.it", port: 465, imap: "mbox.cert.legalmail.it", pec: true },
  { value: "register_pec", label: "PEC Register.it", host: "smtps.pec.register.it", port: 465, imap: "imaps.pec.register.it", pec: true },
  { value: "pec_generic", label: "PEC (altro provider)", host: "", port: 465, imap: "", pec: true },
  { value: "custom", label: "Personalizzato", host: "", port: 587, imap: "" },
];

// La firma si scrive come testo semplice e si salva come HTML con i caratteri protetti.
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function signatureTextToHtml(text) {
  return String(text || "").trim().replace(/[&<>"]/g, (c) => ENTITIES[c]).replace(/\r?\n/g, "<br/>");
}
function signatureHtmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export default function EmailAccountsSettings({ profile }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    email_address: "",
    display_name: "",
    provider: "smtp",
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    is_default: false,
    is_pec: false,
    imap_host: "",
    imap_port: 993,
    ricezione_attiva: true,
    firma_html: "",
  });
  const [preset, setPreset] = useState("aruba");
  const [verifyStatus, setVerifyStatus] = useState({}); // { [accountId]: { connected, status, message, loading } }
  const { toast } = useToast();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const accs = await db.EmailAccount.list("-created_date");
      setAccounts(accs);
      // Verifica automaticamente lo stato di ogni account
      accs.forEach(a => verifyAccount(a.id));
    } catch (e) { console.error(e); }
    finally {
      setLoading(false);
      // Arrivando da "Posta → Caselle" portiamo in vista questa sezione.
      if (window.location.hash === "#caselle-email") {
        setTimeout(() => document.getElementById("caselle-email")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    }
  };

  const verifyAccount = async (accountId) => {
    setVerifyStatus(prev => ({ ...prev, [accountId]: { loading: true } }));
    try {
      const res = await api.functions.invoke('verifyEmailConnection', { account_id: accountId });
      setVerifyStatus(prev => ({ ...prev, [accountId]: { ...res.data, loading: false } }));
    } catch (e) {
      setVerifyStatus(prev => ({ ...prev, [accountId]: { connected: false, status: 'error', message: 'Errore verifica', loading: false } }));
    }
  };

  const openNew = () => {
    setEditingId(null);
    setForm({
      email_address: "",
      display_name: profile?.ragione_sociale || "",
      provider: "smtp",
      smtp_host: SMTP_PRESETS[0].host,
      smtp_port: SMTP_PRESETS[0].port,
      smtp_username: "",
      smtp_password: "",
      is_default: accounts.length === 0,
      is_pec: false,
      imap_host: SMTP_PRESETS[0].imap,
      imap_port: 993,
      ricezione_attiva: true,
      firma_html: "",
    });
    setPreset("aruba");
    setDialogOpen(true);
  };

  const openEdit = (account) => {
    setEditingId(account.id);
    setForm({
      email_address: account.email_address || "",
      display_name: account.display_name || "",
      provider: account.provider || "smtp",
      smtp_host: account.smtp_host || "",
      smtp_port: account.smtp_port || 587,
      smtp_username: account.smtp_username || "",
      smtp_password: account.smtp_password || "",
      is_default: account.is_default || false,
      is_pec: account.is_pec || false,
      imap_host: account.imap_host || "",
      imap_port: account.imap_port || 993,
      ricezione_attiva: account.ricezione_attiva !== false,
      firma_html: signatureHtmlToText(account.firma_html),
    });
    setPreset(SMTP_PRESETS.find(p => p.host && p.host === account.smtp_host)?.value || "custom");
    setDialogOpen(true);
  };

  const handlePresetChange = (val) => {
    setPreset(val);
    const p = SMTP_PRESETS.find(s => s.value === val);
    if (p && val !== "custom") {
      setForm(prev => ({ ...prev, smtp_host: p.host, smtp_port: p.port, imap_host: p.imap, imap_port: 993, is_pec: !!p.pec }));
    } else if (p) {
      setForm(prev => ({ ...prev, is_pec: !!p.pec }));
    }
  };

  const handleProviderChange = (val) => {
    setForm(prev => ({ ...prev, provider: val }));
  };

  const handleSave = async () => {
    if (!form.email_address.trim()) {
      toast({ title: "Inserisci un indirizzo email", variant: "destructive" });
      return;
    }
    if (form.provider === "smtp" && !form.smtp_host.trim()) {
      toast({ title: "Inserisci il server SMTP", variant: "destructive" });
      return;
    }
    try {
      const data = { ...form };
      // La firma si scrive come testo semplice: la convertiamo in HTML sicuro.
      data.firma_html = signatureTextToHtml(data.firma_html);
      if (editingId) {
        await db.EmailAccount.update(editingId, data);
        toast({ title: "Account aggiornato", className: "bg-green-600 text-white" });
      } else {
        await db.EmailAccount.create(data);
        toast({ title: "Account collegato", className: "bg-green-600 text-white" });
      }

      // Se is_default, rimuovi il default dagli altri
      if (data.is_default) {
        const others = accounts.filter(a => a.id !== editingId && a.is_default);
        for (const a of others) {
          await db.EmailAccount.update(a.id, { is_default: false });
        }
      }

      setDialogOpen(false);
      load();
    } catch (e) {
      toast({ title: "Errore salvataggio", variant: "destructive" });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Rimuovere questo account email?")) return;
    await db.EmailAccount.delete(id);
    load();
    toast({ title: "Account rimosso", className: "bg-green-600 text-white" });
  };

  const setDefault = async (id) => {
    for (const a of accounts) {
      await db.EmailAccount.update(a.id, { is_default: a.id === id });
    }
    load();
    toast({ title: "Account predefinito impostato", className: "bg-green-600 text-white" });
  };

  const isConnected = (a) => {
    const st = verifyStatus[a.id];
    if (st) return st.connected;
    // Fallback prima della verifica
    if (a.provider === 'gmail_oauth') return false; // vecchio collegamento Base44: va ricollegato via SMTP
    if (a.provider === 'smtp') return !!(a.smtp_host && a.smtp_password);
    return false;
  };

  const providerLabel = (a) => {
    if (a.provider === 'gmail_oauth') return 'Gmail · da ricollegare via SMTP';
    if (a.provider === 'smtp') return `${a.imap_host && a.ricezione_attiva !== false ? 'Invio e ricezione' : 'Solo invio'} · ${a.smtp_host || '—'}`;
    return 'Sconosciuto';
  };

  const providerIcon = (a) => {
    if (a.provider === 'gmail_oauth') return <Shield className="w-4 h-4 text-green-600" />;
    return <Mail className="w-4 h-4 text-slate-500" />;
  };

  const statusBadge = (a) => {
    const st = verifyStatus[a.id];
    if (!st || st.loading) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
          <RefreshCw className="w-3 h-3 animate-spin" /> Verifica…
        </span>
      );
    }
    if (st.connected) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <Send className="w-3 h-3" /> {st.message || "Pronta per l'invio"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        {st.status === 'incomplete' ? 'Da configurare' : 'Non collegata'}
      </span>
    );
  };

  return (
    <div id="caselle-email" className="mt-6 bg-white rounded-xl border border-slate-200 p-5 sm:p-6 scroll-mt-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Caselle email e PEC</h3>
            <p className="text-xs text-slate-500">Invia e ricevi dalla sezione Posta con i tuoi indirizzi</p>
          </div>
        </div>
      </div>
      <Button size="sm" onClick={openNew} className="gap-1.5 w-full sm:w-auto mt-4 bg-blue-600 hover:bg-blue-700">
        <Plus className="w-4 h-4" /> Collega nuova email
      </Button>

      {/* Empty state */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl mt-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">Nessuna email collegata</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Collega la tua casella per inviare documenti direttamente dal tuo indirizzo (amministrazione, preventivi, direzione…)</p>
        </div>
      ) : (
        <>
          {/* Lista account */}
          <div className="space-y-2.5 mt-4">
            {accounts.map(a => {
              const connected = isConnected(a);
              return (
                <div key={a.id} className={`rounded-xl border p-3.5 transition-colors ${a.is_default ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-start gap-3">
                    {/* Icona provider */}
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      {providerIcon(a)}
                    </div>
                    {/* Info principali */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900 truncate">{a.email_address}</p>
                        {a.is_pec && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded px-1.5 py-0.5 flex-shrink-0">PEC</span>
                        )}
                        {a.is_default && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                            <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Predefinito
                          </span>
                        )}
                      </div>
                      {a.display_name && (
                        <p className="text-xs text-slate-500 mt-0.5">{a.display_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {/* Stato collegamento */}
                        {statusBadge(a)}
                        {/* Provider */}
                        <span className="text-[11px] text-slate-500">{providerLabel(a)}</span>
                      </div>
                    </div>
                  </div>
                  {/* Azioni */}
                  <div className="flex items-center gap-1 mt-2.5 pt-2.5 border-t border-slate-100">
                    {!a.is_default && (
                      <button onClick={() => setDefault(a.id)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-600 px-2 py-1.5 rounded-lg hover:bg-amber-50 transition-colors">
                        <Star className="w-3.5 h-3.5" /> Imposta predefinita
                      </button>
                    )}
                    <button onClick={() => verifyAccount(a.id)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-green-600 px-2 py-1.5 rounded-lg hover:bg-green-50 transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" /> Verifica
                    </button>
                    <button onClick={() => openEdit(a)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                      <Settings2 className="w-3.5 h-3.5" /> Modifica
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors ml-auto">
                      <Trash2 className="w-3.5 h-3.5" /> Elimina
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Guida rapida */}
      <details className="mt-4 group">
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 select-none">
          <HelpCircle className="w-4 h-4" /> Come collegare la mia email?
        </summary>
        <div className="mt-3 bg-slate-50 rounded-xl p-4 space-y-3">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
            <div>
              <p className="text-sm font-medium text-slate-700">Scegli il tipo di collegamento</p>
              <p className="text-xs text-slate-500 mt-0.5">Scegli il preset del tuo provider (<strong>Gmail</strong>, <strong>Aruba</strong>, <strong>Outlook</strong>, <strong>PEC</strong>…): server e porta si compilano da soli. Serve solo una <strong>password per app</strong>.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</div>
            <div>
              <p className="text-sm font-medium text-slate-700">Inserisci i dati della casella</p>
              <p className="text-xs text-slate-500 mt-0.5">Indirizzo email, nome mittente (es. "Amministrazione") e — per SMTP — server e password per app.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</div>
            <div>
              <p className="text-sm font-medium text-slate-700">Verifica lo stato</p>
              <p className="text-xs text-slate-500 mt-0.5">Dopo il salvataggio, l'app verifica automaticamente il permesso di invio. Il badge verde "Pronta per l'invio" conferma che tutto funziona.</p>
            </div>
          </div>
          <div className="flex gap-2.5 items-start bg-amber-50 border border-amber-100 rounded-lg p-2.5 mt-2">
            <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Per SMTP (Aruba, Outlook, PEC…) usa una <strong>password per app</strong> dedicata, mai la password principale.
              Su Gmail: Impostazioni → Sicurezza → Verifica in 2 passaggi → Password per app.
              Su Aruba: usa la password della casella o creane una dedicata dal pannello di controllo.
              Su Outlook: Account Microsoft → Sicurezza → Password per app.
            </p>
          </div>
        </div>
      </details>

      {/* Dialog per aggiungere/modificare account */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifica Account" : "Collega Account Email"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Tipo connessione */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Tipo di collegamento</Label>
              <Select value={form.provider} onValueChange={handleProviderChange}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="smtp">SMTP con password per app (Gmail, Aruba, Outlook, PEC, Libero, ecc.)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.provider === "gmail_oauth" && (
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 flex gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-green-700 space-y-1">
                  <p className="font-semibold">Permesso di invio attivo ✓</p>
                  <p>L'app è autorizzata a inviare email dal tuo indirizzo Gmail tramite OAuth sicuro (nessuna password richiesta). Inserisci qui sotto il tuo indirizzo Gmail.</p>
                </div>
              </div>
            )}

            {form.provider === "smtp" && (
              <>
                <div>
                  <Label className="text-sm font-medium text-slate-700">Provider / Preset</Label>
                  <Select value={preset} onValueChange={handlePresetChange}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SMTP_PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Server SMTP</Label>
                    <Input value={form.smtp_host} onChange={e => setForm(prev => ({ ...prev, smtp_host: e.target.value }))} className="mt-1" placeholder="smtp.aruba.it" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-700">Porta</Label>
                    <Input type="number" value={form.smtp_port} onChange={e => setForm(prev => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))} className="mt-1" />
                  </div>
                </div>
              </>
            )}

            <div>
              <Label className="text-sm font-medium text-slate-700">Indirizzo Email</Label>
              <Input value={form.email_address} onChange={e => setForm(prev => ({ ...prev, email_address: e.target.value }))} className="mt-1" placeholder="email@esempio.it" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Nome Mittente</Label>
              <Input value={form.display_name} onChange={e => setForm(prev => ({ ...prev, display_name: e.target.value }))} className="mt-1" placeholder="Mario Rossi S.r.l." />
              <p className="text-xs text-slate-400 mt-1">Il nome che appare come mittente nelle email</p>
            </div>

            {form.provider === "smtp" && (
              <>
                <div>
                  <Label className="text-sm font-medium text-slate-700">Username SMTP</Label>
                  <Input value={form.smtp_username} onChange={e => setForm(prev => ({ ...prev, smtp_username: e.target.value }))} className="mt-1" placeholder="Di solito uguale all'email" />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700">Password per App</Label>
                  <Input type="password" value={form.smtp_password} onChange={e => setForm(prev => ({ ...prev, smtp_password: e.target.value }))} className="mt-1" placeholder="Password per app dedicata" />
                  <div className="flex gap-1.5 mt-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-500">
                      Usa una <strong>password per app</strong>, non la password principale.
                      Gmail: attiva la verifica in 2 passaggi → crea password per app.
                      Aruba: usa la password della casella o una dedicata dalle impostazioni.
                    </p>
                  </div>
                </div>
              </>
            )}

            {form.provider === "smtp" && (
              <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" checked={form.ricezione_attiva}
                    onChange={e => setForm(prev => ({ ...prev, ricezione_attiva: e.target.checked }))} />
                  <span className="text-sm text-slate-700">Mostra anche la posta in arrivo nella sezione Posta</span>
                </label>
                {form.ricezione_attiva && (
                  <div className="grid grid-cols-[1fr_90px] gap-3">
                    <div>
                      <Label className="text-sm font-medium text-slate-700">Server IMAP</Label>
                      <Input value={form.imap_host} onChange={e => setForm(prev => ({ ...prev, imap_host: e.target.value }))} className="mt-1" placeholder="imaps.aruba.it" />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700">Porta</Label>
                      <Input type="number" value={form.imap_port} onChange={e => setForm(prev => ({ ...prev, imap_port: parseInt(e.target.value) || 993 }))} className="mt-1" />
                    </div>
                  </div>
                )}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 mt-0.5" checked={form.is_pec}
                    onChange={e => setForm(prev => ({ ...prev, is_pec: e.target.checked }))} />
                  <span className="text-sm text-slate-700">
                    È una casella <strong>PEC</strong>
                    <span className="block text-xs text-slate-500">I messaggi inviati da qui vengono segnati come PEC e le ricevute di consegna compaiono nella Posta.</span>
                  </span>
                </label>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-slate-700">Firma personalizzata (facoltativa)</Label>
              <textarea
                value={form.firma_html}
                onChange={e => setForm(prev => ({ ...prev, firma_html: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-md border border-input p-2 text-sm"
                placeholder={"Es. Ufficio Amministrazione\nTel. 0471 000000"}
              />
              <p className="text-xs text-slate-400 mt-1">Se vuota si usa la firma automatica con logo e dati della ditta.</p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={e => setForm(prev => ({ ...prev, is_default: e.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-700">Usa come mittente predefinito</span>
            </label>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
              {editingId ? "Salva" : "Collega"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}