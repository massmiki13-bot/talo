import React from "react";

const statusConfig = {
  in_attesa: { label: "In Attesa", color: "bg-amber-100 text-amber-700 border-amber-200" },
  inviato: { label: "Inviato", color: "bg-blue-100 text-blue-700 border-blue-200" },
  approvato: { label: "Approvato", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rifiutato: { label: "Rifiutato", color: "bg-red-100 text-red-700 border-red-200" },
  scaduto: { label: "Scaduto", color: "bg-red-100 text-red-700 border-red-200" },
  bozza: { label: "Bozza", color: "bg-slate-100 text-slate-600 border-slate-200" },
  emessa: { label: "Emessa", color: "bg-blue-100 text-blue-700 border-blue-200" },
  inviata: { label: "Inviata", color: "bg-blue-100 text-blue-700 border-blue-200" },
  pagata: { label: "Pagata", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  da_iniziare: { label: "Da Iniziare", color: "bg-blue-100 text-blue-700 border-blue-200" },
  in_corso: { label: "In Corso", color: "bg-amber-100 text-amber-700 border-amber-200" },
  finito: { label: "Finito", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || { label: status, color: "bg-slate-100 text-slate-600 border-slate-200" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      {config.label}
    </span>
  );
}