import React, { useState, useEffect } from "react";
import { db, api } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, FileText, Check } from "lucide-react";
import { generateQuotePDF } from "@/utils/quoteTemplates";
import { UNIT_OPTIONS, calcQuote, chapterTotals, conditionsText, rowTotal } from "@/lib/quotes";
import { generateContractPDFBlob } from "@/utils/docExportUtils";

// Stesso contesto dell'editor: capitoli, voci opzionali e condizioni inclusi.
function buildQuoteCtx(quote, profile, client) {
  const righe = quote.righe || [];
  return {
    profile, quote, righe,
    totals: calcQuote(righe, quote),
    chapters: chapterTotals(righe),
    conditions: conditionsText(quote),
    selectedClient: client,
    clienteFirma: quote.firma_cliente_url,
    unitOptions: UNIT_OPTIONS,
    calcRowTotal: rowTotal,
  };
}

export default function DocumentPickerDialog({ open, onOpenChange, onSelect, profile, selectedUrls = [] }) {
  const [tab, setTab] = useState("documenti_ditta");
  const [loading, setLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);
  const [data, setData] = useState({
    documenti_ditta: [],
    dipendenti: [],
    preventivi: [],
    contratti: [],
    ricevuti: [],
  });
  const { toast } = useToast();

  useEffect(() => {
    if (open) loadAll();
  }, [open]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [docs, empDocs, quotes, contracts, received, employees] = await Promise.all([
        db.CompanyDocument.list("-updated_date", 100),
        db.EmployeeDocument.list("-updated_date", 100),
        db.Quote.list("-updated_date", 50),
        db.GeneratedContract.list("-created_date", 50),
        db.ReceivedQuote.list("-updated_date", 50),
        db.Employee.list("-updated_date", 100),
      ]);

      const empMap = new Map(employees.map(e => [e.id, e]));
      const empDocsWithName = empDocs.map(d => {
        const emp = empMap.get(d.dipendente_id);
        return {
          ...d,
          dipendente_nome: emp ? `${emp.nome || ""} ${emp.cognome || ""}`.trim() : "",
        };
      });

      setData({
        documenti_ditta: docs,
        dipendenti: empDocsWithName,
        preventivi: quotes,
        contratti: contracts,
        ricevuti: received,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (doc, type) => {
    if (doc.file_url) {
      if (selectedUrls.includes(doc.file_url)) return;
      const name = doc.titolo || doc.descrizione || doc.fornitore || "documento";
      onSelect({ url: doc.file_url, name });
      return;
    }

    setGeneratingId(doc.id);
    try {
      let blob, filename;
      if (type === "preventivi") {
        let client = null;
        if (doc.cliente_id) {
          try { client = await db.Contact.get(doc.cliente_id); } catch (e) { /* ignore */ }
        }
        const ctx = buildQuoteCtx(doc, profile, client);
        blob = await generateQuotePDF(doc.template_variante || "classica", ctx);
        filename = `Preventivo_${doc.numero || "bozza"}.pdf`;
      } else if (type === "contratti") {
        blob = await generateContractPDFBlob(doc, profile);
        filename = `Contratto_${(doc.titolo || "").replace(/[^a-zA-Z0-9_\-]/g, "_")}.pdf`;
      }

      if (blob) {
        const file = new File([blob], filename, { type: "application/pdf" });
        const result = await api.integrations.Core.UploadFile({ file, private: true });
        onSelect({ url: result.file_url, name: filename });
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Errore generazione documento", variant: "destructive" });
    } finally {
      setGeneratingId(null);
    }
  };

  const renderDocList = (items, type) => {
    if (loading) {
      return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
    }
    if (!items || items.length === 0) {
      return <p className="text-sm text-zinc-500 text-center py-8">Nessun documento disponibile</p>;
    }
    return (
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {items.map(doc => {
          const isSelected = doc.file_url && selectedUrls.includes(doc.file_url);
          const isGenerating = generatingId === doc.id;
          return (
            <button
              key={doc.id}
              onClick={() => !isSelected && !isGenerating && handleSelect(doc, type)}
              disabled={isSelected || isGenerating}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
                isSelected ? "bg-green-50 cursor-default" : "hover:bg-brand-50"
              } ${isGenerating ? "opacity-50" : ""}`}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin text-brand-500 flex-shrink-0" />
              ) : isSelected ? (
                <Check className="w-4 h-4 text-green-700 flex-shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-700 truncate">
                  {doc.titolo || doc.descrizione || doc.fornitore || "Senza titolo"}
                </p>
                {(doc.dipendente_nome || doc.data || doc.numero) && (
                  <p className="text-xs text-zinc-500">
                    {doc.dipendente_nome && `${doc.dipendente_nome} · `}
                    {doc.numero && `N. ${doc.numero} · `}
                    {doc.data && new Date(doc.data).toLocaleDateString("it-IT")}
                  </p>
                )}
              </div>
              {doc.file_url && !isSelected && (
                <span className="text-[10px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">file</span>
              )}
              {!doc.file_url && !isSelected && !isGenerating && (
                <span className="text-[10px] text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded">PDF</span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Aggiungi documento dall'app</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="documenti_ditta" className="text-xs">Doc. Ditta</TabsTrigger>
            <TabsTrigger value="dipendenti" className="text-xs">Dipendenti</TabsTrigger>
            <TabsTrigger value="preventivi" className="text-xs">Preventivi</TabsTrigger>
            <TabsTrigger value="contratti" className="text-xs">Contratti</TabsTrigger>
            <TabsTrigger value="ricevuti" className="text-xs">Ricevuti</TabsTrigger>
          </TabsList>
          <TabsContent value="documenti_ditta" className="mt-4">
            {renderDocList(data.documenti_ditta, "documenti_ditta")}
          </TabsContent>
          <TabsContent value="dipendenti" className="mt-4">
            {renderDocList(data.dipendenti, "dipendenti")}
          </TabsContent>
          <TabsContent value="preventivi" className="mt-4">
            {renderDocList(data.preventivi, "preventivi")}
          </TabsContent>
          <TabsContent value="contratti" className="mt-4">
            {renderDocList(data.contratti, "contratti")}
          </TabsContent>
          <TabsContent value="ricevuti" className="mt-4">
            {renderDocList(data.ricevuti, "ricevuti")}
          </TabsContent>
        </Tabs>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}