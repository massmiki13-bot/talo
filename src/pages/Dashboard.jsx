import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, db } from "@/lib/db";
import {
  FileText, Clock, CheckCircle, AlertTriangle, TrendingDown,
  Bell, Calendar, ArrowRight, Wallet, Euro, AlertOctagon
} from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { formatEuro } from "@/utils/pdfUtils";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const entities = ["Reminder", "Quote", "Worksite", "WorksiteTransaction", "WorksitePayment", "CompanyDocument", "EmployeeDocument", "GeneratedContract", "Contact"];
    const unsubs = entities.map(e => db[e].subscribe(() => load()));
    return () => { unsubs.forEach(u => { try { u && u(); } catch (_) {} }); };
  }, []);

  const load = async () => {
    try {
      const [quotes, contacts, empDocs, compDocs, contracts, reminders, worksites, transactions, payments] = await Promise.all([
        db.Quote.list(),
        db.Contact.filter({ tipo: "cliente" }),
        db.EmployeeDocument.list(),
        db.CompanyDocument.list(),
        db.GeneratedContract.list(),
        db.Reminder.filter({ completato: false }, "data", 10),
        db.Worksite.list(),
        db.WorksiteTransaction.list(),
        db.WorksitePayment.list(),
      ]);

      const today = new Date(new Date().toDateString());
      const in30days = new Date(today); in30days.setDate(in30days.getDate() + 30);

      // Expiring docs (employee docs, company docs, contracts) — only those with an actual scadenza date
      const expiringDocs = [];
      const addExpiring = (d, source) => {
        if (!d.data_scadenza) return;
        const dDate = new Date(d.data_scadenza);
        if (isNaN(dDate.getTime())) return;
        if (dDate < in30days) expiringDocs.push({ ...d, _source: source, isExpired: dDate < today, days: Math.ceil((dDate - today) / 86400000) });
      };
      empDocs.forEach(d => addExpiring(d, "employee"));
      compDocs.forEach(d => addExpiring(d, "company"));
      contracts.forEach(d => addExpiring(d, "contract"));
      expiringDocs.sort((a, b) => new Date(a.data_scadenza) - new Date(b.data_scadenza));

      // Pending quotes
      const pendingQuotes = quotes.filter(q => ["in_attesa", "inviato", "visto"].includes(q.stato));

      // Worksite margins
      const worksiteBudgets = worksites.map(w => {
        const txs = transactions.filter(t => t.worksite_id === w.id);
        const entrate = txs.filter(t => t.tipo === "entrata").reduce((s, t) => s + (t.importo || 0), 0);
        const uscite = txs.filter(t => t.tipo === "uscita").reduce((s, t) => s + (t.importo || 0), 0);
        return { ...w, margine: entrate - uscite, entrate, uscite };
      });
      const losingWorksites = worksiteBudgets.filter(w => w.margine < 0);

      // Today's reminders
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayReminders = reminders.filter(r => r.data === todayStr);

      // Da incassare: worksites with importo_totale > 0 where payments don't cover it
      const daIncassare = worksites
        .map(w => {
          const totale = w.importo_totale || quotes.find(q => q.id === w.preventivo_id)?.totale || 0;
          const pagato = payments.filter(p => p.worksite_id === w.id).reduce((s, p) => s + (p.importo || 0), 0);
          const rimanente = totale - pagato;
          return { ...w, importo_totale: totale, pagato, rimanente, percentuale: totale > 0 ? (pagato / totale) * 100 : 0 };
        })
        .filter(w => w.rimanente > 0.01)
        .sort((a, b) => b.rimanente - a.rimanente);
      const totaleDaIncassare = daIncassare.reduce((s, w) => s + w.rimanente, 0);

      // Count expired vs expiring
      const expiredCount = expiringDocs.filter(d => d.isExpired).length;
      const expiringCount = expiringDocs.filter(d => !d.isExpired).length;

      setData({
        stats: {
          preventiviTotali: quotes.length,
          preventiviInAttesa: pendingQuotes.length,
          preventiviApprovati: quotes.filter(q => q.stato === "approvato").length,
          clienti: contacts.length,
          lavoriAttivi: worksites.filter(w => w.attivo).length,
          lavoriDaIniziare: worksites.filter(w => (w.stato || "da_iniziare") === "da_iniziare").length,
          lavoriInCorso: worksites.filter(w => w.stato === "in_corso").length,
          lavoriFiniti: worksites.filter(w => w.stato === "finito").length,
        },
        expiringDocs: expiringDocs.slice(0, 8),
        expiredCount,
        expiringCount,
        pendingQuotes: pendingQuotes.slice(0, 5),
        losingWorksites: losingWorksites.slice(0, 5),
        daIncassare: daIncassare.slice(0, 6),
        totaleDaIncassare,
        todayReminders,
        upcomingReminders: reminders.slice(0, 5),
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <LoadingSpinner />;
  const d = data;

  const card = "bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1 text-sm">Panoramica della tua attività</p>
      </div>

      {/* Expired docs banner */}
      {(d.expiredCount > 0 || d.expiringCount > 0) && (
        <div className={`rounded-xl border p-4 mb-6 flex items-center gap-3 ${d.expiredCount > 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          <AlertOctagon className={`w-6 h-6 flex-shrink-0 ${d.expiredCount > 0 ? "text-red-600" : "text-amber-600"}`} />
          <div className="flex-1">
            <p className={`text-sm font-semibold ${d.expiredCount > 0 ? "text-red-800" : "text-amber-800"}`}>
              {d.expiredCount > 0 && `${d.expiredCount} documento/i scaduto/i`}
              {d.expiredCount > 0 && d.expiringCount > 0 && " · "}
              {d.expiringCount > 0 && `${d.expiringCount} in scadenza`}
            </p>
            <p className={`text-xs ${d.expiredCount > 0 ? "text-red-600" : "text-amber-600"}`}>
              {d.expiredCount > 0 ? "Sanzioni possibili: controlla subito i documenti scaduti" : "Rinnova i documenti prima della scadenza"}
            </p>
          </div>
          <Link to="/documenti-ditta" className={`text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap ${d.expiredCount > 0 ? "bg-red-600 text-white hover:bg-red-700" : "bg-amber-600 text-white hover:bg-amber-700"}`}>
            Vedi documenti
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <Link to="/preventivi" className={card}>
          <FileText className="w-5 h-5 text-blue-600 mb-2" />
          <p className="text-2xl font-bold text-slate-900">{d.stats.preventiviTotali}</p>
          <p className="text-xs text-slate-500">Preventivi</p>
        </Link>
        <Link to="/preventivi" className={card}>
          <Clock className="w-5 h-5 text-amber-600 mb-2" />
          <p className="text-2xl font-bold text-amber-600">{d.stats.preventiviInAttesa}</p>
          <p className="text-xs text-slate-500">In attesa</p>
        </Link>
        <Link to="/preventivi" className={card}>
          <CheckCircle className="w-5 h-5 text-emerald-600 mb-2" />
          <p className="text-2xl font-bold text-emerald-600">{d.stats.preventiviApprovati}</p>
          <p className="text-xs text-slate-500">Approvati</p>
        </Link>
        <Link to="/contatti" className={card}>
          <span className="text-2xl">👥</span>
          <p className="text-2xl font-bold text-slate-900 mt-2">{d.stats.clienti}</p>
          <p className="text-xs text-slate-500">Clienti</p>
        </Link>
        <Link to="/lavori" className={card}>
          <Wallet className="w-5 h-5 text-teal-600 mb-2" />
          <p className="text-2xl font-bold text-slate-900">{d.stats.lavoriAttivi}</p>
          <p className="text-xs text-slate-500">Lavori attivi</p>
        </Link>
      </div>

      {/* Stato lavori */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Stato Lavori</h2>
          <Link to="/lavori" className="text-xs text-blue-600 hover:underline">Vedi tutti →</Link>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Link to="/lavori" className="flex items-center gap-2 hover:bg-slate-50 rounded-lg p-1">
            <span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0"></span>
            <div>
              <p className="text-lg font-bold text-slate-900">{d.stats.lavoriDaIniziare}</p>
              <p className="text-xs text-slate-500">Da iniziare</p>
            </div>
          </Link>
          <Link to="/lavori" className="flex items-center gap-2 hover:bg-slate-50 rounded-lg p-1">
            <span className="w-3 h-3 rounded-full bg-amber-500 flex-shrink-0"></span>
            <div>
              <p className="text-lg font-bold text-slate-900">{d.stats.lavoriInCorso}</p>
              <p className="text-xs text-slate-500">In corso</p>
            </div>
          </Link>
          <Link to="/lavori" className="flex items-center gap-2 hover:bg-slate-50 rounded-lg p-1">
            <span className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0"></span>
            <div>
              <p className="text-lg font-bold text-slate-900">{d.stats.lavoriFiniti}</p>
              <p className="text-xs text-slate-500">Finiti</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Alert row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Expiring docs */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Scadenze in arrivo
            </h2>
            <Link to="/analisi" className="text-xs text-blue-600 hover:underline">Vedi tutte →</Link>
          </div>
          {d.expiringDocs.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Nessuna scadenza imminente ✓</p>
          ) : (
            <div className="space-y-2">
              {d.expiringDocs.map(doc => (
                <Link key={doc.id} to={
                  doc._source === "employee" && doc.dipendente_id ? `/dipendenti/${doc.dipendente_id}?doc=${doc.id}`
                  : doc._source === "company" ? `/documenti-ditta?doc=${doc.id}`
                  : doc._source === "contract" ? "/contratti"
                  : "/documenti-ditta"
                } className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${doc.isExpired ? "bg-red-500" : "bg-amber-500"}`} />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{doc.titolo}</p>
                      <p className="text-xs text-slate-500">{new Date(doc.data_scadenza).toLocaleDateString("it-IT")}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${doc.isExpired ? "text-red-600" : "text-amber-600"}`}>
                    {doc.isExpired ? "Scaduto" : doc.days === 0 ? "Oggi" : `${doc.days}g`}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pending quotes */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> Preventivi in attesa
            </h2>
            <Link to="/preventivi" className="text-xs text-blue-600 hover:underline">Vedi tutti →</Link>
          </div>
          {d.pendingQuotes.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Nessun preventivo in attesa ✓</p>
          ) : (
            <div className="space-y-2">
              {d.pendingQuotes.map(q => (
                <Link key={q.id} to={`/preventivi/${q.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{q.cliente_nome || "—"}</p>
                    <p className="text-xs text-slate-500">N. {q.numero} · {new Date(q.data).toLocaleDateString("it-IT")}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{formatEuro(q.totale)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Da incassare */}
      {d.daIncassare.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Euro className="w-4 h-4 text-red-500" /> Da Incassare
            </h2>
            <div className="text-right">
              <p className="text-lg font-bold text-red-600">{formatEuro(d.totaleDaIncassare)}</p>
              <p className="text-[10px] text-slate-400">totale da recuperare</p>
            </div>
          </div>
          <div className="space-y-2">
            {d.daIncassare.map(w => (
              <Link key={w.id} to={`/lavori/${w.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{w.nome}</p>
                  <p className="text-xs text-slate-500">{w.cliente_nome || "—"} · {w.percentuale.toFixed(0)}% pagato</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-12 sm:w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${w.percentuale}%` }} />
                  </div>
                  <span className="text-sm font-bold text-red-600 whitespace-nowrap">{formatEuro(w.rimanente)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Losing worksites + today reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" /> Lavori in perdita
            </h2>
            <Link to="/lavori" className="text-xs text-blue-600 hover:underline">Vedi tutti →</Link>
          </div>
          {d.losingWorksites.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Nessun lavoro in perdita ✓</p>
          ) : (
            <div className="space-y-2">
              {d.losingWorksites.map(w => (
                <Link key={w.id} to={`/lavori/${w.id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <p className="text-sm font-medium text-slate-900">{w.nome}</p>
                  </div>
                  <span className="text-sm font-bold text-red-600">{formatEuro(w.margine)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-500" /> Promemoria
            </h2>
            <Link to="/promemoria" className="text-xs text-blue-600 hover:underline">Vedi tutti →</Link>
          </div>
          {d.todayReminders.length === 0 && d.upcomingReminders.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Nessun promemoria ✓</p>
          ) : (
            <div className="space-y-2">
              {d.todayReminders.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-blue-600 uppercase">Oggi</p>
                  {d.todayReminders.map(r => (
                    <Link key={r.id} to="/promemoria" className="flex items-center justify-between p-2 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                      <p className="text-sm font-medium text-slate-900">{r.titolo}</p>
                      <span className="text-xs text-blue-600">Oggi</span>
                    </Link>
                  ))}
                </>
              )}
              {d.upcomingReminders.filter(r => r.data !== new Date().toISOString().slice(0, 10)).slice(0, 4).map(r => (
                <Link key={r.id} to="/promemoria" className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-900">{r.titolo}</p>
                  <span className="text-xs text-slate-500">{new Date(r.data).toLocaleDateString("it-IT")}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}