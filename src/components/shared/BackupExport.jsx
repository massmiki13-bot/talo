import React, { useState } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Download, Loader2, Database } from "lucide-react";

function toCSV(data, fields) {
  const header = fields.join(",");
  const rows = data.map(item =>
    fields.map(f => {
      const val = item[f];
      const str = typeof val === "object" && val !== null ? JSON.stringify(val) : String(val ?? "");
      return `"${str.replace(/"/g, '""')}"`;
    }).join(",")
  );
  return [header, ...rows].join("\n");
}

function downloadCSV(filename, csv) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ENTITY_CONFIG = [
  { name: "Contact", label: "Contatti", fields: ["id", "tipo", "nome", "partita_iva", "codice_fiscale", "indirizzo", "citta", "cap", "provincia", "telefono", "email", "pec", "note", "created_date"] },
  { name: "Quote", label: "Preventivi", fields: ["id", "numero", "anno", "data", "cliente_nome", "oggetto", "imponibile", "iva_totale", "totale", "stato", "note", "data_invio", "inviato_a", "firma_cliente_url", "data_firma_cliente", "created_date"] },
  { name: "Worksite", label: "Lavori", fields: ["id", "nome", "indirizzo", "attivo", "cliente_nome", "note", "created_date"] },
  { name: "WorksiteTransaction", label: "Movimenti_Lavori", fields: ["id", "worksite_nome", "tipo", "categoria", "descrizione", "importo", "data", "fornitore", "created_date"] },
  { name: "Employee", label: "Dipendenti", fields: ["id", "nome", "cognome", "codice_fiscale", "data_nascita", "ruolo", "data_assunzione", "tipo_contratto", "telefono", "email", "created_date"] },
  { name: "EmployeeDocument", label: "Documenti_Dipendenti", fields: ["id", "dipendente_id", "tipo", "titolo", "descrizione", "data_emissione", "data_scadenza", "file_url", "created_date"] },
  { name: "CompanyDocument", label: "Documenti_Ditta", fields: ["id", "tipo", "titolo", "descrizione", "data_emissione", "data_scadenza", "file_url", "created_date"] },
  { name: "Reminder", label: "Promemoria", fields: ["id", "titolo", "descrizione", "data", "ora", "tipo", "completato", "created_date"] },
  { name: "GeneratedContract", label: "Contratti_Generati", fields: ["id", "tipo", "titolo", "controparte_nome", "data_creazione", "created_date"] },
];

export default function BackupExport() {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setExporting(true);
    try {
      for (const cfg of ENTITY_CONFIG) {
        const records = await db[cfg.name].list("-created_date", 500);
        if (records.length === 0) continue;
        const csv = toCSV(records, cfg.fields);
        const date = new Date().toISOString().slice(0, 10);
        downloadCSV(`${date}_${cfg.label}.csv`, csv);
        await new Promise(r => setTimeout(r, 300));
      }
      toast({ title: "Export completato", description: "Tutti i dati scaricati in formato CSV" });
    } catch (e) {
      toast({ title: "Errore export", variant: "destructive" });
    } finally { setExporting(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mt-5">
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-slate-700">Backup ed Esportazione</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Scarica tutti i dati dell'app (contatti, preventivi, lavori, dipendenti, documenti, promemoria, contratti) in formato CSV.
        Utile come backup di sicurezza o da consegnare al commercialista.
      </p>
      <Button onClick={handleExport} disabled={exporting} className="bg-blue-600 hover:bg-blue-700 gap-2">
        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {exporting ? "Esportazione in corso…" : "Esporta tutti i dati (CSV)"}
      </Button>
      <p className="text-xs text-slate-400 mt-2">Verranno scaricati singoli file CSV per ogni categoria di dati.</p>
    </div>
  );
}