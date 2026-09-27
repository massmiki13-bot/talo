import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, Pencil, FileText, Briefcase, Receipt, CreditCard,
  Inbox, FolderOpen, Phone, Mail, MapPin, Building2, User, StickyNote, ChevronRight
} from "lucide-react";

const QUOTE_STATO = {
  in_attesa: { label: "In attesa", className: "bg-slate-100 text-slate-700" },
  inviato: { label: "Inviato", className: "bg-blue-100 text-blue-700" },
  approvato: { label: "Approvato", className: "bg-emerald-100 text-emerald-700" },
  rifiutato: { label: "Rifiutato", className: "bg-red-100 text-red-700" },
  scaduto: { label: "Scaduto", className: "bg-amber-100 text-amber-700" },
};
const WORKSITE_STATO = {
  da_iniziare: { label: "Da iniziare", className: "bg-slate-100 text-slate-700" },
  in_corso: { label: "In corso", className: "bg-blue-100 text-blue-700" },
  finito: { label: "Finito", className: "bg-emerald-100 text-emerald-700" },
};
const DOC_TYPES = {
  certificazione: "Certificazione", assicurazione: "Assicurazione",
  durc: "DURC", visura: "Visura", altro: "Altro",
};
const PAYMENT_TIPO = { acconto: "Acconto", saldo: "Saldo" };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("it-IT") : "—";
const fmtEur = (n) => (n != null ? `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : "—");

function sortByDate(arr, key = "data") {
  return [...arr].sort((a, b) => {
    const da = a[key] || a.created_date || "";
    const db = b[key] || b.created_date || "";
    return db.localeCompare(da);
  });
}

function SectionCard({ icon: Icon, title, count, children, emptyMsg }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
        <Icon className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {count > 0 && <Badge variant="secondary" className="ml-auto">{count}</Badge>}
      </div>
      {count === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400 text-center">{emptyMsg}</p>
      ) : (
        <div className="divide-y divide-slate-50">{children}</div>
      )}
    </div>
  );
}

function ItemRow({ to, onClick, title, subtitle, right, rightSub, badge }) {
  const content = (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {badge}
        {right && <span className="text-sm font-medium text-slate-700">{right}</span>}
        {rightSub && <span className="text-xs text-slate-400">{rightSub}</span>}
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </div>
  );
  if (to) return <Link to={to} className="block">{content}</Link>;
  return <div onClick={onClick} className="block">{content}</div>;
}

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState([]);
  const [receivedQuotes, setReceivedQuotes] = useState([]);
  const [worksites, setWorksites] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [documents, setDocuments] = useState([]);

  useEffect(() => { loadAll(); }, [id]);

  const loadAll = async () => {
    try {
      const c = await db.Contact.get(id);
      if (!c) { toast({ title: "Contatto non trovato", variant: "destructive" }); navigate("/contatti"); return; }
      setContact(c);
      const contactName = c.nome || c.nome_privato || "";
      const [q, rq, ws, inv, pay, docs] = await Promise.all([
        db.Quote.filter({ cliente_id: id }, "-data"),
        db.ReceivedQuote.filter({ fornitore: contactName }, "-data").catch(() => []),
        db.Worksite.filter({ cliente_id: id }, "-created_date"),
        db.Invoice.filter({ cliente_id: id }, "-data").catch(() => []),
        db.WorksitePayment.filter({ cliente_id: id }, "-data").catch(() => []),
        db.CompanyDocument.filter({ contatto_id: id }, "-created_date"),
      ]);
      setQuotes(q);
      setReceivedQuotes(rq);
      setWorksites(ws);
      setInvoices(inv);
      setPayments(pay);
      setDocuments(docs);
    } catch (e) {
      console.error(e);
      toast({ title: "Errore caricamento", variant: "destructive" });
    } finally { setLoading(false); }
  };

  if (loading) return <LoadingSpinner />;
  if (!contact) return null;

  const displayName = contact.nome || contact.nome_privato || "Contatto";
  const isFornitore = contact.tipo === "fornitore";

  const totalQuotes = quotes.reduce((s, q) => s + (q.totale || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.importo || 0), 0);

  const infoRows = [
    { icon: Building2, label: "Ragione Sociale", value: contact.nome },
    { icon: User, label: "Nome", value: contact.nome_privato },
    { icon: MapPin, label: "Indirizzo", value: [contact.indirizzo, [contact.cap, contact.citta, contact.provincia].filter(Boolean).join(" ")].filter(Boolean).join(", ") },
    { icon: Phone, label: "Telefono", value: contact.telefono },
    { icon: Mail, label: "Email", value: contact.email },
    { icon: Mail, label: "PEC", value: contact.pec },
    { icon: FileText, label: "P.IVA", value: contact.partita_iva },
    { icon: FileText, label: "Codice Fiscale", value: contact.codice_fiscale },
  ].filter(r => r.value);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/contatti")} className="flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 truncate">{displayName}</h1>
            <Badge className={isFornitore ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}>
              {isFornitore ? "Fornitore" : "Cliente"}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/contatti")} className="gap-1.5 flex-shrink-0">
          <Pencil className="w-3.5 h-3.5" /> Modifica
        </Button>
      </div>

      {/* Riepilogo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Preventivi</p>
          <p className="text-lg font-bold text-slate-900">{quotes.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Valore preventivi</p>
          <p className="text-lg font-bold text-slate-900">{fmtEur(totalQuotes)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Cantieri</p>
          <p className="text-lg font-bold text-slate-900">{worksites.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Totale incassato</p>
          <p className="text-lg font-bold text-emerald-600">{fmtEur(totalPaid)}</p>
        </div>
      </div>

      {/* Anagrafica */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Anagrafica</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {infoRows.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <r.icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-slate-400">{r.label}</p>
                <p className="text-sm text-slate-700 break-words">{r.value}</p>
              </div>
            </div>
          ))}
          {infoRows.length === 0 && <p className="text-sm text-slate-400">Nessun dato anagrafico</p>}
        </div>
        {contact.note && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-2">
            <StickyNote className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Note</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{contact.note}</p>
            </div>
          </div>
        )}
      </div>

      {/* Preventivi emessi */}
      <SectionCard icon={FileText} title="Preventivi emessi" count={quotes.length} emptyMsg="Nessun preventivo emesso per questo cliente">
        {sortByDate(quotes).map(q => {
          const st = QUOTE_STATO[q.stato] || {};
          return (
            <ItemRow key={q.id} to={`/preventivi/${q.id}`}
              title={q.numero ? `${q.numero}` : "Preventivo"}
              subtitle={q.oggetto || "Senza oggetto"}
              right={fmtEur(q.totale)}
              rightSub={fmtDate(q.data)}
              badge={st.label && <Badge className={st.className}>{st.label}</Badge>}
            />
          );
        })}
      </SectionCard>

      {/* Preventivi ricevuti (solo fornitori) */}
      {isFornitore && (
        <SectionCard icon={Inbox} title="Preventivi ricevuti" count={receivedQuotes.length} emptyMsg="Nessun preventivo ricevuto da questo fornitore">
          {sortByDate(receivedQuotes).map(rq => (
            <ItemRow key={rq.id} to="/preventivi"
              title={rq.descrizione || "Preventivo ricevuto"}
              subtitle={rq.worksite_nome || ""}
              right={fmtEur(rq.importo)}
              rightSub={fmtDate(rq.data)}
              badge={<Badge className="bg-slate-100 text-slate-600">{rq.stato || "ricevuto"}</Badge>}
            />
          ))}
        </SectionCard>
      )}

      {/* Lavori/Cantieri */}
      <SectionCard icon={Briefcase} title="Lavori / Cantieri" count={worksites.length} emptyMsg="Nessun cantiere associato a questo cliente">
        {sortByDate(worksites, "created_date").map(w => {
          const st = WORKSITE_STATO[w.stato] || {};
          return (
            <ItemRow key={w.id} to={`/lavori/${w.id}`}
              title={w.nome}
              subtitle={w.indirizzo || ""}
              right={fmtEur(w.importo_totale)}
              rightSub={w.stato_pagamento === "saldato" ? "Saldato" : w.stato_pagamento === "parziale" ? "Pagamento parziale" : "Non pagato"}
              badge={st.label && <Badge className={st.className}>{st.label}</Badge>}
            />
          );
        })}
      </SectionCard>

      {/* Fatture */}
      <SectionCard icon={Receipt} title="Fatture" count={invoices.length} emptyMsg="Nessuna fattura per questo cliente">
        {sortByDate(invoices).map(inv => (
          <ItemRow key={inv.id} to="/preventivi"
            title={inv.numero ? `${inv.numero}/${inv.anno || ""}` : "Fattura"}
            subtitle={inv.oggetto || ""}
            right={fmtEur(inv.totale)}
            rightSub={fmtDate(inv.data)}
            badge={<Badge className="bg-slate-100 text-slate-600">{inv.stato}</Badge>}
          />
        ))}
      </SectionCard>

      {/* Pagamenti */}
      <SectionCard icon={CreditCard} title="Pagamenti ricevuti" count={payments.length} emptyMsg="Nessun pagamento registrato per questo cliente">
        {sortByDate(payments).map(p => (
          <ItemRow key={p.id} to={p.worksite_id ? `/lavori/${p.worksite_id}` : null}
            title={p.worksite_nome || "Pagamento"}
            subtitle={PAYMENT_TIPO[p.tipo] || p.tipo || ""}
            right={fmtEur(p.importo)}
            rightSub={fmtDate(p.data)}
            badge={p.metodo && <Badge className="bg-slate-100 text-slate-600">{p.metodo}</Badge>}
          />
        ))}
      </SectionCard>

      {/* Documenti */}
      <SectionCard icon={FolderOpen} title="Documenti collegati" count={documents.length} emptyMsg="Nessun documento collegato a questo cliente">
        {documents.map(d => (
          <ItemRow key={d.id} to={`/documenti-ditta?doc=${d.id}`}
            title={d.titolo}
            subtitle={DOC_TYPES[d.tipo] || d.tipo || ""}
            rightSub={d.data_scadenza ? `Scad: ${fmtDate(d.data_scadenza)}` : fmtDate(d.data_emissione)}
          />
        ))}
      </SectionCard>
    </div>
  );
}