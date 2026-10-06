import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, supabase } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  // Il link ricevuto via email apre una sessione di recupero (Supabase).
  const [hasSession, setHasSession] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data?.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasSession(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("La password deve avere almeno 8 caratteri");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }
    setLoading(true);
    try {
      await api.auth.resetPassword({ newPassword });
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "Reimpostazione non riuscita");
    } finally {
      setLoading(false);
    }
  };

  if (hasSession === null) return null;

  if (!hasSession) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Link non valido"
        subtitle="Il link per reimpostare la password è scaduto o non valido"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Richiedi un nuovo link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          Il link che hai usato è incompleto o già utilizzato. Richiedi una nuova email per reimpostare la password.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="Nuova password"
      subtitle="Scegli una nuova password (almeno 8 caratteri)"
    >
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nuova password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Conferma password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvataggio...
            </>
          ) : (
            "Reimposta password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
