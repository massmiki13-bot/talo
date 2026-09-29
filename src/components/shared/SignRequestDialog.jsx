import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Copy, Mail, MessageCircle, Smartphone, Check } from "lucide-react";

// Link e QR per firmare dal telefono: da inquadrare sul posto o da inviare via WhatsApp / email.
export default function SignRequestDialog({ open, onOpenChange, url, title, message, onEmail, heading = "Firma dal telefono", note, children }) {
  const { toast } = useToast();
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !url) return;
    QRCode.toDataURL(url, { width: 560, margin: 1, errorCorrectionLevel: "M", color: { dark: "#18181b", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
  }, [open, url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast({ title: "Copia non riuscita", description: "Seleziona il link e copialo a mano.", variant: "destructive" }); }
  };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-brand-600" />{heading}</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        <div className="grid place-items-center">
          {qr ? <img src={qr} alt="Codice QR del link di firma" className="w-56 h-56 rounded-xl border border-zinc-200 p-2 bg-white" /> : <div className="w-56 h-56 rounded-xl bg-zinc-100 animate-pulse" />}
          <p className="text-sm text-zinc-600 text-center mt-3">Inquadra il codice con la fotocamera del telefono, oppure invia il link.</p>
        </div>
        <div className="flex gap-2">
          <Input readOnly value={url} aria-label="Link di firma" onFocus={(e) => e.target.select()} className="font-mono text-xs" />
          <Button variant="outline" onClick={copy} className="gap-1.5 shrink-0">{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{copied ? "Copiato" : "Copia"}</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" className="gap-1.5"><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" />WhatsApp</a></Button>
          {onEmail && <Button variant="outline" className="gap-1.5" onClick={onEmail}><Mail className="w-4 h-4" />Email</Button>}
        </div>
{children}
        {note ?? (<p className="text-xs text-zinc-500">Firma elettronica semplice (art. 20 CAD): per ogni firma Talo registra nome, data e ora, indirizzo IP, dispositivo e l'impronta del testo firmato. Chi ha il link può firmare: invialo solo alla persona interessata.</p>)}
      </DialogContent>
    </Dialog>
  );
}
