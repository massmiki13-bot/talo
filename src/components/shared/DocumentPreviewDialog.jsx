import React, { useState } from "react";
import { files } from "@/api/client";
import { useFileUrl } from "@/lib/privateFiles";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";

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

export async function downloadAsPdf(fileUrl, filename) {
  const url = await files.signed(fileUrl);
  const ext = getFileExt(fileUrl);
  const name = (filename || "documento").replace(/\.[^.]+$/, "");

  if (isPdf(fileUrl)) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.pdf`;
    a.target = "_blank";
    a.click();
    return;
  }
  if (isImage(fileUrl)) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const pdf = new jsPDF();
        const pageWidth = 210, pageHeight = 297, margin = 10;
        const maxW = pageWidth - margin * 2, maxH = pageHeight - margin * 2;
        let w = img.width, h = img.height;
        const ratio = w / h;
        if (w > maxW) { w = maxW; h = w / ratio; }
        if (h > maxH) { h = maxH; w = h * ratio; }
        const x = (pageWidth - w) / 2;
        const y = margin;
        const format = ext === "png" ? "PNG" : "JPEG";
        pdf.addImage(img, format, x, y, w, h);
        pdf.save(`${name}.pdf`);
        resolve();
      };
      img.onerror = () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        resolve();
      };
      img.src = url;
    });
  }
  // Fallback: direct download
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function DocumentPreviewDialog({ open, onOpenChange, fileUrl, titolo }) {
  const [downloading, setDownloading] = useState(false);
  const viewUrl = useFileUrl(open ? fileUrl : null);
  if (!fileUrl) return null;

  const imageType = isImage(fileUrl);
  const pdfType = isPdf(fileUrl);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAsPdf(fileUrl, titolo);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">{titolo || "Anteprima documento"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-slate-100 rounded-lg flex items-center justify-center min-h-[300px]">
          {imageType ? (
            <img src={viewUrl || undefined} alt={titolo} className="max-w-full max-h-[60vh] object-contain" />
          ) : pdfType ? (
            <iframe src={viewUrl || undefined} className="w-full" style={{ height: "60vh", border: "none" }} title={titolo} />
          ) : (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Anteprima non disponibile per questo formato</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
          <Button onClick={handleDownload} disabled={downloading} className="gap-1.5">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Scarica PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}