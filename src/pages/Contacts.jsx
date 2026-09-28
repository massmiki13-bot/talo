import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { Users, Search, Plus, Upload, Download, MoreHorizontal, Phone, Mail, Archive, ArchiveRestore, Pencil, Trash2, X, ChevronRight, MessageCircle } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import ContactForm from "@/components/contacts/ContactForm";
import ContactImportDialog from "@/components/contacts/ContactImportDialog";
import { displayName, isCliente, isFornitore, TIPO_LABEL, fmtEur, phoneHref, whatsappHref } from "@/lib/contacts";
import { downloadCsv } from "@/lib/csv";

const TABS = [
  { key: "cliente", label: "Clienti", test: isCliente },
  { key: "fornitore", label: "Fornitori", test: isFornitore },
  { key: "tutti", label: "Tutti", test: () => true },
];

const SORTS = {
  nome: { label: "Nome A→Z", fn: (a, b) => displayName(a).localeCompare(displayName(b), "it") },
  recenti: { label: "Aggiunti di recente", fn: (a, b) => String(b.created_date).localeCompare(String(a.created_date)) },
  valore: { label: "Valore preventivi", fn: (a, b) => (b._stats?.valore || 0) - (a._stats?.valore || 0) },
  citta: { label: "Città", fn: (a, b) => String(a.citta || "~").localeCompare(String(b.citta || "~"), "it") },
};

const haystack = (c) => [
  c.nome, c.nome_privato, c.partita_iva, c.codice_fiscale, c.email, c.pec, c.telefono, c.cellulare, c.citta, c.categoria_fornitore,
  ...(c.categorie || []), ...(c.referenti || []).flatMap((r) => [r.nome, r.email, r.telefono]),
].filter(Boolean).join(" ").toLowerCase();

export default function Contacts() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("tipo")) || TABS[0];
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("nome");
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(null); // { contact } oppure {} per nuovo
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    try {
      const [cs, quotes] = await Promise.all([db.Contact.list("nome", 5000), db.Quote.fields(["cliente_id", "stato", "totale", "imponibile", "data"], { sort: "-data", limit: 10000 }).catch(() => [])]);
      const stats = new Map();
      for (const q of quotes) {
        if (!q.cliente_id) continue;
        const s = stats.get(q.cliente_id) || { n: 0, valore: 0, aperti: 0 };
        s.n += 1;
        s.valore += Number(q.totale) || 0;
        if (["in_attesa", "inviato", "visto", "bozza"].includes(q.stato)) s.aperti += Number(q.totale) || 0;
        stats.set(q.cliente_id, s);
      }
      setContacts(cs.map((c) => ({ ...c, _stats: stats.get(c.id) })));
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => [...new Set(contacts.filter(tab.test).flatMap((c) => c.categorie || []))].sort(), [contacts, tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => tab.test(c))
      .filter((c) => (showArchived ? c.archiviato : !c.archiviato))
      .filter((c) => !category || (c.categorie || []).includes(category))
      .filter((c) => !q || haystack(c).includes(q))
      .sort(SORTS[sort].fn);
  }, [contacts, tab, search, category, sort, showArchived]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, contacts.filter((c) => t.test(c) && !c.archiviato).length])), [contacts]);

  const setArchived = async (c, value) => {
    await db.Contact.update(c.id, { archiviato: value });
    toast({ title: value ? "Contatto archiviato" : "Contatto ripristinato" });
    load();
  };

  const remove = async (c) => {
    if ((c._stats?.n || 0) > 0) {
      toast({ title: "Contatto con preventivi collegati", description: "Archivialo invece di eliminarlo, così lo storico resta intatto.", variant: "destructive" });
      return;
    }
    if (!confirm(`Eliminare definitivamente ${displayName(c)}?`)) return;
    await db.Contact.delete(c.id);
    load();
  };

  const exportCsv = () => {
    downloadCsv(`${tab.label.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Tipo", "Ragione sociale", "Nome", "Partita IVA", "Codice fiscale", "Indirizzo", "CAP", "Città", "Provincia", "Telefono", "Cellulare", "Email", "PEC", "Codice SDI", "IBAN", "Categorie", "Pagamento", "Note"],
      filtered.map((c) => [TIPO_LABEL[c.tipo] || "Cliente", c.nome, c.nome_privato, c.partita_iva, c.codice_fiscale, c.indirizzo, c.cap, c.citta, c.provincia, c.telefono, c.cellulare, c.email, c.pec, c.codice_sdi, c.iban, (c.categorie || []).join(", "), c.pagamento_default, c.note]));
  };

  const rowActions = (c) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} aria-label="Altre azioni" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><MoreHorizontal className="w-4 h-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => setForm({ contact: c })}><Pencil className="w-4 h-4 mr-2" /> Modifica</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/preventivi/nuovo?cliente=${c.id}`)}><Plus className="w-4 h-4 mr-2" /> Nuovo preventivo</DropdownMenuItem>
        {c.archiviato
          ? <DropdownMenuItem onClick={() => setArchived(c, false)}><ArchiveRestore className="w-4 h-4 mr-2" /> Ripristina</DropdownMenuItem>
          : <DropdownMenuItem onClick={() => setArchived(c, true)}><Archive className="w-4 h-4 mr-2" /> Archivia</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => remove(c)} className="text-red-600 focus:text-red-700"><Trash2 className="w-4 h-4 mr-2" /> Elimina</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const quickLinks = (c) => {
    const phone = c.cellulare || c.telefono;
    return (
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {phone && <a href={phoneHref(phone)} aria-label={`Chiama ${displayName(c)}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Phone className="w-4 h-4" /></a>}
        {c.cellulare && <a href={whatsappHref(c.cellulare)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><MessageCircle className="w-4 h-4" /></a>}
        {c.email && <a href={`mailto:${c.email}`} aria-label={`Email a ${displayName(c)}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Mail className="w-4 h-4" /></a>}
      </div>
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="font-display text-[28px] sm:text-[34px] leading-none font-bold uppercase tracking-[0.02em] text-zinc-950 border-l-[6px] border-brand-600 pl-3">Clienti e fornitori</h1>
          <p className="text-slate-500 mt-1 text-sm">Anagrafiche, referenti, condizioni commerciali e storico</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4" /> Importa</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={!filtered.length}><Download className="w-4 h-4" /> Esporta</Button>
          <Button size="sm" className="gap-1.5 bg-brand-600 hover:bg-brand-700" onClick={() => setForm({})}><Plus className="w-4 h-4" /> Nuovo</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setParams(t.key === "cliente" ? {} : { tipo: t.key }); setCategory(""); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${t.key === tab.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t.label} <span className="text-xs text-slate-400 ml-0.5">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Cerca per nome, P.IVA, email, telefono, città, referente…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" aria-label="Cerca contatti" />
          {search && <button onClick={() => setSearch("")} aria-label="Cancella ricerca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"><X className="w-3.5 h-3.5 text-slate-500" /></button>}
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="sm:w-52 h-10"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORTS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {(categories.length > 0 || contacts.some((c) => c.archiviato)) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(category === c ? "" : c)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${category === c ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {c}
            </button>
          ))}
          {contacts.some((c) => c.archiviato) && (
            <button onClick={() => setShowArchived(!showArchived)} className={`ml-auto flex items-center gap-1 text-xs rounded-full px-2.5 py-1 ${showArchived ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
              <Archive className="w-3.5 h-3.5" /> {showArchived ? "Stai vedendo gli archiviati" : "Archiviati"}
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        search || category || showArchived
          ? <EmptyState icon={Search} title="Nessun risultato" description="Prova a cambiare ricerca o filtri." />
          : <EmptyState icon={Users} title={`Nessun ${tab.key === "fornitore" ? "fornitore" : "cliente"}`} description="Aggiungilo a mano o importa la tua rubrica da Excel." actionLabel="+ Nuovo" onAction={() => setForm({})} />
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Località</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Contatti</th>
                  <th className="px-4 py-3 text-right">Preventivi</th>
                  <th className="px-2 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/contatti/${c.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{displayName(c)}</span>
                        {tab.key === "tutti" && <span className="text-[10px] uppercase tracking-wide text-slate-500">{TIPO_LABEL[c.tipo] || "Cliente"}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {c.partita_iva && <span className="text-xs text-slate-500">P.IVA {c.partita_iva}</span>}
                        {(c.categorie || []).slice(0, 3).map((cat) => <span key={cat} className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5">{cat}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{[c.citta, c.provincia && `(${c.provincia})`].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 hidden lg:table-cell">
                      <p className="truncate max-w-[220px]">{c.email || c.pec || "—"}</p>
                      <p className="text-xs text-slate-500">{c.cellulare || c.telefono}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c._stats ? (
                        <>
                          <p className="text-sm font-medium text-slate-800 tabular-nums">{fmtEur(c._stats.valore)}</p>
                          <p className="text-xs text-slate-500">{c._stats.n} {c._stats.n === 1 ? "preventivo" : "preventivi"}{c._stats.aperti ? ` · ${fmtEur(c._stats.aperti)} aperti` : ""}</p>
                        </>
                      ) : <span className="text-sm text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-3"><div className="flex items-center justify-end">{quickLinks(c)}{rowActions(c)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {filtered.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3.5 cursor-pointer active:bg-slate-50" onClick={() => navigate(`/contatti/${c.id}`)}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{displayName(c)}</p>
                    <p className="text-xs text-slate-500 truncate">{[c.citta, c.partita_iva && `P.IVA ${c.partita_iva}`].filter(Boolean).join(" · ") || TIPO_LABEL[c.tipo]}</p>
                    {c._stats && <p className="text-xs text-slate-600 mt-0.5">{c._stats.n} prev. · {fmtEur(c._stats.valore)}</p>}
                  </div>
                  {rowActions(c)}
                  <ChevronRight className="w-4 h-4 text-slate-300 mt-1" />
                </div>
                <div className="mt-1.5 -ml-1.5">{quickLinks(c)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">{filtered.length} {filtered.length === 1 ? "contatto" : "contatti"}</p>
        </>
      )}

      <ContactForm
        open={!!form}
        onOpenChange={(v) => { if (!v) setForm(null); }}
        contact={form?.contact || null}
        defaultTipo={tab.key === "fornitore" ? "fornitore" : "cliente"}
        onSaved={(saved) => { load(); if (!form?.contact && saved?.id) navigate(`/contatti/${saved.id}`); }}
      />
      <ContactImportDialog open={importOpen} onOpenChange={setImportOpen} existing={contacts} onDone={load} />
    </div>
  );
}
