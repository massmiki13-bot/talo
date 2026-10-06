import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FileText, Layers, ListChecks, FileSpreadsheet } from "lucide-react";

const VARIANTS = [
  {
    key: "sintetica",
    label: "Sintetica",
    icon: FileText,
    description: "L'essenziale: giorni, ore per giorno e totale del mese. Compatta e immediata.",
    includes: ["Giorni del mese", "Ore per giorno", "Totale ore"],
  },
  {
    key: "media",
    label: "Media",
    icon: Layers,
    description: "Livello intermedio: ore per giorno, totale e suddivisione delle ore per cantiere.",
    includes: ["Tutto della sintetica", "Stato presenze", "Suddivisione per cantiere"],
  },
  {
    key: "dettagliata",
    label: "Dettagliata",
    icon: ListChecks,
    description: "Massimo dettaglio: cantiere per ogni giornata, riepilogo ore, stato presenze e costi manodopera.",
    includes: ["Tutto della media", "Riepilogo per cantiere", "Conteggio stati", "Costo orario e totale"],
  },
];

export default function ExportVariantDialog({ open, title, onClose, onSelect, loading, canSeeCosts = true }) {
  const [includeCosts, setIncludeCosts] = useState(true);
  const [format, setFormat] = useState("pdf");

  useEffect(() => {
    if (open) { setIncludeCosts(true); setFormat("pdf"); }
  }, [open]);

  const handleSelect = (variant) => {
    onSelect(variant, canSeeCosts ? includeCosts : false, format);
  };

  const handleExcelExport = () => {
    onSelect("dettagliata", canSeeCosts ? includeCosts : false, "excel");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title || "Esporta riepilogo ore"}</DialogTitle>
          <DialogDescription>Scegli il formato e il livello di dettaglio da esportare</DialogDescription>
        </DialogHeader>

        {/* Format selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setFormat("pdf")}
            className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-colors ${format === "pdf" ? "border-red-500 bg-red-50/50" : "border-zinc-200 hover:bg-zinc-50"}`}
          >
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-red-700" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-zinc-800">PDF</p>
              <p className="text-[11px] text-zinc-500">Pronto da stampare o inviare</p>
            </div>
          </button>
          <button
            onClick={() => setFormat("excel")}
            className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-colors ${format === "excel" ? "border-green-500 bg-green-50/50" : "border-zinc-200 hover:bg-zinc-50"}`}
          >
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-green-700" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-zinc-800">Excel (.xls)</p>
              <p className="text-[11px] text-zinc-500">Rielaborare i dati</p>
            </div>
          </button>
        </div>

        {canSeeCosts && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-800">Includi importi economici</p>
              <p className="text-xs text-zinc-500">Costo orario, costo manodopera e totali in euro</p>
            </div>
            <Switch checked={includeCosts} onCheckedChange={setIncludeCosts} />
          </div>
        )}

        {format === "pdf" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
              {VARIANTS.map(v => {
                const Icon = v.icon;
                const filteredIncludes = canSeeCosts ? v.includes : v.includes.filter(i => !i.toLowerCase().includes("costo"));
                return (
                  <button key={v.key} disabled={loading}
                    onClick={() => handleSelect(v.key)}
                    className="text-left p-4 rounded-xl border-2 border-zinc-200 hover:border-brand-500 hover:bg-brand-50/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait flex flex-col gap-2">
                    <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-brand-600" />
                    </div>
                    <h3 className="font-semibold text-zinc-900 text-sm">{v.label}</h3>
                    <p className="text-xs text-zinc-500 leading-snug">{v.description}</p>
                    <ul className="text-[11px] text-zinc-500 space-y-0.5 mt-1">
                      {filteredIncludes.map((inc, i) => <li key={i} className="flex items-center gap-1"><span className="text-brand-400">•</span>{inc}</li>)}
                    </ul>
                  </button>
                );
              })}
            </div>
            {!canSeeCosts && (
              <p className="text-xs text-zinc-500 text-center">Il PDF verra generato senza importi economici.</p>
            )}
          </>
        ) : (
          <div className="mt-2 space-y-3">
            <div className="rounded-xl border-2 border-zinc-200 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900 text-sm">Foglio di calcolo Excel</h3>
                <p className="text-xs text-zinc-500 leading-snug mt-1">
                  Esporta il tabellone completo con tutti i dipendenti, i giorni del mese, le ore giornaliere,
                  i totali e la suddivisione per cantiere. I dati sono modificabili e rielaborabili in Excel o LibreOffice.
                </p>
                <ul className="text-[11px] text-zinc-500 space-y-0.5 mt-2">
                  <li className="flex items-center gap-1"><span className="text-green-400">•</span>Matrice dipendenti x giorni</li>
                  <li className="flex items-center gap-1"><span className="text-green-400">•</span>Totali per dipendente e per giorno</li>
                  {canSeeCosts && includeCosts && <li className="flex items-center gap-1"><span className="text-green-400">•</span>Costi manodopera</li>}
                </ul>
              </div>
            </div>
            <Button onClick={handleExcelExport} disabled={loading} className="w-full gap-2 bg-green-600 hover:bg-green-700">
              <FileSpreadsheet className="w-4 h-4" /> {loading ? "Generazione..." : "Esporta Excel"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}