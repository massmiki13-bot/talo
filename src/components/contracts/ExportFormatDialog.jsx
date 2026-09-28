import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, FileType } from "lucide-react";

export default function ExportFormatDialog({ open, onOpenChange, contract, onExportPDF, onExportWord }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Esporta Contratto</DialogTitle>
          <DialogDescription>
            Scegli il formato di esportazione per "{contract?.titolo || ""}"
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button
            variant="outline"
            className="h-auto py-4 justify-start gap-3 border-slate-200 hover:border-red-300 hover:bg-red-50"
            onClick={() => { onExportPDF(contract); onOpenChange(false); }}
          >
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-800">PDF</div>
              <div className="text-xs text-slate-500">Pronto da inviare o stampare</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-auto py-4 justify-start gap-3 border-slate-200 hover:border-brand-300 hover:bg-brand-50"
            onClick={() => { onExportWord(contract); onOpenChange(false); }}
          >
            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
              <FileType className="w-5 h-5 text-brand-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-800">Word (.doc)</div>
              <div className="text-xs text-slate-500">Modificabile in Word o LibreOffice</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}