import React, { useState, useRef } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Loader2, FileSpreadsheet, Download } from "lucide-react";
import { parseCsv, downloadCsv } from "@/lib/csv";
import { findDuplicates } from "@/lib/contacts";
import { validateContact } from "@/lib/validators";

// Intestazioni riconosciute (in minuscolo, senza accenti/spazi) → campo.
const COLUMN_MAP = {
  tipo: "tipo", ragionesociale: "nome", denominazione: "nome", azienda: "nome", societa: "nome",
  nome: "nome_privato", nomecognome: "nome_privato", cognomenome: "nome_privato", referente: "nome_privato",
  partitaiva: "partita_iva", piva: "partita_iva", pi: "partita_iva",
  codicefiscale: "codice_fiscale", cf: "codice_fiscale",
  indirizzo: "indirizzo", via: "indirizzo", cap: "cap", citta: "citta", comune: "citta", localita: "citta",
  provincia: "provincia", prov: "provincia", telefono: "telefono", tel: "telefono", cellulare: "cellulare",
  email: "email", mail: "email", pec: "pec", sdi: "codice_sdi", codicesdi: "codice_sdi", codicedestinatario: "codice_sdi",
  iban: "iban", note: "note", categoria: "categorie", categorie: "categorie",
};

const TEMPLATE_HEADERS = ["Tipo", "Ragione sociale", "Nome", "Partita IVA", "Codice fiscale", "Indirizzo", "CAP", "Città", "Provincia", "Telefono", "Cellulare", "Email", "PEC", "Codice SDI", "IBAN", "Categorie", "Note"];

const key = (h) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

export default function ContactImportDialog({ open, onOpenChange, existing = [], onDone }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(null); // [{ data, issues[] }]
  const [importing, setImporting] = useState(false);
  const inputRef = useRef(null);

  const reset = () => setRows(null);

  const readFile = async (file) => {
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) {
      toast({ title: "Il file non contiene righe da importare", variant: "destructive" });
      return;
    }
    const cols = table[0].map((h) => COLUMN_MAP[key(h)] || null);
    if (!cols.includes("nome") && !cols.includes("nome_privato")) {
      toast({ title: "Colonna del nome non trovata", description: "Serve una colonna \"Ragione sociale\" o \"Nome\". Scarica il modello per vedere il formato.", variant: "destructive" });
      return;
    }
    const seen = [...existing];
    const parsed = table.slice(1).map((r) => {
      const data = { tipo: "cliente", categorie: [] };
      cols.forEach((field, i) => {
        const v = (r[i] || "").trim();
        if (!field || !v) return;
        if (field === "categorie") data.categorie = v.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
        else if (field === "tipo") data.tipo = /forn/i.test(v) ? "fornitore" : /entramb/i.test(v) ? "entrambi" : "cliente";
        else data[field] = v;
      });
      data.tipo_soggetto = data.nome ? "azienda" : "privato";
      const issues = [];
      if (!data.nome && !data.nome_privato) issues.push("nome mancante");
      issues.push(...Object.values(validateContact(data)));
      const dup = findDuplicates(seen, data);
      if (dup.length) issues.push(`doppione (${dup[0].field})`);
      seen.push(data);
      return { data, issues, skip: !data.nome && !data.nome_privato || dup.length > 0 };
    });
    setRows(parsed);
  };

  const doImport = async () => {
    const good = rows.filter((r) => !r.skip).map((r) => r.data);
    if (!good.length) return;
    setImporting(true);
    try {
      for (let i = 0; i < good.length; i += 100) await db.Contact.bulkCreate(good.slice(i, i + 100));
      toast({ title: `${good.length} contatti importati` });
      onDone?.();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const importable = rows?.filter((r) => !r.skip).length || 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa clienti e fornitori</DialogTitle>
          <DialogDescription>Da un file CSV esportato da Excel, dal vecchio gestionale o dalla rubrica.</DialogDescription>
        </DialogHeader>
        {!rows ? (
          <div className="space-y-4">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/40 p-8 text-center transition-colors">
              <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="font-medium text-slate-800">Scegli il file CSV</p>
              <p className="text-sm text-slate-500 mt-1">In Excel: File → Salva con nome → CSV (delimitato dal separatore di elenco)</p>
            </button>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ""; }} />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => downloadCsv("modello-contatti-talo.csv", TEMPLATE_HEADERS, [["Cliente", "Edil Verdi Srl", "", "01234567890", "", "Via Roma 1", "39100", "Bolzano", "BZ", "0471 123456", "", "info@edilverdi.it", "", "ABC1234", "", "Impresa", ""]])}>
              <Download className="w-4 h-4" /> Scarica il modello
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              <strong>{importable}</strong> contatti pronti da importare
              {rows.length - importable > 0 && <>, <strong>{rows.length - importable}</strong> saltati (senza nome o già presenti)</>}.
            </p>
            <div className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-3 py-2">Nome</th><th className="px-3 py-2">P.IVA / CF</th><th className="px-3 py-2">Città</th><th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.skip ? "bg-slate-50 text-slate-400 line-through" : ""}>
                      <td className="px-3 py-1.5">{r.data.nome || r.data.nome_privato || "—"}</td>
                      <td className="px-3 py-1.5">{r.data.partita_iva || r.data.codice_fiscale || ""}</td>
                      <td className="px-3 py-1.5">{r.data.citta || ""}</td>
                      <td className="px-3 py-1.5 text-xs text-amber-700 no-underline">{r.issues.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Scegli un altro file</Button>
              <Button onClick={doImport} disabled={importing || !importable} className="gap-1.5">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Importa {importable}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
