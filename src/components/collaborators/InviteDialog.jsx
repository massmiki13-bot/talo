import React, { useState, useEffect } from "react";
import { api, db } from "@/lib/db";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, KeyRound, Link as LinkIcon, MessageCircle, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AccessConfigSection from "./AccessConfigSection";
import QRCode from "qrcode";

// Operaio: un solo QR (o link) che contiene già il codice. Si inquadra sul posto o si manda su WhatsApp.
function WorkerInvite({ invite }) {
  const url = `${window.location.origin}/entra/${invite.id}?c=${invite.code}`;
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(url, { width: 560, margin: 1 }).then(setQr).catch(() => {}); }, [url]);
  const msg = `Talo – ${invite.display_name || ""}
🇮🇹 Apri il link, crea il tuo account ed entri nell'app della nostra impresa.
🇷🇴 Deschide linkul, creează-ți contul și intri în aplicația firmei noastre.
🇦🇱 Hap lidhjen, krijo llogarinë dhe hyn në aplikacionin e firmës sonë.
${url}`;
  return (
    <div className="space-y-4">
      <div className="grid place-items-center">
        {qr ? <img src={qr} alt="QR code per entrare nell'app dei dipendenti" className="w-60 h-60 rounded-xl border border-slate-200 p-2 bg-white" /> : <div className="w-60 h-60 rounded-xl bg-slate-100 animate-pulse" />}
        <p className="text-sm text-slate-600 text-center mt-3">Fai inquadrare il QR al dipendente con la fotocamera: crea il suo account ed entra subito nell'app operai, già collegato alla sua scheda. Vale 14 giorni e per una sola persona.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="gap-1.5" asChild><a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" /> WhatsApp</a></Button>
        <Button variant="outline" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copia link</Button>
      </div>
      <p className="text-xs text-slate-500">Il messaggio WhatsApp è in italiano, rumeno e albanese. Chi ha il link entra come questo dipendente: invialo solo a lui.</p>
    </div>
  );
}

export default function InviteDialog({
  open,
  onOpenChange,
  onCreated,
  hostUserId,
  defaultAccessLevel = "responsabile",
  defaultEmployeeId = "",
}) {
  const { toast } = useToast();
  const [accessLevel, setAccessLevel] = useState("responsabile");
  const [employeeId, setEmployeeId] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [invite, setInvite] = useState(null);
  const [copied, setCopied] = useState(false);
  const [nome, setNome] = useState("");

  useEffect(() => {
    if (open) {
      // Aperto dalla scheda di un dipendente: operaio già collegato.
      setAccessLevel(defaultAccessLevel);
      setEmployeeId(defaultEmployeeId);
      setNome("");
      db.Employee.list("-created_date", 200).then(setEmployees).catch(() => {});
    }
  }, [open]);

  const generate = async () => {
    if (accessLevel === "responsabile" && permissions.length === 0) {
      toast({ title: "Seleziona almeno un modulo", variant: "destructive" });
      return;
    }
    if (accessLevel === "operaio" && !employeeId) {
      toast({ title: "Seleziona il dipendente da collegare", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      const result = await api.entities.CollaboratorInvite.create({
        host_user_id: hostUserId,
        code,
        access_level: accessLevel,
        employee_id: accessLevel === "operaio" ? employeeId : null,
        permissions: accessLevel === "responsabile" ? permissions : [],
        status: "pending",
        display_name: nome.trim() || (accessLevel === "operaio" ? (() => { const e = employees.find((x) => x.id === employeeId); return e ? `${e.nome} ${e.cognome}` : ""; })() : ""),
      });
      setInvite(result);
    } catch (e) {
      toast({ title: "Errore generazione invito", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const reset = () => {
    setAccessLevel("responsabile");
    setEmployeeId("");
    setPermissions([]);
    setInvite(null);
    setCopied(false);
    onOpenChange(false);
    onCreated?.();
  };

  const copyLink = () => {
    const link = `${window.location.origin}/collaboratori/invito/${invite.id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(invite.code);
    toast({ title: "Codice copiato", className: "bg-green-600 text-white" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && reset()}>
      <DialogContent>
        {!invite ? (
          <>
            <DialogHeader>
              <DialogTitle>Nuovo Collaboratore</DialogTitle>
            </DialogHeader>
            <div>
              <Label htmlFor="inv-nome" className="mb-1.5 block">Per chi è l'invito</Label>
              <Input id="inv-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. Laura – ufficio" />
              <p className="text-xs text-slate-500 mt-1">Solo un promemoria per te, per riconoscere l'invito.</p>
            </div>
            <AccessConfigSection
              accessLevel={accessLevel}
              setAccessLevel={setAccessLevel}
              employeeId={employeeId}
              setEmployeeId={setEmployeeId}
              permissions={permissions}
              setPermissions={setPermissions}
              employees={employees}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button onClick={generate} disabled={generating}>
                {generating ? "Generazione..." : "Genera Invito"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invito Pronto!</DialogTitle>
            </DialogHeader>
            {invite.access_level === "operaio" ? <WorkerInvite invite={invite} /> : (
            <div className="space-y-4">
              <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 text-center">
                <p className="text-sm text-brand-600 mb-2 flex items-center justify-center gap-1">
                  <KeyRound className="w-4 h-4" /> Codice di conferma
                </p>
                <p className="text-4xl font-bold tracking-[0.3em] text-brand-700">
                  {invite.code}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={copyCode}
                >
                  Copia codice
                </Button>
              </div>
              <div className="bg-slate-50 border rounded-lg p-3">
                <p className="text-sm text-slate-500 mb-1 flex items-center gap-1">
                  <LinkIcon className="w-4 h-4" /> Link di invito
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white border rounded px-2 py-1 flex-1 truncate">
                    {window.location.origin}/collaboratori/invito/{invite.id}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyLink}>
                    {copied ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-1.5" asChild>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Ciao! Ti ho invitato su Talo. Apri questo link e accedi (o registrati): ${window.location.origin}/collaboratori/invito/${invite.id} — il codice di conferma te lo comunico a parte.`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
                </Button>
                <Button variant="outline" className="gap-1.5" asChild>
                  <a href={`mailto:?subject=${encodeURIComponent("Invito a collaborare su Talo")}&body=${encodeURIComponent(`Ciao,

ti ho invitato su Talo. Apri questo link e accedi o registrati:
${window.location.origin}/collaboratori/invito/${invite.id}

Il codice di conferma te lo comunico a parte.`)}`}><Mail className="w-4 h-4" /> Email</a>
                </Button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-semibold mb-1">Come funziona:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Invia il link al collaboratore (vale 14 giorni)</li>
                  <li>Comunica il codice a voce o in modo sicuro</li>
                  <li>
                    Il collaboratore apre il link e inserisce il codice per
                    confermare
                  </li>
                </ol>
              </div>
            </div>
            )}
            <DialogFooter>
              <Button onClick={reset}>Fatto</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}