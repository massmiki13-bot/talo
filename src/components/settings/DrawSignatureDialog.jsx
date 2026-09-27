import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import SignaturePad from "@/components/shared/SignaturePad";
import { api } from "@/lib/db";
import { Loader2, PenLine } from "lucide-react";

export default function DrawSignatureDialog({ open, onOpenChange, currentSignature, onSaved }) {
  const [drawn, setDrawn] = useState(currentSignature || "");
  const [saving, setSaving] = useState(false);

  const dataUrlToBlob = (dataUrl) => {
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/:(.*?);/)[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  const handleSave = async () => {
    if (!drawn) return;
    setSaving(true);
    try {
      const blob = dataUrlToBlob(drawn);
      const file = new File([blob], "firma.png", { type: "image/png" });
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      onSaved(file_url);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-blue-600" />
            Disegna firma a mano libera
          </DialogTitle>
        </DialogHeader>

        <SignaturePad value={currentSignature} onChange={setDrawn} label="Firma" />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={handleSave} disabled={!drawn || saving} className="gap-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
            Salva firma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}