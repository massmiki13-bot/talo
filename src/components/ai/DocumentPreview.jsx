import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Download, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { jsPDF } from "jspdf";
import { getExpirationStatus } from "@/utils/expirationReminders";

export const DOC_TYPE_LABELS = {
  contratto: "Contratto",
  corso: "Corso/Attestato",
  visita_medica: "Visita Medica",
  documento_identita: "Documento d'Identità",
  altro: "Altro",
};

function getFileExt(url) {
  if (!url) return "";
  const match = url.match(/\.(\w+)(\?|$)/);
  return match ? match[1].toLowerCase() : "";
}

function isImage(url) {
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(getFileExt(url));
}

function isPdf(url) {
  return getFileExt(url) === "pdf";
}

export default function DocumentPreview({ doc }) {
  const [downloading, setDownloading] = useState(false);
  const url = doc.file_url;
  if (!url) return null;

  const ext = getFileExt(url);
  const imageType = isImage(url);
  const pdfType = isPdf(url);

  const handleDownload = async () => {
    if (pdfType) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.titolo || "documento"}.pdf`;
      a.target = "_blank";
      a.click();
      return;
    }
    if (imageType) {
      setDownloading(true);
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const pdf = new jsPDF();
          const pageWidth = 210;
          const pageHeight = 297;
          const margin = 10;
          const maxW = pageWidth - margin * 2;
          const maxH = pageHeight - margin * 2;
          let w = img.width;
          let h = img.height;
          const ratio = w / h;
          if (w > maxW) { w = maxW; h = w / ratio; }
          if (h > maxH) { h = maxH; w = h * ratio; }
          const x = (pageWidth - w) / 2;
          const y = margin;
          const format = ext === "png" ? "PNG" : "JPEG";
          pdf.addImage(img, format, x, y, w, h);
          pdf.save(`${doc.titolo || "documento"}.pdf`);
          setDownloading(false);
        };
        img.onerror = () => {
          const a = document.createElement("a");
          a.href = url;
          a.download = doc.titolo || "documento";
          a.click();
          setDownloading(false);
        };
        img.src = url;
      } catch {
        setDownloading(false);
      }
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.titolo || "documento";
    a.click();
  };

  const scadenza = doc.data_scadenza;
  const _scadStatus = getExpirationStatus(scadenza);
  const isExpired = _scadStatus === "expired";
  const isExpiringSoon = _scadStatus === "expiring_soon";

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
            {DOC_TYPE_LABELS[doc.tipo] || doc.tipo || "Documento"}
          </span>
          <span className="text-sm font-medium text-slate-800 truncate">{doc.titolo}</span>
        </div>
        {(isExpired || isExpiringSoon) && (
          <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${isExpired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
            <AlertTriangle className="w-3 h-3" />
            {isExpired ? "Scaduto" : "In scadenza"}
          </span>
        )}
      </div>

      <div className="bg-slate-100 flex items-center justify-center">
        {imageType ? (
          <img src={url} alt={doc.titolo} className="max-w-full max-h-[400px] object-contain" />
        ) : pdfType ? (
          <iframe src={url} className="w-full" style={{ height: "400px", border: "none" }} title={doc.titolo} />
        ) : (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Anteprima non disponibile</p>
          </div>
        )}
      </div>

      <div className="px-3 py-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-3 text-xs text-slate-500">
          {doc.data_emissione && <span>Emissione: {new Date(doc.data_emissione).toLocaleDateString("it-IT")}</span>}
          {scadenza && <span className={isExpired ? "text-red-600 font-medium" : ""}>Scadenza: {new Date(scadenza).toLocaleDateString("it-IT")}</span>}
        </div>
        <div className="flex gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <ExternalLink className="w-3 h-3" /> Apri
          </a>
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading} className="h-7 text-xs gap-1">
            {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Scarica PDF
          </Button>
        </div>
      </div>
    </div>
  );
}