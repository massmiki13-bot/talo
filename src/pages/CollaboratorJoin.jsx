import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { PERMISSION_MODULES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, KeyRound, Loader2, CheckCircle2, Building2 } from "lucide-react";

export default function CollaboratorJoin() {
  const { inviteId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!inviteId) return;
    // Il codice non arriva mai al browser: la verifica è solo sul server.
    api.functions.invoke("invite-info", { inviteId })
      .then((res) => {
        if (res.data?.error) throw new Error(res.data.error);
        setInvite(res.data);
      })
      .catch(() =>
        toast({ title: "Invito non valido", variant: "destructive" })
      )
      .finally(() => setLoading(false));
  }, [inviteId]);

  const handleConfirm = async () => {
    if (!invite) return;
    if (!code.trim()) {
      toast({ title: "Inserisci il codice ricevuto", variant: "destructive" });
      return;
    }
    setVerifying(true);
    try {
      const response = await api.functions.invoke("confirmCollaboratorInvite", {
        inviteId: invite.id,
        code: code.trim(),
      });
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (e) {
      toast({
        title: e.message || "Errore durante la conferma",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Accesso Confermato!
            </h2>
            <p className="text-slate-500">
              Verrai reindirizzato alla dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invite || invite.status === "used" || invite.status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Invito non disponibile
            </h2>
            <p className="text-slate-500">
              {!invite
                ? "Il link non è valido."
                : "Questo invito è già stato utilizzato o è scaduto."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const grantedModules = PERMISSION_MODULES.filter((m) =>
    invite.permissions?.includes(m.key)
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-7 h-7 text-brand-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Conferma Invito</h1>
            <p className="text-sm text-slate-500 mt-1">
              Inserisci il codice a 6 cifre comunicato dall'host per attivare il
              tuo accesso.
            </p>
          </div>

          {invite.access_level === "operaio" ? (
            <div className="bg-slate-50 border rounded-lg p-3 mb-4">
              <p className="text-xs font-semibold text-slate-600 mb-1.5">
                Accesso come Operaio/Dipendente:
              </p>
              <p className="text-xs text-slate-500">
                Vedrai solo i tuoi documenti personali, le tue presenze e le tue ore lavorate.
              </p>
            </div>
          ) : grantedModules.length > 0 && (
            <div className="bg-slate-50 border rounded-lg p-3 mb-4">
              <p className="text-xs font-semibold text-slate-600 mb-1.5">
                Avrai accesso a:
              </p>
              <div className="flex flex-wrap gap-1">
                {grantedModules.map((m) => (
                  <span
                    key={m.key}
                    className="text-xs bg-white border rounded px-2 py-0.5 text-slate-600"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="code" className="flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5" /> Codice di conferma
            </Label>
            <Input
              id="code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="••••••"
              className="text-center text-2xl tracking-[0.5em] font-bold"
              maxLength={6}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            />
          </div>

          <Button
            onClick={handleConfirm}
            disabled={verifying || code.length !== 6}
            className="w-full mt-4"
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Conferma in corso...
              </>
            ) : (
              "Conferma Accesso"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}