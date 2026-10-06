import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, Building2, HardHat, QrCode } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import { LEGAL_VERSION } from "@/lib/legal";
import GoogleIcon from "@/components/GoogleIcon";

// Il login con Google si attiva dopo aver configurato il provider su Supabase.
const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";
import { toast } from "@/components/ui/use-toast";

// Dopo la registrazione si torna solo a percorsi interni (es. il collegamento all'invito di un operaio).
const safeFrom = () => {
  const f = new URLSearchParams(window.location.search).get("from") || "";
  return f.startsWith("/") && !f.startsWith("//") ? f : "";
};

export default function Register() {
  const params = new URLSearchParams(window.location.search);
  const from = safeFrom();
  const invitedWorker = params.get("ruolo") === "operaio" && from.startsWith("/entra/");
  const [role, setRole] = useState(invitedWorker ? "operaio" : "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri");
      return;
    }
    if (password !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }
    if (!accepted) {
      setError("Per continuare accetta i termini di servizio, l'informativa privacy e l'accordo sul trattamento dei dati");
      return;
    }
    setLoading(true);
    try {
      const res = await api.auth.register({ email, password, consent: { terms_version: LEGAL_VERSION, terms_accepted_at: new Date().toISOString() } });
      // Se la conferma via email non è richiesta la sessione è già aperta: si entra subito.
      if (!res.needsConfirmation) { window.location.href = from || "/"; return; }
      setShowOtp(true);
    } catch (err) {
      setError(err.message || "Registrazione non riuscita");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        api.auth.setToken(result.access_token);
      }
      window.location.href = from || "/";
    } catch (err) {
      setError(err.message || "Codice di verifica non valido");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await api.auth.resendOtp(email);
      toast({
        title: "Codice inviato",
        description: "Controlla la posta: ti abbiamo inviato un nuovo codice.",
      });
    } catch (err) {
      setError(err.message || "Invio del codice non riuscito");
    }
  };

  const handleGoogle = () => {
    api.auth.loginWithProvider("google", "/");
  };

  if (showOtp) {
    return (
      <AuthLayout
        icon={Mail}
        title="Verifica la tua email"
        subtitle={`Abbiamo inviato un codice a ${email}`}
      >
        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        <div className="flex justify-center mb-6">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={setOtpCode}
            autoFocus
            autoComplete="one-time-code"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button
          className="w-full h-12 font-medium"
          onClick={handleVerify}
          disabled={loading || otpCode.length < 6}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifica in corso...
            </>
          ) : (
            "Verifica"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Non hai ricevuto il codice?{" "}
          <button onClick={handleResend} className="text-primary font-medium hover:underline">
            Invia di nuovo
          </button>
        </p>
      </AuthLayout>
    );
  }

  // Prima scelta: titolare/ufficio oppure operaio (che entra solo con l'invito del suo datore di lavoro).
  if (!role) {
    return (
      <AuthLayout icon={UserPlus} title="Crea il tuo account" subtitle="Chi sei?"
        footer={<>Hai già un account? <Link to="/login" className="text-primary font-medium hover:underline">Accedi</Link></>}>
        <div className="grid gap-3">
          {[["titolare", Building2, "Sono il titolare o lavoro in ufficio", "Registri la tua impresa: preventivi, cantieri, dipendenti, fatture."], ["operaio", HardHat, "Sono un operaio / dipendente", "Entri nell'app dei dipendenti della tua impresa: timbrature, foto, ore e documenti."]].map(([k, I, title, sub]) => (
            <button key={k} type="button" onClick={() => setRole(k)} className="w-full text-left rounded-2xl border border-zinc-200 hover:border-brand-400 hover:bg-brand-50/40 p-4 flex gap-4 items-start transition-colors">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-zinc-950 text-white shrink-0"><I className="w-5 h-5" aria-hidden="true" /></span>
              <span><span className="block font-semibold text-zinc-900">{title}</span><span className="block text-sm text-zinc-600 mt-0.5">{sub}</span></span>
            </button>
          ))}
        </div>
      </AuthLayout>
    );
  }

  if (role === "operaio" && !invitedWorker) {
    return (
      <AuthLayout icon={HardHat} title="Serve l'invito del tuo capo" subtitle="L'app dei dipendenti si collega alla tua impresa.">
        <div className="rounded-2xl border border-zinc-200 p-5">
          <QrCode className="w-10 h-10 text-brand-600" aria-hidden="true" />
          <ol className="mt-4 space-y-2 text-[15px] text-zinc-700 list-decimal list-inside">
            <li>Chiedi al titolare o al capocantiere il <b>QR code di Talo</b> (lo trova nella tua scheda dipendente, "Invita all'app").</li>
            <li>Inquadralo con la fotocamera del telefono, oppure apri il link che ti manda su WhatsApp.</li>
            <li>Crea il tuo account: sarai già collegato alla tua impresa.</li>
          </ol>
        </div>
        <button type="button" onClick={() => setRole("")} className="mt-6 text-sm text-zinc-600 hover:text-zinc-900">← Indietro</button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title={invitedWorker ? "Il tuo account" : "Crea il tuo account"}
      subtitle={invitedWorker ? "Email e password: le userai per entrare nell'app della tua impresa" : "Registra la tua azienda su Talo"}
      footer={
        <>
          Hai già un account?{" "}
          <Link to={from ? `/login?from=${encodeURIComponent(from)}` : "/login"} className="text-primary font-medium hover:underline">
            Accedi
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
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
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
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
        <label className="flex items-start gap-2.5 text-sm text-zinc-600 leading-snug cursor-pointer">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-600" required />
          {invitedWorker
            ? <span>Accetto i <a href="/legal/termini" target="_blank" className="text-brand-700 underline">termini di servizio</a> e ho letto l'<a href="/legal/privacy" target="_blank" className="text-brand-700 underline">informativa privacy</a>.</span>
            : <span>Accetto i <a href="/legal/termini" target="_blank" className="text-brand-700 underline">termini di servizio</a> e l'<a href="/legal/accordo-trattamento-dati" target="_blank" className="text-brand-700 underline">accordo sul trattamento dei dati</a> e ho letto l'<a href="/legal/privacy" target="_blank" className="text-brand-700 underline">informativa privacy</a>.</span>}
        </label>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creazione account...
            </>
          ) : (
            "Crea account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
