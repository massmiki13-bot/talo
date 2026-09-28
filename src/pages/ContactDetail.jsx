import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import {
  ArrowLeft, Pencil, FileText, Briefcase, Phone, Mail, MapPin, MessageCircle, Plus, Navigation,
  Inbox, FolderOpen, User, Users, StickyNote, ChevronRight, CreditCard, Receipt, ShieldCheck, Upload, Loader2, AlertTriangle, Globe,
} from "lucide-react";
import ContactForm from "@/components/contacts/ContactForm";
import LinkedEmails from "@/components/email/LinkedEmails";
import ComposeDialog from "@/components/email/ComposeDialog";
import { createDocumentReminder, getExpirationStatus } from "@/utils/expirationReminders";
import {
  displayName, isCliente, isFornitore, TIPO_LABEL, SOGGETTO_LABEL, fullAddress, mapsUrl, phoneHref, whatsappHref, fmtEur, fmtDate,
} from "@/lib/contacts";

const QUOTE_STATO = {
  bozza: { label: "Bozza", className: "bg-slate-100 text-slate-700" },
  in_attesa: { label: "In attesa", className: "bg-amber-100 text-amber-800" },
  inviato: { label: "Inviato", className: "bg-zinc-200 text-zinc-800" },
  visto: { label: "Visto", className: "bg-indigo-100 text-indigo-800" },
  approvato: { label: "Accettato", className: "bg-emerald-100 text-emerald-800" },
  rifiutato: { label: "Rifiutato", className: "bg-red-100 text-red-700" },
  scaduto: { label: "Scaduto", className: "bg-slate-200 text-slate-700" },
};
const WORKSITE_STATO = {
  da_iniziare: { label: "Da iniziare", className: "bg-slate-100 text-slate-700" },
  in_corso: { label: "In corso", className: "bg-zinc-200 text-zinc-800" },
  finito: { label: "Finito", className: "bg-emerald-100 text-emerald-800" },
};
const DOC_TYPES = { durc: "DURC", visura: "Visura camerale", certificazione: "Certificazione", assicurazione: "Assicurazione", altro: "Altro" };

const Badge = ({ className, children }) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;

function Card({ icon: Icon, title, action, children, className = "" }) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <Icon className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-800 flex-1">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Row({ to, title, subtitle, right, rightSub, badge }) {
  return (
    <Link to={to} className="flex items-center gap-3 py-2.5 px-1 -mx-1 rounded hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>
      <div className="text-right shrink-0">
        {badge}
        {right && <p className="text-sm font-medium text-slate-800 tabular-nums">{right}</p>}
        {rightSub && <p className="text-xs text-slate-500">{rightSub}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </Link>
  );
}

const Empty = ({ children }) => <p className="text-sm text-slate-500 py-2">{children}</p>;

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ quotes: [], received: [], worksites: [], payments: [], documents: [] });
  const [editOpen, setEditOpen] = useState(false);
  const [compose, setCompose] = useState(null);
  const [docOpen, setDocOpen] = useState(false);
  const [tab, setTab] = useState("panoramica");

  const loadAll = async () => {
    try {
      const c = await db.Contact.get(id);
      setContact(c);
      const name = displayName(c);
      const [quotes, received, worksites, payments, documents] = await Promise.all([
        db.Quote.filter({ cliente_id: id }, "-data"),
        db.ReceivedQuote.filter({ fornitore: name }, "-data").catch(() => []),
        db.Worksite.filter({ cliente_id: id }, "-created_date"),
        db.WorksitePayment.filter({ cliente_id: id }, "-data").catch(() => []),
        db.CompanyDocument.filter({ contatto_id: id }, "-created_date").catch(() => []),
      ]);
      setData({ quotes, received, worksites, payments, documents });
    } catch {
      toast({ title: "Contatto non trovato", variant: "destructive" });
      navigate("/contatti");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [id]);

  const stats = useMemo(() => {
    const { quotes, worksites, payments } = data;
    const preventivato = quotes.reduce((s, q) => s + (Number(q.totale) || 0), 0);
    const accettato = quotes.filter((q) => q.stato === "approvato").reduce((s, q) => s + (Number(q.totale) || 0), 0);
    const lavori = worksites.reduce((s, w) => s + (Number(w.importo_totale) || 0), 0);
    const incassato = payments.reduce((s, p) => s + (Number(p.importo) || 0), 0);
    const base = Math.max(accettato, lavori);
    const decisi = quotes.filter((q) => ["approvato", "rifiutato"].includes(q.stato));
    return {
      preventivato, accettato, incassato,
      daIncassare: Math.max(0, base - incassato),
      conversione: decisi.length ? Math.round((decisi.filter((q) => q.stato === "approvato").length / decisi.length) * 100) : null,
    };
  }, [data]);

  const timeline = useMemo(() => {
    const items = [
      ...data.quotes.map((q) => ({ date: q.data || q.created_date, icon: FileText, to: `/preventivi/${q.id}`, title: `Preventivo ${q.numero || ""}`, sub: q.oggetto, right: fmtEur(q.totale), badge: QUOTE_STATO[q.stato] })),
      ...data.worksites.map((w) => ({ date: w.created_date, icon: Briefcase, to: `/lavori/${w.id}`, title: `Lavoro: ${w.nome}`, sub: w.indirizzo, right: w.importo_totale ? fmtEur(w.importo_totale) : "", badge: WORKSITE_STATO[w.stato] })),
      ...data.payments.map((p) => ({ date: p.data || p.created_date, icon: CreditCard, to: p.worksite_id ? `/lavori/${p.worksite_id}` : "#", title: `Pagamento ${p.tipo === "saldo" ? "saldo" : "acconto"}`, sub: p.worksite_nome, right: fmtEur(p.importo) })),
      ...data.received.map((r) => ({ date: r.data || r.created_date, icon: Inbox, to: "/preventivi?tab=ricevuti", title: "Preventivo ricevuto", sub: r.descrizione, right: r.importo ? fmtEur(r.importo) : "" })),
      ...data.documents.map((d) => ({ date: d.created_date, icon: FolderOpen, to: `/documenti-ditta?doc=${d.id}`, title: d.titolo, sub: DOC_TYPES[d.tipo] || "Documento", right: d.data_scadenza ? `scad. ${fmtDate(d.data_scadenza)}` : "" })),
    ];
    return items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [data]);

  if (loading) return <LoadingSpinner />;
  if (!contact) return null;

  const name = displayName(contact);
  const cliente = isCliente(contact);
  const fornitore = isFornitore(contact);
  const phone = contact.cellulare || contact.telefono;
  const hasAddress = contact.indirizzo || contact.citta;
  const expiringDocs = data.documents.filter((d) => getExpirationStatus(d.data_scadenza));

  const emailTo = contact.email || contact.pec || contact.referenti?.find((r) => r.email)?.email || "";

  const info = [
    { icon: User, label: SOGGETTO_LABEL[contact.tipo_soggetto] === "Privato" ? "Nome" : "Titolare / referente", value: contact.nome ? contact.nome_privato : null },
    { icon: MapPin, label: "Indirizzo", value: hasAddress ? fullAddress(contact) : null, href: hasAddress ? mapsUrl(contact) : null },
    { icon: Phone, label: "Telefono", value: contact.telefono, href: contact.telefono && phoneHref(contact.telefono) },
    { icon: Phone, label: "Cellulare", value: contact.cellulare, href: contact.cellulare && phoneHref(contact.cellulare) },
    { icon: Mail, label: "Email", value: contact.email, href: contact.email && `mailto:${contact.email}` },
    { icon: ShieldCheck, label: "PEC", value: contact.pec },
    { icon: FileText, label: "Partita IVA", value: contact.partita_iva },
    { icon: FileText, label: "Codice fiscale", value: contact.codice_fiscale },
    { icon: Receipt, label: "Codice SDI", value: contact.codice_sdi },
    { icon: CreditCard, label: "IBAN", value: contact.iban },
    { icon: Globe, label: "Sito web", value: contact.sito_web, href: contact.sito_web && (/^https?:/.test(contact.sito_web) ? contact.sito_web : `https://${contact.sito_web}`) },
  ].filter((r) => r.value);

  const conditions = [
    ["Pagamento", contact.pagamento_default],
    ["Termini", contact.termini_pagamento_giorni ? `${contact.termini_pagamento_giorni} giorni` : null],
    ["Sconto abituale", contact.sconto_default ? `${contact.sconto_default}%` : null],
    ["IVA abituale", contact.iva_default !== null && contact.iva_default !== undefined && contact.iva_default !== "" ? `${contact.iva_default}%` : null],
  ].filter(([, v]) => v);

  const TABS = [
    ["panoramica", "Panoramica"],
    ["attivita", `Attività (${timeline.length})`],
    ...(cliente ? [["preventivi", `Preventivi (${data.quotes.length})`], ["lavori", `Lavori (${data.worksites.length})`]] : []),
    ["documenti", `Documenti (${data.documents.length})`],
    ["email", "Email"],
  ];

  return (
    <div className="space-y-4">
      {/* Intestazione */}
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Indietro" className="shrink-0 -ml-2"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-[30px] leading-tight font-bold text-zinc-950 break-words">{name}</h1>
            <Badge className={fornitore && !cliente ? "bg-amber-100 text-amber-800" : "bg-zinc-200 text-zinc-800"}>{TIPO_LABEL[contact.tipo] || "Cliente"}</Badge>
            {contact.archiviato && <Badge className="bg-slate-200 text-slate-700">Archiviato</Badge>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {SOGGETTO_LABEL[contact.tipo_soggetto] && <span className="text-xs text-slate-500 mr-1">{SOGGETTO_LABEL[contact.tipo_soggetto]}</span>}
            {(contact.categorie || []).map((c) => <span key={c} className="text-[11px] rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">{c}</span>)}
            {contact.categoria_fornitore && <span className="text-[11px] rounded-full bg-amber-50 text-amber-800 px-2 py-0.5">{contact.categoria_fornitore}</span>}
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4" /> Modifica</Button>
      </div>

      {/* Azioni rapide */}
      <div className="flex flex-wrap gap-2">
        {phone && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={phoneHref(phone)}><Phone className="w-4 h-4" /> Chiama</a></Button>}
        {contact.cellulare && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={whatsappHref(contact.cellulare)} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" /> WhatsApp</a></Button>}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCompose({ defaultTo: emailTo, templateVars: { cliente: name }, links: { contact_id: id } })}><Mail className="w-4 h-4" /> Scrivi email</Button>
        {hasAddress && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={mapsUrl(contact)} target="_blank" rel="noopener noreferrer"><Navigation className="w-4 h-4" /> Indicazioni</a></Button>}
        {cliente && <Button size="sm" className="gap-1.5 bg-brand-600 hover:bg-brand-700" onClick={() => navigate(`/preventivi/nuovo?cliente=${id}`)}><Plus className="w-4 h-4" /> Nuovo preventivo</Button>}
      </div>

      {fornitore && expiringDocs.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{expiringDocs.map((d) => `${DOC_TYPES[d.tipo] || d.titolo} ${getExpirationStatus(d.data_scadenza) === "expired" ? "scaduto" : "in scadenza"} (${fmtDate(d.data_scadenza)})`).join(" · ")}</span>
        </div>
      )}

      {/* Riepilogo economico */}
      {cliente && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["Preventivato", fmtEur(stats.preventivato), `${data.quotes.length} preventivi`, "text-slate-900"],
            ["Accettato", fmtEur(stats.accettato), stats.conversione !== null ? `${stats.conversione}% di conversione` : "—", "text-emerald-700"],
            ["Incassato", fmtEur(stats.incassato), `${data.payments.length} pagamenti`, "text-slate-900"],
            ["Da incassare", fmtEur(stats.daIncassare), `${data.worksites.length} lavori`, stats.daIncassare > 0 ? "text-red-700" : "text-slate-900"],
          ].map(([label, value, sub, color]) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
              <p className="text-xs text-slate-500">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Schede */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-3.5 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
        ))}
      </div>

      {tab === "panoramica" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card icon={FileText} title="Anagrafica">
            {info.length ? (
              <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
                {info.map((r) => (
                  <div key={r.label} className="flex gap-2 min-w-0">
                    <r.icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <dt className="text-xs text-slate-500">{r.label}</dt>
                      <dd className="text-sm text-slate-800 break-words">{r.href ? <a href={r.href} target={r.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="text-brand-700 hover:underline">{r.value}</a> : r.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            ) : <Empty>Nessun dato anagrafico. <button className="text-brand-700 underline" onClick={() => setEditOpen(true)}>Completa la scheda</button></Empty>}
          </Card>

          <div className="space-y-4">
            <Card icon={Users} title="Referenti">
              {contact.referenti?.length ? (
                <ul className="divide-y divide-slate-100">
                  {contact.referenti.map((r, i) => (
                    <li key={i} className="py-2 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{r.nome || "—"} {r.ruolo && <span className="text-xs font-normal text-slate-500">· {r.ruolo}</span>}</p>
                        <p className="text-xs text-slate-500 truncate">{[r.telefono, r.email].filter(Boolean).join(" · ")}</p>
                      </div>
                      {r.telefono && <a href={phoneHref(r.telefono)} aria-label={`Chiama ${r.nome}`} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Phone className="w-4 h-4" /></a>}
                      {r.email && <button onClick={() => setCompose({ defaultTo: r.email, templateVars: { cliente: name }, links: { contact_id: id } })} aria-label={`Email a ${r.nome}`} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Mail className="w-4 h-4" /></button>}
                    </li>
                  ))}
                </ul>
              ) : <Empty>Nessun referente.</Empty>}
            </Card>

            <Card icon={CreditCard} title="Condizioni commerciali">
              {conditions.length ? (
                <dl className="grid grid-cols-2 gap-3">
                  {conditions.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-sm text-slate-800">{v}</dd></div>)}
                </dl>
              ) : <Empty>Nessuna condizione impostata: i preventivi useranno quelle standard.</Empty>}
            </Card>

            {contact.indirizzi?.length > 0 && (
              <Card icon={MapPin} title="Sedi e cantieri">
                <ul className="divide-y divide-slate-100">
                  {contact.indirizzi.map((a, i) => (
                    <li key={i} className="py-2 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{a.etichetta || "Indirizzo"}</p>
                        <p className="text-xs text-slate-500">{fullAddress(a)}</p>
                      </div>
                      <a href={mapsUrl(a)} target="_blank" rel="noopener noreferrer" aria-label="Apri in Google Maps" className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Navigation className="w-4 h-4" /></a>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {contact.note && (
              <Card icon={StickyNote} title="Note"><p className="text-sm text-slate-700 whitespace-pre-wrap">{contact.note}</p></Card>
            )}
          </div>
        </div>
      )}

      {tab === "attivita" && (
        <Card icon={FileText} title="Cronologia">
          {timeline.length ? (
            <ol className="relative border-l border-slate-200 ml-2">
              {timeline.map((t, i) => (
                <li key={i} className="ml-4 py-2">
                  <span className="absolute -left-[9px] mt-1.5 w-4 h-4 rounded-full bg-white border border-slate-300 flex items-center justify-center"><t.icon className="w-2.5 h-2.5 text-slate-500" /></span>
                  <Link to={t.to} className="flex items-start gap-3 rounded hover:bg-slate-50 px-1 -mx-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{t.title} {t.badge && <Badge className={`${t.badge.className} ml-1`}>{t.badge.label}</Badge>}</p>
                      <p className="text-xs text-slate-500 truncate">{[fmtDate(t.date), t.sub].filter(Boolean).join(" · ")}</p>
                    </div>
                    {t.right && <span className="text-sm text-slate-700 tabular-nums shrink-0">{t.right}</span>}
                  </Link>
                </li>
              ))}
            </ol>
          ) : <Empty>Ancora nessuna attività con questo contatto.</Empty>}
        </Card>
      )}

      {tab === "preventivi" && (
        <Card icon={FileText} title="Preventivi" action={<Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(`/preventivi/nuovo?cliente=${id}`)}><Plus className="w-4 h-4" /> Nuovo</Button>}>
          {data.quotes.length ? data.quotes.map((q) => (
            <Row key={q.id} to={`/preventivi/${q.id}`} title={`${q.numero || "Preventivo"} · ${q.oggetto || "senza oggetto"}`} subtitle={fmtDate(q.data)}
              right={fmtEur(q.totale)} badge={QUOTE_STATO[q.stato] && <Badge className={QUOTE_STATO[q.stato].className}>{QUOTE_STATO[q.stato].label}</Badge>} />
          )) : <Empty>Nessun preventivo.</Empty>}
        </Card>
      )}

      {tab === "lavori" && (
        <Card icon={Briefcase} title="Lavori">
          {data.worksites.length ? data.worksites.map((w) => (
            <Row key={w.id} to={`/lavori/${w.id}`} title={w.nome} subtitle={w.indirizzo} right={w.importo_totale ? fmtEur(w.importo_totale) : null}
              badge={WORKSITE_STATO[w.stato] && <Badge className={WORKSITE_STATO[w.stato].className}>{WORKSITE_STATO[w.stato].label}</Badge>} />
          )) : <Empty>Nessun lavoro collegato.</Empty>}
        </Card>
      )}

      {tab === "documenti" && (
        <Card icon={FolderOpen} title="Documenti" action={<Button size="sm" variant="outline" className="gap-1" onClick={() => setDocOpen(true)}><Upload className="w-4 h-4" /> Aggiungi</Button>}>
          {fornitore && <p className="text-xs text-slate-500 mb-2">DURC, visura e assicurazioni del fornitore: con la data di scadenza ricevi il promemoria per tempo.</p>}
          {data.documents.length ? data.documents.map((d) => {
            const st = getExpirationStatus(d.data_scadenza);
            return (
              <Row key={d.id} to={`/documenti-ditta?doc=${d.id}`} title={d.titolo} subtitle={DOC_TYPES[d.tipo] || "Documento"}
                rightSub={d.data_scadenza ? `Scade il ${fmtDate(d.data_scadenza)}` : null}
                badge={st && <Badge className={st === "expired" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}>{st === "expired" ? "Scaduto" : "In scadenza"}</Badge>} />
            );
          }) : <Empty>Nessun documento.</Empty>}
          {data.received.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Preventivi ricevuti</p>
              {data.received.map((r) => <Row key={r.id} to="/preventivi?tab=ricevuti" title={r.descrizione || "Preventivo ricevuto"} subtitle={fmtDate(r.data)} right={r.importo ? fmtEur(r.importo) : null} />)}
            </div>
          )}
        </Card>
      )}

      {tab === "email" && (
        <LinkedEmails field="contact_id" id={id} composeDefaults={{ defaultTo: emailTo, templateVars: { cliente: name } }} />
      )}

      <ContactForm open={editOpen} onOpenChange={setEditOpen} contact={contact} onSaved={loadAll} />
      <ComposeDialog open={!!compose} onOpenChange={(v) => { if (!v) setCompose(null); }} {...(compose || {})} />
      <SupplierDocDialog open={docOpen} onOpenChange={setDocOpen} contact={contact} onSaved={loadAll} />
    </div>
  );
}

function SupplierDocDialog({ open, onOpenChange, contact, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ tipo: "durc", titolo: "", data_emissione: "", data_scadenza: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setForm({ tipo: "durc", titolo: "", data_emissione: "", data_scadenza: "" }); setFile(null); }
  }, [open]);

  const save = async () => {
    if (!file) return toast({ title: "Scegli il file", variant: "destructive" });
    setSaving(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file, private: true });
      const titolo = form.titolo.trim() || `${DOC_TYPES[form.tipo]} – ${displayName(contact)}`;
      const created = await db.CompanyDocument.create({
        tipo: form.tipo, titolo, file_url,
        data_emissione: form.data_emissione || null,
        data_scadenza: form.data_scadenza || null,
        contatto_id: contact.id, contatto_nome: displayName(contact),
      });
      if (form.data_scadenza) {
        const [profile] = await db.CompanyProfile.list();
        await createDocumentReminder(titolo, form.data_scadenza, created.id, "CompanyDocument", DOC_TYPES[form.tipo], displayName(contact), profile?.giorni_preavviso_scadenza ?? 30);
      }
      toast({ title: "Documento salvato", description: form.data_scadenza ? "Promemoria di scadenza creato." : undefined });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo documento</DialogTitle>
          <DialogDescription>Collegato a {contact && displayName(contact)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="contactdetail-tipo">Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
              <SelectTrigger id="contactdetail-tipo" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(DOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="contactdetail-titolo-facoltativo">Titolo (facoltativo)</Label><Input id="contactdetail-titolo-facoltativo" className="mt-1" value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} placeholder={`${DOC_TYPES[form.tipo]} – ${contact ? displayName(contact) : ""}`} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="contactdetail-emesso-il">Emesso il</Label><Input id="contactdetail-emesso-il" type="date" className="mt-1" value={form.data_emissione} onChange={(e) => setForm({ ...form, data_emissione: e.target.value })} /></div>
            <div><Label htmlFor="contactdetail-scade-il">Scade il</Label><Input id="contactdetail-scade-il" type="date" className="mt-1" value={form.data_scadenza} onChange={(e) => setForm({ ...form, data_scadenza: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="contactdetail-file">File</Label><Input id="contactdetail-file" type="file" className="mt-1" onChange={(e) => setFile(e.target.files[0] || null)} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Salva</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
