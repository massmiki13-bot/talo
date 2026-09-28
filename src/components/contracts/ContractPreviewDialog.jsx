import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, ArrowLeft, Check } from "lucide-react";
import { buildContractDoc } from "@/utils/docExportUtils";

export default function ContractPreviewDialog({
  open, onOpenChange, contract, profile,
  mode = "saved",
  onConfirm,
}) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !contract || !profile) {
      setPdfUrl(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setPdfUrl(null);
    let cancelled = false;
    let createdUrl = null;
    buildContractDoc(contract, profile)
      .then(doc => {
        if (cancelled) return;
        const blob = doc.output("blob");
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, contract, profile]);

  const handleDownload = async () => {
    const doc = await buildContractDoc(contract, profile);
    doc.save(`Contratto_${(contract.titolo || "").replace(/[^a-zA-Z0-9_\-]/g, "_")}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col overflow-hidden gap-2">
        <DialogHeader>
          <DialogTitle>{mode === "preview" ? "Anteprima Contratto" : (contract?.titolo || "Contratto")}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-brand-600 rounded-full animate-spin"></div>
            </div>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full border-0" title="Anteprima Contratto" />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Nessuna anteprima disponibile
            </div>
          )}
        </div>
        <DialogFooter className="flex-shrink-0">
          {mode === "preview" ? (
            <>
              <span className="text-xs text-slate-500 mr-auto hidden sm:inline">
                L'anteprima mostra il documento esattamente come sarà nel PDF finale.
              </span>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <ArrowLeft className="w-4 h-4" /> Torna alla modifica
              </Button>
              <Button onClick={() => { onConfirm?.(); }} className="bg-brand-600 hover:bg-brand-700">
                <Check className="w-4 h-4" /> Conferma e salva
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
              <Button onClick={handleDownload} className="bg-brand-600 hover:bg-brand-700">
                <FileDown className="w-4 h-4" /> Scarica PDF
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}