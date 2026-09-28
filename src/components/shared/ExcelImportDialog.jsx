import React, { useRef, useState } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Loader2, FileSpreadsheet, Download, AlertTriangle } from "lucide-react";
import { parseCsv } from "@/lib/csv";
import { readSheet } from "@/lib/prezzari";
import { IMPORTERS, parseRows } from "@/lib/importers";

// Importazione da Excel (xlsx, xls, ods) o CSV di clienti, dipendenti o lavori.
export default function ExcelImportDialog({ kind, open, onOpenChange, existing = [], context = {}, onDone }) {
  const cfg = IMPORTERS[kind];
  const { toast } = useToast();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState("");
  const inputRef = useRef(null);

  const reset = () => { setRows(null); setFileName(""); };

  const readFile = async (file) => {
    setBusy("read");
    try {
      const table = /\.csv$/i.test(file.name) ? parseCsv(await file.text()) : (await readSheet(file)).rows;
      const parsed = parseRows(kind, table, { existing, ...context });
      if (!parsed) return toast({ title: "Colonne non riconosciute", description: `Serve ${cfg.requiredHint}. Scarica il modello per vedere il formato.`, variant: "destructive" });
      if (!parsed.length) return toast({ title: "Il file non contiene righe da importare", variant: "destructive" });
      setRows(parsed); setFileName(file.name);
    } catch (e) {
      toast({ title: "File non leggibile", description: e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([cfg.template.headers, cfg.template.example]);
    ws["!cols"] = cfg.template.headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dati");
    XLSX.writeFile(wb, cfg.template.name);
  };

  const doImport = async () => {
    const good = rows.filter((r) => !r.skip).map((r) => r.data);
    if (!good.length) return;
    setBusy("import");
    try {
      for (let i = 0; i < good.length; i += 100) await db[cfg.entity].bulkCreate(good.slice(i, i + 100));
      toast({ title: `${good.length} ${cfg.label} importati` });
      onDone?.(good.length);
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({ title: "Importazione non riuscita", description: e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const importable = rows?.filter((r) => !r.skip).length || 0;
  const warnings = rows?.filter((r) => !r.skip && r.issues.length).length || 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importa {cfg.label}</DialogTitle>
          <DialogDescription>Da un file Excel (.xlsx, .xls), OpenOffice (.ods) o CSV: dal vecchio gestionale, dal commercialista o da un tuo foglio.</DialogDescription>
        </DialogHeader>
        {!rows ? (
          <div className="space-y-4">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={!!busy}
              className="w-full rounded-2xl border-2 border-dashed border-zinc-300 hover:border-brand-400 hover:bg-brand-50/40 p-8 text-center transition-colors">
              {busy === "read" ? <Loader2 className="w-10 h-10 text-zinc-400 mx-auto mb-2 animate-spin" /> : <FileSpreadsheet className="w-10 h-10 text-zinc-400 mx-auto mb-2" aria-hidden="true" />}
              <p className="font-medium text-zinc-900">Scegli il file</p>
              <p className="text-sm text-zinc-500 mt-1">Le colonne vengono riconosciute dai nomi (es. {cfg.template.headers.slice(0, 3).join(", ")}…); quelle in più vengono ignorate.</p>
            </button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods,.csv,text/csv" className="hidden" aria-label="File da importare" onChange={(e) => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ""; }} />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadTemplate}><Download className="w-4 h-4" /> Scarica il modello Excel</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-700">
              <span className="text-zinc-500">{fileName}:</span> <strong>{importable}</strong> {cfg.label} pronti
              {rows.length - importable > 0 && <>, <strong>{rows.length - importable}</strong> saltati (senza nome o già presenti)</>}.
            </p>
            {warnings > 0 && <p className="text-xs text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />{warnings} righe hanno dati da controllare: vengono importate lo stesso, potrai correggerle dopo.</p>}
            <div className="max-h-[45vh] overflow-auto rounded-xl border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 sticky top-0">
                  <tr className="text-left text-xs text-zinc-500">
                    {cfg.preview.map(([h]) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.skip ? "bg-zinc-50 text-zinc-400" : ""}>
                      {cfg.preview.map(([h, fn]) => <td key={h} className={`px-3 py-1.5 ${r.skip ? "line-through" : ""}`}>{fn(r.data) || "—"}</td>)}
                      <td className="px-3 py-1.5 text-xs text-amber-800">{r.issues.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Scegli un altro file</Button>
              <Button onClick={doImport} disabled={!!busy || !importable} className="gap-1.5 bg-brand-600 hover:bg-brand-700">
                {busy === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Importa {importable}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
