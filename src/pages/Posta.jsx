import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { confirmDialog } from "@/components/shared/ConfirmHost";
import { useSearchParams, Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  PenSquare, Inbox, Send, ShieldCheck, FileEdit, Mails, AlertCircle, Search, RefreshCw, Loader2,
  Paperclip, FileText, Settings, X,
} from "lucide-react";
import ComposeDialog from "@/components/email/ComposeDialog";
import TemplatesDialog from "@/components/email/TemplatesDialog";
import MessageView, { formatDate } from "@/components/email/MessageView";
import { escapeHtml, PEC_LABELS } from "@/lib/email";

const PAGE = 60;

const FOLDERS = [
  { key: "tutti", label: "Tutta la posta", icon: Mails, filter: { stato: { $ne: "bozza" } } },
  { key: "arrivo", label: "In arrivo", icon: Inbox, filter: { direzione: "in" } },
  { key: "inviati", label: "Inviati", icon: Send, filter: { direzione: "out", stato: "inviata" } },
  { key: "pec", label: "PEC", icon: ShieldCheck, filter: { is_pec: true, stato: { $ne: "bozza" } } },
  { key: "bozze", label: "Bozze", icon: FileEdit, filter: { stato: "bozza" } },
  { key: "errori", label: "Non inviati", icon: AlertCircle, filter: { stato: "errore" } },
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function quoteHtml(m) {
  return `<p><br></p><p>Il ${escapeHtml(formatDate(m.data, true))}, ${escapeHtml(m.from_name || m.from_email)} ha scritto:</p><blockquote>${m.html || escapeHtml(m.text || "")}</blockquote>`;
}

export default function Posta() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const folder = FOLDERS.find((f) => f.key === params.get("cartella")) || FOLDERS[0];
  const [accounts, setAccounts] = useState([]);
  const [accountFilter, setAccountFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [selected, setSelected] = useState(null);
  const [lookups, setLookups] = useState({ contacts: new Map(), worksites: new Map(), quotes: new Map() });
  const [compose, setCompose] = useState(null); // props per ComposeDialog
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const syncedOnce = useRef(false);

  // Ricerca con un piccolo ritardo mentre si digita.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filter = useMemo(() => ({
    ...folder.filter,
    ...(accountFilter !== "all" ? { account_id: accountFilter } : {}),
    ...(query ? { search_text: { $regex: escapeRegex(query) } } : {}),
  }), [folder, accountFilter, query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await db.EmailMessage.filter(filter, "-data", PAGE);
      setMessages(rows);
      setHasMore(rows.length === PAGE);
      const unreadRows = await db.EmailMessage.filter({ direzione: "in", letto: false }, "-data", 500);
      setUnread(unreadRows.length);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const rows = await db.EmailMessage.filter(filter, "-data", PAGE, messages.length);
      setMessages((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([
      db.EmailAccount.list("-created_date"),
      db.Contact.list("nome", 2000).catch(() => []),
      db.Worksite.list("-created_date", 1000).catch(() => []),
      db.Quote.fields(["numero", "anno", "data", "cliente_id", "cliente_nome", "oggetto", "stato", "totale"], { sort: "-created_date", limit: 1000 }).catch(() => []),
    ]).then(([accs, contacts, worksites, quotes]) => {
      setAccounts(accs.filter((a) => a.active !== false));
      setLookups({
        contacts: new Map(contacts.map((c) => [c.id, c])),
        worksites: new Map(worksites.map((w) => [w.id, w])),
        quotes: new Map(quotes.map((q) => [q.id, q])),
      });
    });
    const unsub = db.EmailMessage.subscribe(() => load());
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const receiving = accounts.filter((a) => a.imap_host && a.ricezione_attiva !== false);

  const sync = useCallback(async (silent = false) => {
    if (!receiving.length) return;
    setSyncing(true);
    try {
      const res = await api.functions.invoke("mail-sync", {});
      if (res.data?.error) throw new Error(res.data.error);
      const errors = (res.data?.results || []).filter((r) => r.error);
      if (errors.length && !silent) {
        toast({ title: `Problema con ${errors[0].email}`, description: errors[0].error, variant: "destructive" });
      } else if (!silent) {
        toast({ title: res.data.added ? `${res.data.added} nuovi messaggi` : "Nessun nuovo messaggio" });
      }
      if (res.data?.added) load();
    } catch (e) {
      if (!silent) toast({ title: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [receiving.length, load, toast]);

  // Alla prima apertura scarica la posta nuova in automatico.
  useEffect(() => {
    if (!syncedOnce.current && receiving.length) {
      syncedOnce.current = true;
      sync(true);
    }
  }, [receiving.length, sync]);

  const open = async (m) => {
    if (m.stato === "bozza") {
      setCompose({ draft: m });
      return;
    }
    setSelected(m);
    if (m.direzione === "in" && !m.letto) {
      await db.EmailMessage.update(m.id, { letto: true }).catch(() => {});
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, letto: true } : x)));
      setUnread((n) => Math.max(0, n - 1));
    }
  };

  const reply = (m, all = false) => {
    const counterpart = m.direzione === "in" ? [m.from_email] : m.to || [];
    const mine = accounts.map((a) => a.email_address.toLowerCase());
    const cc = all ? [...(m.to || []), ...(m.cc || [])].filter((a) => !mine.includes(a) && !counterpart.includes(a)) : [];
    setCompose({
      defaultTo: counterpart,
      defaultCc: cc,
      defaultSubject: /^re:/i.test(m.subject || "") ? m.subject : `Re: ${m.subject || ""}`,
      defaultBody: quoteHtml(m),
      accountId: m.account_id,
      links: { contact_id: m.contact_id, worksite_id: m.worksite_id, quote_id: m.quote_id },
    });
  };

  const forward = (m) => setCompose({
    defaultSubject: /^(fwd?|i):/i.test(m.subject || "") ? m.subject : `I: ${m.subject || ""}`,
    defaultBody: `<p><br></p><p>---------- Messaggio inoltrato ----------</p><p>Da: ${escapeHtml(m.from_name || "")} ‹${escapeHtml(m.from_email)}›<br>Data: ${escapeHtml(formatDate(m.data, true))}<br>Oggetto: ${escapeHtml(m.subject || "")}<br>A: ${escapeHtml((m.to || []).join(", "))}</p>${m.html || escapeHtml(m.text || "")}`,
    attachments: (m.allegati || []).filter((a) => a.url),
    accountId: m.account_id,
  });

  const remove = async (m) => {
    if (!(await confirmDialog("Eliminare il messaggio da Talo? Nella casella di posta originale resta dov'è."))) return;
    await db.EmailMessage.delete(m.id);
    setSelected(null);
    load();
  };

  const selectFolder = (key) => {
    setSelected(null);
    setParams(key === "tutti" ? {} : { cartella: key });
  };

  const counterpartOf = (m) => (m.direzione === "in"
    ? m.from_name || m.from_email
    : `A: ${(m.to || []).join(", ") || "—"}`);

  const selectedLinks = selected ? {
    contact: selected.contact_id && lookups.contacts.get(selected.contact_id) && { id: selected.contact_id, nome: lookups.contacts.get(selected.contact_id).nome || lookups.contacts.get(selected.contact_id).nome_privato },
    worksite: selected.worksite_id && lookups.worksites.get(selected.worksite_id),
    quote: selected.quote_id && lookups.quotes.get(selected.quote_id),
  } : {};

  const lastSync = receiving.map((a) => a.ultima_sincronizzazione).filter(Boolean).sort().pop();

  return (
    <div className="-mx-4 sm:mx-0">
      {/* Intestazione */}
      <div className="px-4 sm:px-0 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="font-display text-[28px] sm:text-[34px] leading-none font-bold uppercase tracking-[0.02em] text-zinc-950 border-l-[6px] border-brand-600 pl-3">Posta</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Email e PEC della ditta in un unico posto
            {lastSync && <> · aggiornata {formatDate(lastSync)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTemplatesOpen(true)}><FileText className="w-4 h-4" /> Modelli</Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild><Link to="/profilo-ditta#caselle-email"><Settings className="w-4 h-4" /> Caselle</Link></Button>
          {receiving.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => sync(false)} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Aggiornamento…" : "Aggiorna"}
            </Button>
          )}
          <Button size="sm" className="gap-1.5 bg-brand-600 hover:bg-brand-700" onClick={() => setCompose({})}><PenSquare className="w-4 h-4" /> Scrivi</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,360px)_1fr] xl:grid-cols-[190px_minmax(0,360px)_1fr] gap-0 lg:gap-4 min-h-[70vh]">
        {/* Cartelle */}
        <nav className={`${selected ? "hidden lg:block" : ""} px-4 sm:px-0 mb-3 xl:mb-0 lg:col-span-2 xl:col-span-1`} aria-label="Cartelle">
          <ul className="flex xl:flex-col gap-1 overflow-x-auto pb-1 xl:pb-0">
            {FOLDERS.map((f) => {
              const active = f.key === folder.key;
              return (
                <li key={f.key} className="shrink-0">
                  <button
                    onClick={() => selectFolder(f.key)}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-brand-50 text-brand-800 font-semibold" : "text-slate-600 hover:bg-slate-100"}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <f.icon className="w-4 h-4" />
                    <span>{f.label}</span>
                    {f.key === "arrivo" && unread > 0 && <span className="ml-auto text-xs rounded-full bg-brand-600 text-white px-1.5 min-w-5 text-center">{unread}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {accounts.length > 1 && (
            <div className="hidden xl:block mt-4">
              <p className="text-xs font-medium text-slate-500 px-1 mb-1">Casella</p>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger aria-label="Filtra per casella" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le caselle</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.is_pec ? "PEC · " : ""}{a.email_address}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {accounts.length > 0 && receiving.length === 0 && (
            <p className="hidden xl:block mt-4 text-xs text-slate-500 px-1">Per vedere anche la posta in arrivo, aggiungi il server IMAP nelle impostazioni della casella.</p>
          )}
        </nav>

        {/* Elenco */}
        <section className={`${selected ? "hidden lg:flex" : "flex"} flex-col bg-white sm:rounded-xl border-y sm:border border-slate-200 min-h-[60vh]`}>
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca per nome, email, oggetto…" className="pl-9 pr-8" aria-label="Cerca nella posta" />
              {search && <button onClick={() => setSearch("")} aria-label="Cancella ricerca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100"><X className="w-3.5 h-3.5 text-slate-500" /></button>}
            </div>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-6">
              <folder.icon className="w-10 h-10 text-slate-300 mb-3" />
              <p className="font-medium text-slate-700">{query ? "Nessun risultato" : "Nessun messaggio"}</p>
              <p className="text-sm text-slate-500 mt-1">
                {query ? `Nessun messaggio contiene "${search}".`
                  : accounts.length === 0 ? "Collega una casella email o PEC per iniziare."
                  : folder.key === "arrivo" && !receiving.length ? "Attiva la ricezione (IMAP) nelle impostazioni della casella."
                  : "Qui compariranno i messaggi."}
              </p>
              {accounts.length === 0 && <Button asChild size="sm" className="mt-4"><Link to="/profilo-ditta#caselle-email">Collega una casella</Link></Button>}
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {messages.map((m) => {
                const unreadRow = m.direzione === "in" && !m.letto;
                const active = selected?.id === m.id;
                return (
                  <li key={m.id}>
                    <button onClick={() => open(m)} className={`w-full text-left px-4 py-3 transition-colors ${active ? "bg-brand-50" : "hover:bg-slate-50"}`}>
                      <div className="flex items-center gap-2">
                        {unreadRow && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" aria-label="Non letto" />}
                        <p className={`text-sm truncate flex-1 ${unreadRow ? "font-bold text-slate-900" : "text-slate-700"}`}>
                          {m.stato === "bozza" ? <span className="text-red-700 font-medium">Bozza · </span> : null}
                          {counterpartOf(m)}
                        </p>
                        <span className="text-xs text-slate-500 shrink-0">{formatDate(m.data)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {m.is_pec && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded px-1 py-px shrink-0">{m.pec_tipo && m.pec_tipo !== "posta-certificata" ? PEC_LABELS[m.pec_tipo] || "PEC" : "PEC"}</span>}
                        {m.stato === "errore" && <span className="text-[10px] font-bold bg-red-100 text-red-700 rounded px-1 py-px shrink-0">NON INVIATA</span>}
                        <p className={`text-sm truncate ${unreadRow ? "font-semibold text-slate-900" : "text-slate-800"}`}>{m.subject || "(senza oggetto)"}</p>
                        {(m.allegati || []).length > 0 && <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-label="Con allegati" />}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{m.snippet}</p>
                    </button>
                  </li>
                );
              })}
              {hasMore && (
                <li className="p-3 text-center">
                  <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "Carica altri messaggi"}</Button>
                </li>
              )}
            </ul>
          )}
        </section>

        {/* Lettura */}
        <section className={`${selected ? "block" : "hidden lg:flex"} bg-white sm:rounded-xl border-y sm:border border-slate-200 min-h-[60vh] ${selected ? "" : "items-center justify-center"}`}>
          {selected ? (
            <MessageView
              message={selected}
              links={selectedLinks}
              onBack={() => setSelected(null)}
              onReply={() => reply(selected)}
              onReplyAll={() => reply(selected, true)}
              onForward={() => forward(selected)}
              onDelete={() => remove(selected)}
            />
          ) : (
            <div className="text-center px-6">
              <Mails className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Seleziona un messaggio per leggerlo</p>
            </div>
          )}
        </section>
      </div>

      <ComposeDialog
        open={!!compose}
        onOpenChange={(v) => { if (!v) { setCompose(null); load(); } }}
        {...(compose || {})}
        onSent={() => load()}
      />
      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </div>
  );
}
