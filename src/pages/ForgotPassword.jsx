import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowLeft, Loader2 } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import { toast } from "@/components/ui/use-toast";

// Recupero con codice a 6 cifre invece di un link: i link monouso vengono
// spesso "consumati" dagli antivirus e dalle anteprime delle email.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const requestCode = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.auth.resetPasswordRequest(email);
    } catch {
      // Messaggio sempre uguale: non riveliamo quali email sono registrate
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  const resend = async () => {
    await requestCode();
    toast({ title: "Codice inviato", description: "Controlla la posta: ti abbiamo inviato un nuovo codice." });
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("La password deve avere almeno 8 caratteri");
    if (password !== confirm) return setError("Le password non coincidono");
    setLoading(true);
    try {
      await api.auth.verifyRecovery({ email, code });
      await api.auth.resetPassword({ newPassword: password });
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "Reimpostazione non riuscita");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={sent ? Lock : Mail}
      title="Reimposta password"
      subtitle={sent ? `Inserisci il codice inviato a ${email}` : "Ti invieremo un codice per reimpostarla"}
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Torna all'accesso
        </Link>
      }
    >
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      {sent ? (
        <form onSubmit={handleReset} className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Se esiste un account con questa email, riceverai a breve un codice a 6 cifre.
          </p>
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus autoComplete="one-time-code">
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Nuova password</Label>
            <Input id="password" type="password" autoComplete="new-password" placeholder="Almeno 8 caratteri"
              value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Conferma password</Label>
            <Input id="confirm" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12" required />
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading || code.length < 6}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvataggio...</> : "Salva nuova password"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Non hai ricevuto il codice?{" "}
            <button type="button" onClick={resend} className="text-primary font-medium hover:underline">Invia di nuovo</button>
          </p>
        </form>
      ) : (
        <form onSubmit={requestCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Indirizzo email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input id="email" type="email" autoComplete="email" autoFocus placeholder="nome@azienda.it"
                value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Invio in corso...</> : "Invia codice"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
