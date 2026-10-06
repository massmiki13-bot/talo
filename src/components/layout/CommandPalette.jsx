import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Command as Cmdk } from "cmdk";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { Search, Users, FileText, Briefcase, UserCheck, FolderOpen, Receipt, FileSignature, ShieldCheck, Plus, CornerDownLeft, Loader2, ArrowRight } from "lucide-react";
import { GROUPS } from "./Sidebar";

// Ricerca globale (Ctrl+K / ⌘K): clienti, lavori, preventivi, dipendenti, documenti, fatture, contratti, POS e pagine.

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const eur = (v) => (v ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(v) : "");

const SOURCES = [
  { key: "contatti", label: "Clienti e fornitori", icon: Users, path: "/contatti", entity: "Contact",
    fields: ["nome", "nome_privato", "partita_iva", "codice_fiscale", "email", "telefono", "cellulare", "citta", "tipo", "archiviato"],
    map: (c) => ({ title: c.nome || c.nome_privato, sub: [c.tipo === "fornitore" ? "Fornitore" : "Cliente", c.citta, c.partita_iva || c.email].filter(Boolean).join(" · "), text: [c.nome, c.nome_privato, c.partita_iva, c.codice_fiscale, c.email, c.telefono, c.cellulare, c.citta], to: `/contatti/${c.id}`, dim: c.archiviato }) },
  { key: "lavori", label: "Lavori", icon: Briefcase, path: "/lavori", entity: "Worksite",
    fields: ["nome", "indirizzo", "cliente_nome", "stato"],
    map: (w) => ({ title: w.nome, sub: [w.cliente_nome, w.indirizzo].filter(Boolean).join(" · "), text: [w.nome, w.indirizzo, w.cliente_nome], to: `/lavori/${w.id}` }) },
  { key: "preventivi", label: "Preventivi", icon: FileText, path: "/preventivi", entity: "Quote",
    fields: ["numero", "oggetto", "cliente_nome", "totale", "stato"],
    map: (q) => ({ title: [q.numero && `N. ${q.numero}`, q.oggetto].filter(Boolean).join(" – ") || "Preventivo", sub: [q.cliente_nome, eur(q.totale)].filter(Boolean).join(" · "), text: [q.numero, q.oggetto, q.cliente_nome], to: `/preventivi/${q.id}` }) },
  { key: "fatture", label: "Fatture", icon: Receipt, path: "/fatture", entity: "Invoice",
    fields: ["numero", "oggetto", "cliente_nome", "totale", "tipo_documento"],
    map: (f) => ({ title: `${f.tipo_documento === "TD04" ? "Nota di credito" : "Fattura"} ${f.numero || ""}`.trim(), sub: [f.cliente_nome, eur(f.totale)].filter(Boolean).join(" · "), text: [f.numero, f.oggetto, f.cliente_nome], to: `/fatture?id=${f.id}` }) },
  { key: "dipendenti", label: "Dipendenti", icon: UserCheck, path: "/dipendenti", entity: "Employee",
    fields: ["nome", "cognome", "ruolo", "qualifica", "codice_fiscale", "matricola", "stato"],
    map: (e) => ({ title: `${e.nome || ""} ${e.cognome || ""}`.trim(), sub: [e.qualifica || e.ruolo, e.stato === "cessato" ? "Cessato" : ""].filter(Boolean).join(" · "), text: [e.nome, e.cognome, e.ruolo, e.qualifica, e.codice_fiscale, e.matricola], to: `/dipendenti/${e.id}`, dim: e.stato === "cessato" }) },
  { key: "documenti", label: "Documenti ditta", icon: FolderOpen, path: "/documenti-ditta", entity: "CompanyDocument",
    fields: ["titolo", "nome_file", "tipo", "cartella_nome", "numero", "emittente", "tag", "data_scadenza"],
    map: (d) => ({ title: d.titolo || d.nome_file, sub: [d.cartella_nome, d.emittente, d.data_scadenza && `scade il ${new Date(d.data_scadenza).toLocaleDateString("it-IT")}`].filter(Boolean).join(" · "), text: [d.titolo, d.nome_file, d.tipo, d.cartella_nome, d.numero, d.emittente, ...(d.tag || [])], to: `/documenti-ditta?doc=${d.id}` }) },
  { key: "contratti", label: "Contratti", icon: FileSignature, path: "/contratti", entity: "GeneratedContract",
    fields: ["titolo", "controparte_nome", "stato"],
    map: (c) => ({ title: c.titolo || "Contratto", sub: c.controparte_nome, text: [c.titolo, c.controparte_nome], to: `/contratti?id=${c.id}` }) },
  { key: "sicurezza", label: "POS", icon: ShieldCheck, path: "/sicurezza", entity: "SafetyPlan",
    fields: ["titolo", "worksite_nome"],
    map: (p) => ({ title: p.titolo || "POS", sub: p.worksite_nome, text: [p.titolo, p.worksite_nome], to: `/sicurezza?id=${p.id}` }) },
];

const ACTIONS = [
  { label: "Nuovo preventivo", to: "/preventivi/nuovo", path: "/preventivi", keywords: "crea offerta" },
  { label: "Nuovo cliente o fornitore", to: "/contatti?nuovo=1", path: "/contatti", keywords: "crea contatto anagrafica" },
  { label: "Nuovo contratto", to: "/contratti?nuovo=1", path: "/contratti", keywords: "crea" },
  { label: "Inserisci presenze di oggi", to: "/presenze?tab=inserimento", path: "/presenze", keywords: "giornaliera ore" },
];

const CACHE_MS = 60_000;
const PER_GROUP = 6;

function score(item, tokens) {
  const hay = norm(item.text.filter(Boolean).join(" "));
  const title = norm(item.title);
  let s = 0;
  for (const t of tokens) {
    if (!hay.includes(t)) return 0;
    s += title.startsWith(t) ? 6 : title.includes(t) ? 3 : 1;
  }
  return s - (item.dim ? 2 : 0);
}

export default function CommandPalette({ open, onOpenChange, canAccessPath = () => true }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const loadedAt = useRef(0);

  const sources = useMemo(() => SOURCES.filter((s) => canAccessPath(s.path)), [canAccessPath]);

  const load = useCallback(async () => {
    if (Date.now() - loadedAt.current < CACHE_MS) return;
    setLoading(true);
    const entries = await Promise.all(sources.map(async (s) => {
      const rows = await db[s.entity].fields(s.fields, { sort: "-updated_date", limit: 3000 }).catch(() => []);
      return [s.key, rows.map((r) => ({ id: r.id, ...s.map(r) })).filter((x) => x.title)];
    }));
    setData(Object.fromEntries(entries));
    loadedAt.current = Date.now();
    setLoading(false);
  }, [sources]);

  useEffect(() => { if (open) { setQuery(""); load(); } }, [open, load]);

  const tokens = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);

  const results = useMemo(() => {
    if (!tokens.length) return [];
    return sources.map((s) => ({
      ...s,
      items: (data[s.key] || []).map((it) => ({ it, s: score(it, tokens) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, PER_GROUP).map((x) => x.it),
    })).filter((g) => g.items.length);
  }, [data, sources, tokens]);

  const pages = useMemo(() => {
    const all = GROUPS.flatMap((g) => g.items).filter((p) => canAccessPath(p.path));
    const acts = ACTIONS.filter((a) => canAccessPath(a.path)).map((a) => ({ ...a, icon: Plus, action: true }));
    const list = [...acts, ...all.map((p) => ({ label: p.label, to: p.path, icon: p.icon }))];
    if (!tokens.length) return list;
    return list.filter((p) => tokens.every((t) => norm(`${p.label} ${p.keywords || ""}`).includes(t)));
  }, [tokens, canAccessPath]);

  const go = (to) => {
    onOpenChange(false);
    const url = new URL(to, window.location.origin);
    // Le pagine leggono ?id=/?doc= all'apertura: se siamo già lì, ricarichiamo la pagina.
    if (url.pathname === location.pathname && url.search) window.location.assign(to);
    else navigate(to);
  };

  const Item = ({ value, onSelect, icon: I, title, sub, dim }) => (
    <Cmdk.Item value={value} onSelect={onSelect}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer text-sm text-zinc-700 aria-selected:bg-brand-50 aria-selected:text-zinc-950 data-[selected=true]:bg-brand-50 group">
      <span className="grid place-items-center w-8 h-8 rounded-md bg-zinc-100 text-zinc-600 shrink-0 group-aria-selected:bg-white group-data-[selected=true]:bg-white group-data-[selected=true]:text-brand-700"><I className="w-4 h-4" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${dim ? "text-zinc-500" : "text-zinc-900"}`}>{title}</span>
        {sub && <span className="block truncate text-xs text-zinc-500">{sub}</span>}
      </span>
      <CornerDownLeft className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-data-[selected=true]:opacity-100 shrink-0" aria-hidden="true" />
    </Cmdk.Item>
  );

  const heading = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-zinc-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 overflow-hidden max-w-2xl top-[12%] translate-y-0 sm:rounded-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">Cerca in Talo</DialogTitle>
        <DialogDescription className="sr-only">Cerca clienti, lavori, preventivi, dipendenti, documenti e pagine. Usa le frecce per scegliere e Invio per aprire.</DialogDescription>
        <Cmdk shouldFilter={false} loop label="Cerca in Talo" className="flex flex-col max-h-[70vh]">
          <div className="flex items-center gap-3 px-4 border-b border-zinc-200">
            <Search className="w-5 h-5 text-zinc-400 shrink-0" aria-hidden="true" />
            <Cmdk.Input value={query} onValueChange={setQuery} autoFocus placeholder="Cerca clienti, lavori, preventivi, documenti…"
              className="h-14 flex-1 bg-transparent text-base text-zinc-900 placeholder:text-zinc-500 outline-none" />
            {loading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" aria-label="Caricamento" />}
            <kbd className="hidden sm:inline text-[11px] font-medium text-zinc-500 border border-zinc-200 rounded px-1.5 py-0.5">Esc</kbd>
          </div>
          <Cmdk.List className={`overflow-y-auto p-2 ${heading}`}>
            {tokens.length > 0 && !loading && !results.length && !pages.length && (
              <Cmdk.Empty className="py-12 text-center text-sm text-zinc-500">Nessun risultato per «{query}».</Cmdk.Empty>
            )}
            {results.map((g) => (
              <Cmdk.Group key={g.key} heading={g.label}>
                {g.items.map((it) => <Item key={it.id} value={`${g.key}-${it.id}`} onSelect={() => go(it.to)} icon={g.icon} title={it.title} sub={it.sub} dim={it.dim} />)}
                {(data[g.key] || []).length > 0 && (
                  <Cmdk.Item value={`${g.key}-all`} onSelect={() => go(g.key === "contatti" || g.key === "preventivi" ? `${g.path}?q=${encodeURIComponent(query)}` : g.path)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer text-xs font-medium text-brand-700 data-[selected=true]:bg-brand-50">
                    Apri {g.label.toLowerCase()} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Cmdk.Item>
                )}
              </Cmdk.Group>
            ))}
            {pages.length > 0 && (
              <Cmdk.Group heading={tokens.length ? "Pagine e azioni" : "Vai a"}>
                {pages.map((p) => <Item key={p.to} value={`page-${p.to}`} onSelect={() => go(p.to)} icon={p.icon} title={p.label} />)}
              </Cmdk.Group>
            )}
          </Cmdk.List>
          <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-t border-zinc-200 text-xs text-zinc-500 bg-zinc-50">
            <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> per scegliere</span>
            <span><kbd className="font-sans">Invio</kbd> per aprire</span>
            <span className="ml-auto">Ctrl K per aprire la ricerca da qualsiasi pagina</span>
          </div>
        </Cmdk>
      </DialogContent>
    </Dialog>
  );
}
