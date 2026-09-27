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
import { Copy, Check, KeyRound, Link as LinkIcon } from "lucide-react";
import AccessConfigSection from "./AccessConfigSection";

export default function InviteDialog({
  open,
  onOpenChange,
  onCreated,
  hostUserId,
}) {
  const { toast } = useToast();
  const [accessLevel, setAccessLevel] = useState("responsabile");
  const [employeeId, setEmployeeId] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [invite, setInvite] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
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
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-600 mb-2 flex items-center justify-center gap-1">
                  <KeyRound className="w-4 h-4" /> Codice di conferma
                </p>
                <p className="text-4xl font-bold tracking-[0.3em] text-blue-700">
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
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                <p className="font-semibold mb-1">Come funziona:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Invia il link al collaboratore</li>
                  <li>Comunica il codice a voce o in modo sicuro</li>
                  <li>
                    Il collaboratore apre il link e inserisce il codice per
                    confermare
                  </li>
                </ol>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={reset}>Fatto</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}