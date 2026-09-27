import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ChevronDown, ChevronUp, Loader2, FileSignature } from "lucide-react";
import { jsPDF } from "jspdf";

function stripHtml(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

export default function ContractCard({ contract }) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const content = stripHtml(contract.contenuto_finale);
  const preview = content.slice(0, 400);
  const hasMore = content.length > 400;

  const handleDownload = () => {
    setDownloading(true);
    try {
      const pdf = new jsPDF();
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;
      const lineHeight = 5;
      let y = margin;

      pdf.setFontSize(14);
      pdf.setFont(undefined, "bold");
      const titleLines = pdf.splitTextToSize(contract.titolo || "Contratto", maxWidth);
      titleLines.forEach(line => {
        if (y > pageHeight - margin) { pdf.addPage(); y = margin; }
        pdf.text(line, margin, y);
        y += lineHeight;
      });
      y += 3;

      pdf.setFontSize(10);
      pdf.setFont(undefined, "normal");
      if (contract.tipo) { pdf.text(`Tipo: ${contract.tipo}`, margin, y); y += lineHeight; }
      if (contract.controparte_nome) { pdf.text(`Controparte: ${contract.controparte_nome}`, margin, y); y += lineHeight; }
      if (contract.data_creazione) { pdf.text(`Data: ${new Date(contract.data_creazione).toLocaleDateString("it-IT")}`, margin, y); y += lineHeight; }
      y += 3;

      pdf.setFontSize(10);
      const contentLines = pdf.splitTextToSize(content, maxWidth);
      contentLines.forEach(line => {
        if (y > pageHeight - margin) { pdf.addPage(); y = margin; }
        pdf.text(line, margin, y);
        y += lineHeight;
      });

      pdf.save(`${contract.titolo || "contratto"}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 bg-purple-50 border-b border-purple-100">
        <div className="flex items-center gap-2 min-w-0">
          <FileSignature className="w-4 h-4 text-purple-600 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-800 truncate">{contract.titolo}</span>
        </div>
        {contract.data_creazione && (
          <span className="text-xs text-slate-400 flex-shrink-0">{new Date(contract.data_creazione).toLocaleDateString("it-IT")}</span>
        )}
      </div>

      <div className="px-3 py-2">
        {contract.tipo && <p className="text-xs text-slate-500">Tipo: {contract.tipo}</p>}
        {contract.controparte_nome && <p className="text-xs text-slate-500">Controparte: {contract.controparte_nome}</p>}

        <div className="mt-2 text-sm text-slate-700 bg-slate-50 rounded p-2 max-h-64 overflow-y-auto whitespace-pre-wrap">
          {expanded ? content : preview}
          {hasMore && !expanded && <span className="text-slate-400">...</span>}
        </div>

        {hasMore && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-600 hover:underline mt-1 flex items-center gap-1">
            {expanded ? <><ChevronUp className="w-3 h-3" /> Mostra meno</> : <><ChevronDown className="w-3 h-3" /> Mostra tutto</>}
          </button>
        )}

        <div className="flex justify-end mt-2">
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading} className="h-7 text-xs gap-1">
            {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Scarica PDF
          </Button>
        </div>
      </div>
    </div>
  );
}