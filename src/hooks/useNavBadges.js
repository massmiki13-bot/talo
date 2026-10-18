// Numeri delle novità accanto alle voci del menu: cose da guardare o da fare, per sezione.
import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { soaDeadlines, isoDeadlines } from "@/lib/qualifications";

const iso = (d) => d.toISOString().slice(0, 10);
const safe = (p) => p.catch(() => []);

/** Calcola i conteggi dai dati (funzione pura, usata anche nei test). */
export function countBadges({ email = [], reminders = [], segnalazioni = [], richieste = [], invoices = [], docs = [], empDocs = [], equipment = [], quals = [] }, today = new Date()) {
  const t = iso(today);
  const in30 = iso(new Date(today.getTime() + 30 * 86_400_000));
  const in90 = iso(new Date(today.getTime() + 90 * 86_400_000));
  const scade = (d) => d && d <= in30;
  return {
    "/posta": email.filter((m) => m.direzione === "in" && !m.letto).length,
    "/promemoria": reminders.filter((r) => !r.completato && r.data && r.data <= t).length,
    "/squadra": segnalazioni.filter((s) => s.stato !== "chiusa").length + richieste.filter((r) => (r.stato || "in_attesa") === "in_attesa").length,
    "/scadenzario": invoices.filter((i) => !["pagata", "bozza", "annullata"].includes(i.stato) && i.tipo_documento !== "TD04" && (i.scadenza || i.data) && (i.scadenza || i.data) < t).length,
    "/documenti-ditta": docs.filter((d) => scade(d.data_scadenza)).length,
    "/dipendenti": empDocs.filter((d) => scade(d.data_scadenza)).length,
    "/mezzi": equipment.reduce((n, m) => n + Object.values(m.scadenze || {}).filter((d) => scade(d)).length, 0),
    "/qualificazioni": quals.flatMap((q) => (q.tipo === "soa" ? soaDeadlines(q) : q.tipo === "iso9001" ? isoDeadlines(q, today) : [])).filter((d) => d.data <= in90).length,
  };
}

/** Conteggi aggiornati all'apertura, ogni 2 minuti e a ogni cambio di pagina (key). */
export function useNavBadges(enabled, key) {
  const [counts, setCounts] = useState({});
  const last = useRef(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = async (force) => {
      // al cambio pagina si ricarica solo se sono passati almeno 20 secondi
      if (!force && Date.now() - last.current < 20_000) return;
      last.current = Date.now();
      const [email, reminders, segnalazioni, richieste, invoices, docs, empDocs, equipment, quals] = await Promise.all([
        safe(db.EmailMessage.fields(["direzione", "letto"], { filter: { direzione: "in", letto: false }, limit: 500 })),
        safe(db.Reminder.fields(["completato", "data"], { sort: "data", limit: 2000 })),
        safe(db.Segnalazione.fields(["stato"], { limit: 1000 })),
        safe(db.Richiesta.fields(["stato"], { limit: 1000 })),
        safe(db.Invoice.fields(["stato", "tipo_documento", "scadenza", "data"], { sort: "-data", limit: 2000 })),
        safe(db.CompanyDocument.fields(["data_scadenza"], { limit: 5000 })),
        safe(db.EmployeeDocument.fields(["data_scadenza"], { limit: 5000 })),
        safe(db.Equipment.list()),
        safe(db.Qualificazione.list()),
      ]);
      if (alive) setCounts(countBadges({ email, reminders, segnalazioni, richieste, invoices, docs, empDocs, equipment, quals }));
    };
    load(false);
    const t = setInterval(() => load(true), 120_000);
    return () => { alive = false; clearInterval(t); };
  }, [enabled, key]);
  return counts;
}
