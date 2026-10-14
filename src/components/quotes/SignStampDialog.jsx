import React, { useState, useRef, useEffect } from "react";
import { api, db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, FileCheck, Download, Send, ChevronLeft, ChevronRight } from "lucide-react";
import EmailComposer from "@/components/shared/EmailComposer";
import { PDFDocument } from "pdf-lib";

function detectImageFormat(url) {
  if (url.match(/\.(png)$/i)) return "png";
  if (url.match(/\.(jpe?g)$/i)) return "jpg";
  return "png";
}

async function embedImage(pdfDoc, url) {
  const bytes = await fetch(url).then(r => r.arrayBuffer());
  const fmt = detectImageFormat(url);
  if (fmt === "jpg") return await pdfDoc.embedJpg(bytes);
  try { return await pdfDoc.embedPng(bytes); } catch { return await pdfDoc.embedJpg(bytes); }
}

async function loadImageFromUrl(url) {
  const blob = await fetch(url).then(r => r.blob());
  const objUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.src = objUrl;
  await img.decode();
  return { img, objUrl, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
}

export default function SignStampDialog({ open, onOpenChange, receivedQuote, profile, onSaved, mode }) {
  const hasFirma = profile?.firma_url;
  const hasTimbro = profile?.timbro_url;
  const fileType = receivedQuote?.file_tipo;

  const [pageBlobs, setPageBlobs] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingDoc, setLoadingDoc] = useState(false);

  const [firma, setFirma] = useState({ page: 0, x: 25, y: 82, width: 22, enabled: mode !== "timbro" });
  const [timbro, setTimbro] = useState({ page: 0, x: 65, y: 82, width: 18, enabled: mode !== "firma" });

  const [generating, setGenerating] = useState(false);
  const [signedUrl, setSignedUrl] = useState(null);
  const [signedBlob, setSignedBlob] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const stateRef = useRef({ currentPage, firma, timbro });
  const blobsRef = useRef([]);
  stateRef.current = { currentPage, firma, timbro };

  const { toast } = useToast();

  // Load document on open
  useEffect(() => {
    if (!open || !receivedQuote) return;
    setSignedUrl(receivedQuote.file_firmato_url || null);
    setSignedBlob(null);
    setFirma(f => ({ ...f, page: 0, x: 25, y: 82, enabled: mode !== "timbro" && !!hasFirma }));
    setTimbro(t => ({ ...t, page: 0, x: 65, y: 82, enabled: mode !== "firma" && !!hasTimbro }));
    setCurrentPage(0);
    setPageBlobs([]);

    if (fileType === "pdf") loadPdfPages();
    else if (fileType === "image") setPageBlobs([{ url: receivedQuote.file_url }]);
  }, [open, receivedQuote]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobsRef.current.forEach(url => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); });
    };
  }, []);

  const loadPdfPages = async () => {
    setLoadingDoc(true);
    try {
      const pdfBytes = await fetch(receivedQuote.file_url).then(r => r.arrayBuffer());
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pageCount = pdfDoc.getPageCount();
      const blobs = [];
      for (let i = 0; i < pageCount; i++) {
        const newDoc = await PDFDocument.create();
        const [copiedPage] = await newDoc.copyPages(pdfDoc, [i]);
        newDoc.addPage(copiedPage);
        const newBytes = await newDoc.save();
        const url = URL.createObjectURL(new Blob([newBytes], { type: "application/pdf" }));
        blobs.push({ url });
        blobsRef.current.push(url);
      }
      setPageBlobs(blobs);
    } catch (e) {
      console.error(e);
      toast({ title: "Errore caricamento PDF", variant: "destructive" });
    } finally { setLoadingDoc(false); }
  };

  // Drag & resize
  const handlePointerDown = (e, type, mode) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type, mode,
      startX: e.touches ? e.touches[0].clientX : e.clientX,
      startY: e.touches ? e.touches[0].clientY : e.clientY,
      startWidth: type === "firma" ? stateRef.current.firma.width : stateRef.current.timbro.width,
    };
  };

  useEffect(() => {
    const handleMove = (e) => {
      const drag = dragRef.current;
      if (!drag || !containerRef.current) return;
      e.preventDefault?.();
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const { currentPage: cp } = stateRef.current;

      if (drag.mode === "move") {
        const x = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
        const y = Math.max(2, Math.min(98, ((clientY - rect.top) / rect.height) * 100));
        if (drag.type === "firma") setFirma(f => ({ ...f, x, y, page: cp }));
        else setTimbro(t => ({ ...t, x, y, page: cp }));
      } else {
        const dx = clientX - drag.startX;
        const newWidth = Math.max(8, Math.min(60, drag.startWidth + (dx / rect.width) * 100));
        if (drag.type === "firma") setFirma(f => ({ ...f, width: newWidth }));
        else setTimbro(t => ({ ...t, width: newWidth }));
      }
    };
    const handleUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchend", handleUp);
    };
  }, []);

  const generateSignedImage = async () => {
    const { img, objUrl, naturalWidth, naturalHeight } = await loadImageFromUrl(receivedQuote.file_url);
    const canvas = document.createElement("canvas");
    canvas.width = naturalWidth;
    canvas.height = naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(objUrl);

    if (firma.enabled && hasFirma) {
      const fInfo = await loadImageFromUrl(hasFirma);
      const fw = (firma.width / 100) * canvas.width;
      const fh = fw * (fInfo.naturalHeight / fInfo.naturalWidth);
      ctx.drawImage(fInfo.img, (firma.x / 100) * canvas.width - fw / 2, (firma.y / 100) * canvas.height - fh / 2, fw, fh);
      URL.revokeObjectURL(fInfo.objUrl);
    }
    if (timbro.enabled && hasTimbro) {
      const tInfo = await loadImageFromUrl(hasTimbro);
      const tw = (timbro.width / 100) * canvas.width;
      const th = tw * (tInfo.naturalHeight / tInfo.naturalWidth);
      ctx.drawImage(tInfo.img, (timbro.x / 100) * canvas.width - tw / 2, (timbro.y / 100) * canvas.height - th / 2, tw, th);
      URL.revokeObjectURL(tInfo.objUrl);
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    return { blob, filename: `Preventivo_${receivedQuote.fornitore}_firmato.png` };
  };

  const generateSignedPdf = async () => {
    const pdfBytes = await fetch(receivedQuote.file_url).then(r => r.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    if (firma.enabled && hasFirma) {
      const firmaImg = await embedImage(pdfDoc, hasFirma);
      const page = pages[firma.page] || pages[0];
      const { width, height } = page.getSize();
      const fw = (firma.width / 100) * width;
      const fh = fw * (firmaImg.height / firmaImg.width);
      page.drawImage(firmaImg, { x: (firma.x / 100) * width - fw / 2, y: height - (firma.y / 100) * height - fh / 2, width: fw, height: fh });
    }
    if (timbro.enabled && hasTimbro) {
      const timbroImg = await embedImage(pdfDoc, hasTimbro);
      const page = pages[timbro.page] || pages[0];
      const { width, height } = page.getSize();
      const tw = (timbro.width / 100) * width;
      const th = tw * (timbroImg.height / timbroImg.width);
      page.drawImage(timbroImg, { x: (timbro.x / 100) * width - tw / 2, y: height - (timbro.y / 100) * height - th / 2, width: tw, height: th });
    }
    const newBytes = await pdfDoc.save();
    return { blob: new Blob([newBytes], { type: "application/pdf" }), filename: `Preventivo_${receivedQuote.fornitore}_firmato.pdf` };
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { blob, filename } = fileType === "pdf" ? await generateSignedPdf() : await generateSignedImage();
      setSignedBlob(blob);
      const { file_url } = await api.integrations.Core.UploadFile({ file: new File([blob], filename, { type: blob.type }) });
      await db.ReceivedQuote.update(receivedQuote.id, { file_firmato_url: file_url, stato: "approvato" });
      setSignedUrl(file_url);
      toast({ title: "Documento firmato salvato" });
      if (onSaved) onSaved();
    } catch (e) {
      console.error(e);
      toast({ title: "Errore generazione", variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const handleDownload = () => {
    if (!signedBlob) return;
    const url = URL.createObjectURL(signedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Preventivo_${receivedQuote.fornitore}_firmato`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canSign = (hasFirma || hasTimbro) && (fileType === "image" || fileType === "pdf");
  const pageCount = pageBlobs.length;
  const currentBlob = pageBlobs[currentPage]?.url;
  const firmaVisible = firma.enabled && hasFirma && firma.page === currentPage;
  const timbroVisible = timbro.enabled && hasTimbro && timbro.page === currentPage;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Firma e Timbro - {receivedQuote?.fornitore}</DialogTitle></DialogHeader>

          {!canSign ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              Per firmare serve almeno una firma o un timbro nel Profilo Ditta, e il file deve essere un'immagine o un PDF.
            </div>
          ) : loadingDoc ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : (
            <div className="space-y-4 mt-4">
              {/* Controls */}
              <div className="flex items-center gap-4 flex-wrap">
                {hasFirma && (
                  <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                    <input type="checkbox" checked={firma.enabled} onChange={e => setFirma(f => ({ ...f, enabled: e.target.checked }))} className="w-4 h-4 rounded" />
                    <span>Firma</span>
                  </label>
                )}
                {hasTimbro && (
                  <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                    <input type="checkbox" checked={timbro.enabled} onChange={e => setTimbro(t => ({ ...t, enabled: e.target.checked }))} className="w-4 h-4 rounded" />
                    <span>Timbro</span>
                  </label>
                )}
                <p className="text-xs text-zinc-500 ml-auto hidden sm:block">Trascina per spostare · Pallino per ridimensionare</p>
              </div>

              {/* Page navigation */}
              {pageCount > 1 && (
                <div className="flex items-center justify-center gap-3 bg-zinc-50 rounded-lg py-2">
                  <Button size="icon" variant="ghost" aria-label="Pagina precedente" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium text-zinc-700">Pagina {currentPage + 1} di {pageCount}</span>
                  <Button size="icon" variant="ghost" aria-label="Pagina successiva" onClick={() => setCurrentPage(p => Math.min(pageCount - 1, p + 1))} disabled={currentPage === pageCount - 1}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Preview with overlays */}
              <div
                ref={containerRef}
                className="relative w-full border border-zinc-200 rounded-lg overflow-hidden bg-zinc-100 select-none"
                style={{ minHeight: "400px" }}
              >
                {fileType === "pdf" ? (
                  <>
                    <iframe src={currentBlob} className="w-full h-[550px] border-0 relative z-0" title="preview" />
                    {/* Transparent overlay prevents iframe from stealing drag events */}
                    <div className="absolute inset-0 z-10" />
                  </>
                ) : (
                  <img src={receivedQuote?.file_url} alt="preview" className="w-full block relative z-0" />
                )}

                {/* Firma overlay */}
                {firmaVisible && (
                  <div
                    onMouseDown={(e) => handlePointerDown(e, "firma", "move")}
                    onTouchStart={(e) => handlePointerDown(e, "firma", "move")}
                    className="absolute cursor-move group z-20"
                    style={{ left: `${firma.x}%`, top: `${firma.y}%`, transform: "translate(-50%, -50%)", width: `${firma.width}%` }}
                  >
                    <img src={hasFirma} alt="firma" className="w-full pointer-events-none opacity-90" draggable={false} />
                    <div
                      onMouseDown={(e) => handlePointerDown(e, "firma", "resize")}
                      onTouchStart={(e) => handlePointerDown(e, "firma", "resize")}
                      className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-brand-600 rounded-full cursor-se-resize border-2 border-white shadow flex items-center justify-center touch-none z-20"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" className="text-white"><path d="M2 6L6 2M4 6L6 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    </div>
                  </div>
                )}

                {/* Timbro overlay */}
                {timbroVisible && (
                  <div
                    onMouseDown={(e) => handlePointerDown(e, "timbro", "move")}
                    onTouchStart={(e) => handlePointerDown(e, "timbro", "move")}
                    className="absolute cursor-move group z-20"
                    style={{ left: `${timbro.x}%`, top: `${timbro.y}%`, transform: "translate(-50%, -50%)", width: `${timbro.width}%` }}
                  >
                    <img src={hasTimbro} alt="timbro" className="w-full pointer-events-none opacity-80" draggable={false} />
                    <div
                      onMouseDown={(e) => handlePointerDown(e, "timbro", "resize")}
                      onTouchStart={(e) => handlePointerDown(e, "timbro", "resize")}
                      className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-brand-600 rounded-full cursor-se-resize border-2 border-white shadow flex items-center justify-center touch-none z-20"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" className="text-white"><path d="M2 6L6 2M4 6L6 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-page hint */}
              {pageCount > 1 && (firma.enabled || timbro.enabled) && (
                <p className="text-xs text-zinc-500 text-center">
                  Naviga le pagine e posiziona firma/timbro sulla pagina desiderata. Ogni elemento resta sulla pagina in cui lo posizioni.
                </p>
              )}

              {/* Result preview */}
              {signedUrl && (
                <div className="border-t border-zinc-100 pt-4">
                  <p className="text-sm font-medium text-zinc-700 mb-2 flex items-center gap-1">
                    <FileCheck className="w-4 h-4 text-brand-600" /> Anteprima firmata
                  </p>
                  {signedUrl.match(/\.(pdf)$/i) || signedBlob?.type === "application/pdf" ? (
                    <iframe src={signedUrl} className="w-full h-[300px] border border-zinc-200 rounded-lg" title="firmato" />
                  ) : (
                    <img src={signedUrl} alt="firmato" className="w-full max-h-[300px] object-contain border border-zinc-200 rounded-lg" />
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button onClick={handleGenerate} disabled={generating} className="bg-brand-600 hover:bg-brand-700 gap-2 flex-1">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                  {signedUrl ? "Rigenera" : "Genera anteprima"}
                </Button>
                {signedUrl && signedBlob && (
                  <>
                    <Button variant="outline" onClick={handleDownload} className="gap-2 flex-1">
                      <Download className="w-4 h-4" /> Scarica
                    </Button>
                    <Button variant="outline" onClick={() => setEmailOpen(true)} className="gap-2 flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                      <Send className="w-4 h-4" /> Invia email
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {emailOpen && (
        <EmailComposer
          open={emailOpen}
          onOpenChange={setEmailOpen}
          defaultTo=""
          defaultSubject={`Preventivo firmato - ${receivedQuote?.fornitore}`}
          defaultBody={`Gentile ${receivedQuote?.fornitore},\n\nIn allegato il preventivo da Lei inviato, da noi firmato e timbrato.\n\nCordiali saluti`}
          attachment={signedBlob ? { blob: signedBlob, filename: `Preventivo_${receivedQuote?.fornitore}_firmato.pdf` } : null}
          context={`Invio preventivo ricevuto firmato da ${receivedQuote?.fornitore}.`}
        />
      )}
    </>
  );
}