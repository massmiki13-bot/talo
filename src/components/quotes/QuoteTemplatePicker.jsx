import React, { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Send, FileDown, FileText, Sparkles, Minus, Briefcase, Star, FileType, FileSpreadsheet, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

const TEMPLATE_ICONS = {
  classica: FileText,
  moderna: Sparkles,
  minimal: Minus,
  professionale: Briefcase,
  elegante: Star,
};

export default function QuoteTemplatePicker({
  open,
  onOpenChange,
  templates,
  selectedTemplate,
  onSelectTemplate,
  onAction,
  previewUrl,
  generating,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Scegli il modello del preventivo</DialogTitle>
          <p className="text-sm text-slate-500 font-normal">
            Anteprima con i tuoi dati reali. Seleziona il modello che preferisci, poi conferma per scaricare o inviare.
          </p>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row gap-4 flex-1 overflow-hidden">
          {/* Template cards */}
          <div ref={scrollRef} className="lg:w-64 flex-shrink-0 space-y-2 overflow-y-auto max-h-[200px] lg:max-h-none">
            {templates.map((t) => {
              const Icon = TEMPLATE_ICONS[t.id] || FileText;
              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTemplate(t.id)}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedTemplate === t.id
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      selectedTemplate === t.id ? "bg-brand-100" : "bg-slate-100"
                    }`}>
                      <Icon className={`w-4 h-4 ${selectedTemplate === t.id ? "text-brand-600" : "text-slate-500"}`} />
                    </div>
                    <p className="text-sm font-medium text-slate-900">{t.nome}</p>
                    {selectedTemplate === t.id && <Check className="w-4 h-4 text-brand-600 ml-auto" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">{t.descrizione}</p>
                </div>
              );
            })}
          </div>

          {/* Preview */}
          <div className="flex-1 rounded-lg border border-slate-200 bg-slate-100 min-h-[300px] overflow-hidden">
            {generating ? (
              <div className="flex flex-col items-center justify-center h-full py-16 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                <p className="text-sm text-slate-500">Generazione anteprima...</p>
              </div>
            ) : previewUrl ? (
              <iframe src={previewUrl} className="w-full h-full min-h-[400px]" title="Anteprima preventivo" />
            ) : (
              <div className="flex items-center justify-center h-full py-16 text-slate-500 text-sm">
                Seleziona un modello per vedere l'anteprima
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-2">
            Annulla
          </Button>
          <div className="flex gap-2 flex-1 sm:flex-none">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!previewUrl || generating}
                  className="gap-2 flex-1 sm:flex-none"
                >
                  <FileDown className="w-4 h-4" /> Scarica <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onAction(selectedTemplate, "download_pdf")}>
                  <FileText className="w-4 h-4 mr-2 text-red-700" /> PDF
                  <span className="ml-auto text-xs text-slate-500">Pronto da inviare</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction(selectedTemplate, "download_word")}>
                  <FileType className="w-4 h-4 mr-2 text-brand-600" /> Word (.doc)
                  <span className="ml-auto text-xs text-slate-500">Modificabile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction(selectedTemplate, "download_excel")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-green-700" /> Excel (.xls)
                  <span className="ml-auto text-xs text-slate-500">Tabelle e calcoli</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => onAction(selectedTemplate, "send")}
              disabled={!previewUrl || generating}
              className="gap-2 flex-1 sm:flex-none"
            >
              <Send className="w-4 h-4" /> Invia via email
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}