import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "@/lib/db";
import { Building2, Users, FileText, UserCheck, Mail, Check, ChevronRight, FileSpreadsheet, X, Sparkles } from "lucide-react";

const HIDE_KEY = "talo.onboarding.nascosto";

// Primi passi guidati per una nuova azienda: si spuntano da soli man mano che i dati ci sono.
export default function OnboardingChecklist({ profile, quotes = [], employees = [], onProfileChange }) {
  const [counts, setCounts] = useState(null);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } });

  useEffect(() => {
    Promise.all([
      db.Contact.fields(["nome"], { limit: 1 }).catch(() => []),
      db.EmailAccount.fields(["email_address"], { limit: 1 }).catch(() => []),
    ]).then(([c, e]) => setCounts({ contacts: c.length, email: e.length }));
  }, []);

  if (!counts || hidden || profile?.onboarding_nascosto) return null;

  const steps = [
    { key: "profilo", icon: Building2, title: "Completa il profilo della ditta", text: "Partita IVA, sede e logo: finiscono su preventivi, fatture e contratti. Con la P.IVA i dati arrivano da soli dal VIES.",
      done: !!(profile?.ragione_sociale && profile?.partita_iva && profile?.indirizzo), cta: { to: "/profilo-ditta", label: "Apri il profilo" } },
    { key: "cliente", icon: Users, title: "Aggiungi il primo cliente", text: "Oppure importa tutta la rubrica da un file Excel del vecchio gestionale.",
      done: counts.contacts > 0, cta: { to: "/contatti?nuovo=1", label: "Nuovo cliente" }, alt: { to: "/contatti?importa=1", label: "Importa da Excel" } },
    { key: "preventivo", icon: FileText, title: "Crea il primo preventivo", text: "Con i prezzari e l'IA le voci si compilano in pochi minuti; il cliente lo firma online dal telefono.",
      done: quotes.length > 0, cta: { to: "/preventivi/nuovo", label: "Nuovo preventivo" } },
    { key: "dipendenti", icon: UserCheck, title: "Inserisci i dipendenti", text: "Servono per presenze, timbrature, POS e scadenze di corsi e visite. Si importano anche da Excel.",
      done: employees.length > 0, cta: { to: "/dipendenti", label: "Aggiungi" }, alt: { to: "/dipendenti?importa=1", label: "Importa da Excel" } },
    { key: "email", icon: Mail, title: "Collega la casella email", text: "Per inviare preventivi e fatture dal tuo indirizzo (anche PEC) e ritrovare le email nelle schede di clienti e lavori.",
      done: counts.email > 0, cta: { to: "/profilo-ditta?sezione=posta", label: "Collega" } },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done);

  const hide = async () => {
    try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* ignore */ }
    setHidden(true);
    if (profile?.id) onProfileChange?.(await db.CompanyProfile.update(profile.id, { onboarding_nascosto: true }).catch(() => profile));
  };

  return (
    <section className="bg-white rounded-2xl border border-zinc-200 overflow-hidden" aria-labelledby="onb-title">
      <div className="p-5 sm:p-6 flex flex-wrap items-start gap-4">
        <span className="grid place-items-center w-11 h-11 rounded-xl text-white glow-red shrink-0" style={{ backgroundImage: "var(--metal-red)" }}><Sparkles className="w-5 h-5" aria-hidden="true" /></span>
        <div className="flex-1 min-w-[200px]">
          <h2 id="onb-title" className="font-display text-xl font-bold uppercase text-zinc-950">Primi passi con Talo</h2>
          <p className="text-sm text-zinc-600 mt-0.5">{done} di {steps.length} completati · in 10 minuti l'azienda è pronta.</p>
          <div className="flex gap-1 mt-3" aria-hidden="true">
            {steps.map((s) => <span key={s.key} className={`h-1.5 flex-1 rounded-full ${s.done ? "" : "bg-zinc-100"}`} style={s.done ? { backgroundImage: "var(--metal-red)" } : undefined} />)}
          </div>
        </div>
        <button type="button" onClick={hide} className="text-zinc-500 hover:text-zinc-900 p-1" aria-label="Nascondi i primi passi"><X className="w-4 h-4" /></button>
      </div>
      <ol className="border-t border-zinc-100 divide-y divide-zinc-100">
        {steps.map((s, i) => {
          const current = s === next;
          return (
            <li key={s.key} className={`px-5 sm:px-6 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 ${current ? "bg-brand-50/40" : ""}`}>
              <span className={`grid place-items-center w-8 h-8 rounded-full shrink-0 text-sm font-semibold ${s.done ? "bg-emerald-500 text-white" : current ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}>
                {s.done ? <Check className="w-4 h-4" aria-label="Fatto" /> : i + 1}
              </span>
              <div className="flex-1 min-w-[200px]">
                <p className={`text-sm font-semibold ${s.done ? "text-zinc-500 line-through decoration-zinc-300" : "text-zinc-900"}`}>{s.title}</p>
                {!s.done && <p className="text-xs text-zinc-500 mt-0.5">{s.text}</p>}
              </div>
              {!s.done && (
                <div className="flex gap-2 ml-12 sm:ml-0">
                  {s.alt && <Link to={s.alt.to} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-zinc-700 border border-zinc-200 hover:bg-zinc-50"><FileSpreadsheet className="w-4 h-4" aria-hidden="true" />{s.alt.label}</Link>}
                  <Link to={s.cta.to} className={`inline-flex items-center gap-1 h-9 px-3.5 rounded-lg text-sm font-semibold ${current ? "bg-brand-600 text-white hover:bg-brand-700" : "text-zinc-900 border border-zinc-200 hover:bg-zinc-50"}`}>{s.cta.label}<ChevronRight className="w-4 h-4" aria-hidden="true" /></Link>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
