import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api, supabase } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2, PlayCircle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";

// Il login con Google si attiva dopo aver configurato il provider su Supabase.
const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.loginViaEmailPassword(email, password);
      // Torna alla pagina richiesta prima del login (solo percorsi interni).
      const from = new URLSearchParams(window.location.search).get("from");
      window.location.href = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
    } catch (err) {
      setError(err.message || "Email o password non corretti");
    } finally {
      setLoading(false);
    }
  };

  // Azienda dimostrativa con dati di esempio: il server apre la sessione, qui arrivano solo i token.
  const [demoLoading, setDemoLoading] = useState(false);
  const openDemo = async () => {
    setError("");
    setDemoLoading(true);
    try {
      const res = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "demo" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "La demo non è disponibile in questo momento");
      const { error: e } = await supabase.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
      if (e) throw e;
      window.location.href = "/";
    } catch (err) {
      setError(err.message);
      setDemoLoading(false);
    }
  };

  const handleGoogle = () => {
    api.auth.loginWithProvider("google", "/");
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Bentornato"
      subtitle="Accedi al tuo account"
      footer={
        <>
          Non hai un account?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Registrati
          </Link>
        </>
      }
    >
      {GOOGLE_AUTH_ENABLED && (
        <>
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continua con Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">oppure</span>
        </div>
      </div>
        </>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="nome@azienda.it"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Password dimenticata?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Accesso in corso...
            </>
          ) : (
            "Accedi"
          )}
        </Button>
      </form>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900">Vuoi solo dare un'occhiata?</p>
          <p className="text-xs text-zinc-600 mt-0.5">Entra in un'impresa di esempio con cantieri, preventivi e presenze già compilati.</p>
        </div>
        <Button type="button" variant="outline" onClick={openDemo} disabled={demoLoading} className="gap-1.5 shrink-0 bg-white">
          {demoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} Prova la demo
        </Button>
      </div>
    </AuthLayout>
  );
}
