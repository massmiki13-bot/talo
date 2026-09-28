import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Plus, PenLine, Trash2, Loader2, ArrowUpRight } from "lucide-react";

// Nomi leggibili dei tipi di record, con la pagina dove aprirli.
const ENTITIES = {
  Contact: { label: "cliente/fornitore", group: "Clienti e fornitori", link: (id) => `/contatti/${id}` },
  Quote: { label: "preventivo", group: "Preventivi", link: (id) => `/preventivi/${id}` },
  Invoice: { label: "fattura", group: "Fatture", link: () => "/fatture" },
  Worksite: { label: "lavoro", group: "Lavori", link: (id) => `/lavori/${id}` },
  WorksiteTransaction: { label: "movimento di cantiere", group: "Lavori" },
  WorksitePayment: { label: "pagamento", group: "Lavori" },
  WorksitePhoto: { label: "foto di cantiere", group: "Lavori" },
  WorksiteLog: { label: "giornale di cantiere", group: "Lavori" },
  Employee: { label: "dipendente", group: "Dipendenti", link: (id) => `/dipendenti/${id}` },
  EmployeeDocument: { label: "documento del dipendente", group: "Dipendenti" },
  DailyAttendance: { label: "foglio presenze", group: "Presenze", link: () => "/presenze" },
  GeneratedContract: { label: "contratto", group: "Contratti", link: () => "/contratti" },
  ContractTemplate: { label: "modello di contratto", group: "Contratti" },
  CompanyDocument: { label: "documento ditta", group: "Documenti", link: () => "/documenti-ditta" },
  DocumentFolder: { label: "cartella", group: "Documenti" },
  SafetyPlan: { label: "POS", group: "Sicurezza", link: () => "/sicurezza" },
  Prezzario: { label: "prezzario", group: "Prezzari", link: () => "/prezzari" },
  Reminder: { label: "promemoria", group: "Promemoria", link: () => "/promemoria" },
  CompanyProfile: { label: "profilo ditta", group: "Impostazioni" },
  Collaborator: { label: "collaboratore", group: "Impostazioni", link: () => "/collaboratori" },
  CollaboratorInvite: { label: "invito", group: "Impostazioni" },
  EmailAccount: { label: "casella email", group: "Impostazioni" },
  ReceivedQuote: { label: "preventivo ricevuto", group: "Preventivi" },
};
const entityOf = (e) => ENTITIES[e] || { label: e, group: "Altro" };
const GROUPS = [...new Set(Object.values(ENTITIES).map((x) => x.group))];

const FIELD_LABELS = {
  stato: "stato", totale: "totale", righe: "voci", data: "data", numero: "numero", oggetto: "oggetto", note: "note",
  cliente_id: "cliente", cliente_nome: "cliente", nome: "nome", cognome: "cognome", email: "email", telefono: "telefono",
  indirizzo: "indirizzo", partita_iva: "partita IVA", codice_fiscale: "codice fiscale", iban: "IBAN", presenze: "presenze",
  importo: "importo", importo_totale: "importo", avanzamento: "avanzamento", fasi: "fasi", scadenza: "scadenza",
  file_url: "file", firma_cliente_url: "firma del cliente", data_firma_cliente: "data firma", sconto_globale: "sconto",
  costo_orario: "costo orario", data_assunzione: "assunzione", data_cessazione: "cessazione", permissions: "permessi",
  access_level: "livello di accesso", completato: "completato", folder_id: "cartella", budget: "budget",
};
const SKIP_FIELDS = new Set(["updated_date", "imponibile", "iva_totale", "search_text", "ai_summary", "thumbnail_url"]);
const fieldLabel = (k) => FIELD_LABELS[k] || k.replace(/_/g, " ");

const ACTIONS = {
  create: { verb: "ha creato", icon: Plus, cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  update: { verb: "ha modificato", icon: PenLine, cls: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  delete: { verb: "ha eliminato", icon: Trash2, cls: "bg-red-50 text-red-700 ring-red-200" },
};

const dayLabel = (d) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((today - x) / 86400000);
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Ieri";
  return new Date(d).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: x.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};

const PAGE = 50;

export default function ActivityLog() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState({});
  const [group, setGroup] = useState("all");
  const [person, setPerson] = useState("all");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    db.Collaborator.list().then((list) => {
      const map = {};
      for (const c of list) if (c.collaborator_user_id) map[c.collaborator_user_id] = c.display_name || c.name || c.email;
      setPeople(map);
    }).catch(() => {});
  }, []);

  const entitiesOfGroup = useMemo(() => (group === "all" ? null : Object.keys(ENTITIES).filter((k) => ENTITIES[k].group === group)), [group]);

  // Il filtro per tipo lavora su un'entità alla volta: per i gruppi con più entità filtriamo dopo.
  const load = useCallback(async (before = null) => {
    const single = entitiesOfGroup?.length === 1 ? entitiesOfGroup[0] : null;
    const page = await api.audit.list({ limit: entitiesOfGroup && !single ? 200 : PAGE, before, entity: single, user: person === "all" ? null : person });
    const filtered = entitiesOfGroup ? page.filter((r) => entitiesOfGroup.includes(r.entity)) : page;
    return { list: filtered, hasMore: page.length >= (entitiesOfGroup && !single ? 200 : PAGE), last: page.at(-1)?.at };
  }, [entitiesOfGroup, person]);

  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    load().then(({ list, hasMore: h, last }) => { if (alive) { setRows(list); setHasMore(h); setCursor(last); } })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [load]);

  const loadMore = async () => {
    setMore(true);
    try {
      const { list, hasMore: h, last } = await load(cursor);
      setRows((r) => [...r, ...list]); setHasMore(h); setCursor(last);
    } catch (e) { setError(e.message); } finally { setMore(false); }
  };

  const who = (r) => {
    if (!r.user_id) return "Sistema";
    if (r.user_id === user?.id) return "Tu";
    return people[r.user_id] || r.user_email || "Collaboratore";
  };

  const byDay = useMemo(() => {
    const out = [];
    for (const r of rows) {
      const k = new Date(r.at).toDateString();
      if (out.at(-1)?.key !== k) out.push({ key: k, label: dayLabel(r.at), items: [] });
      out.at(-1).items.push(r);
    }
    return out;
  }, [rows]);

  const deleted = useMemo(() => new Set(rows.filter((r) => r.action === "delete").map((r) => r.record_id)), [rows]);

  const personOptions = useMemo(() => [[user?.id, "Tu (titolare)"], ...Object.entries(people)].filter(([id]) => id), [people, user]);

  return (
    <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2"><History className="w-5 h-5 text-brand-600" />Registro attività</h2>
          <p className="text-sm text-zinc-500 mt-1">Chi ha creato, modificato o eliminato cosa, e quando. Lo vede solo il titolare.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger className="w-44" aria-label="Filtra per sezione"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le sezioni</SelectItem>
              {GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger className="w-44" aria-label="Filtra per persona"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le persone</SelectItem>
              {personOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
      ) : error ? (
        <p className="mt-6 text-sm text-red-700">{error}</p>
      ) : !rows.length ? (
        <p className="mt-6 text-sm text-zinc-500 rounded-lg bg-zinc-50 border border-zinc-200 p-4">Nessuna attività registrata{group !== "all" || person !== "all" ? " con questi filtri" : ""}. Da ora ogni modifica comparirà qui.</p>
      ) : (
        <div className="mt-5 space-y-6">
          {byDay.map((d) => (
            <div key={d.key}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-2 first-letter:uppercase">{d.label}</h3>
              <ol className="relative border-l border-zinc-200 ml-3.5 space-y-3">
                {d.items.map((r) => {
                  const a = ACTIONS[r.action];
                  const ent = entityOf(r.entity);
                  const fields = (r.changed || []).filter((k) => !SKIP_FIELDS.has(k)).map(fieldLabel);
                  const href = !deleted.has(r.record_id) && ent.link ? ent.link(r.record_id) : null;
                  return (
                    <li key={r.id} className="pl-6 relative">
                      <span className={`absolute -left-3.5 top-0 grid place-items-center w-7 h-7 rounded-full ring-1 ${a.cls}`}><a.icon className="w-3.5 h-3.5" aria-hidden="true" /></span>
                      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="text-zinc-900"><b className="font-semibold">{who(r)}</b> {a.verb} {ent.label}</span>
                        {r.label && (href
                          ? <Link to={href} className="font-medium text-brand-700 hover:underline inline-flex items-center gap-0.5 min-w-0 break-all">{r.label}<ArrowUpRight className="w-3.5 h-3.5 shrink-0" /></Link>
                          : <span className="font-medium text-zinc-800 break-all">{r.label}</span>)}
                        <time className="text-xs text-zinc-500 tabular-nums ml-auto" dateTime={r.at}>{new Date(r.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time>
                      </div>
                      {r.action === "update" && fields.length > 0 && (
                        <p className="text-xs text-zinc-500 mt-0.5">Campi: {fields.slice(0, 6).join(", ")}{fields.length > 6 ? ` e altri ${fields.length - 6}` : ""}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
          {hasMore && (
            <Button variant="outline" onClick={loadMore} disabled={more} className="w-full gap-2">
              {more && <Loader2 className="w-4 h-4 animate-spin" />} Mostra attività precedenti
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
