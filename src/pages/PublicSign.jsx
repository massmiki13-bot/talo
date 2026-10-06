import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck, FileSignature, ChevronDown, HardHat, Phone } from "lucide-react";
import SignaturePad from "@/components/shared/SignaturePad";

// Pagina pubblica di firma (contratti e POS): nessun login, accesso con il link segreto.

const level = (r) => (r >= 9 ? ["Alto", "bg-red-100 text-red-800"] : r >= 5 ? ["Medio", "bg-amber-100 text-amber-800"] : ["Basso", "bg-emerald-100 text-emerald-800"]);
const dt = (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

function Section({ title, children, open: initial = false }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="border-t border-zinc-100">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="font-semibold text-zinc-900">{title}</span>
        <ChevronDown className={`w-5 h-5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="px-5 pb-5 text-[15px] text-zinc-700 space-y-3">{children}</div>}
    </section>
  );
}

export default function PublicSign() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [nome, setNome] = useState("");
  const [signer, setSigner] = useState("");
  const [firma, setFirma] = useState("");
  const [accetto, setAccetto] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);

  const load = () => fetch(`/api/quote-public?f=${encodeURIComponent(token)}`)
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Link non valido"); return j; })
    .then(setData)
    .catch((e) => setError(e.message));

  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (data) document.title = `Firma – ${data.titolo}`; }, [data]);

  const pos = data?.kind === "pos";
  const chosen = useMemo(() => data?.firmatari?.find((f) => f.id === signer), [data, signer]);
  useEffect(() => { if (chosen) setNome(chosen.nome); }, [chosen]);

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center bg-zinc-50 p-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-zinc-900">{error}</h1>
          <p className="text-sm text-zinc-600 mt-2">Il link potrebbe essere stato revocato. Contatta l'impresa che te l'ha inviato.</p>
        </div>
      </main>
    );
  }
  if (!data) return <main className="min-h-screen grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-zinc-500" aria-label="Caricamento" /></main>;

  const p = data.profile || {};
  const alreadySigned = !pos && data.firmato;

  const submit = async () => {
    setFormError("");
    if (pos && !signer) return setFormError("Scegli il tuo nome dall'elenco");
    if (!nome.trim()) return setFormError("Scrivi nome e cognome");
    if (!accetto) return setFormError(pos ? "Conferma di aver letto il POS" : "Conferma di aver letto il contratto");
    if (!firma) return setFormError("Firma nel riquadro");
    setSending(true);
    try {
      const r = await fetch("/api/quote-public", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento: true, token, nome, firma, accetto, hash: data.hash, firmatario_id: pos ? signer : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Invio non riuscito");
      setDone(true);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSending(false);
    }
  };

  const signAnother = () => { setDone(false); setSigner(""); setNome(""); setFirma(""); setAccetto(false); load(); };

  return (
    <main className="min-h-screen bg-zinc-100 sm:py-8">
      <div className="max-w-2xl mx-auto bg-white sm:rounded-2xl shadow-sm overflow-hidden">
        <div className="h-1.5" style={{ backgroundImage: "var(--metal-red)" }} />
        <header className="px-5 pt-5 pb-4 flex items-center gap-3">
          {p.logo_url ? <img src={p.logo_url} alt="" className="h-10 max-w-[120px] object-contain" /> : <span className="grid place-items-center w-10 h-10 rounded-lg bg-zinc-900 text-white">{pos ? <HardHat className="w-5 h-5" /> : <FileSignature className="w-5 h-5" />}</span>}
          <div className="min-w-0">
            <p className="font-semibold text-zinc-900 truncate">{p.ragione_sociale}</p>
            <p className="text-xs text-zinc-500 truncate">{[p.indirizzo, p.citta].filter(Boolean).join(", ")}</p>
          </div>
        </header>
        <div className="px-5 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">{pos ? `Presa visione del POS · rev. ${data.revisione}` : "Contratto da firmare"}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase leading-tight text-zinc-950 mt-1">{data.titolo}</h1>
          {!pos && data.controparte_nome && <p className="text-sm text-zinc-600 mt-1">Per: {data.controparte_nome}</p>}
        </div>

        {pos ? (
          <>
            <Section title="Cantiere e figure della sicurezza" open>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {[["Cantiere", data.cantiere?.nome], ["Indirizzo", data.cantiere?.indirizzo], ["Committente", data.cantiere?.committente], ["Orario", data.cantiere?.orario],
                  ["Datore di lavoro", data.impresa?.datore_lavoro], ["Preposto", data.impresa?.capocantiere], ["RSPP", data.impresa?.rspp], ["RLS", data.impresa?.rls], ["Medico competente", data.impresa?.medico_competente],
                  ["Primo soccorso", (data.impresa?.addetti_primo_soccorso || []).join(", ")], ["Antincendio", (data.impresa?.addetti_antincendio || []).join(", ")]]
                  .filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt className="text-zinc-500">{k}</dt><dd className="text-zinc-900">{v}</dd></React.Fragment>)}
              </dl>
            </Section>
            <Section title={`Lavorazioni e rischi (${data.lavorazioni.length})`}>
              {data.lavorazioni.map((l, i) => (
                <div key={i} className="rounded-xl border border-zinc-200 p-3.5">
                  <p className="font-semibold text-zinc-900">{l.nome}</p>
                  {l.rischi.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{l.rischi.map((r, k) => { const [lab, cls] = level(r.r); return <li key={k} className={`text-xs rounded-full px-2 py-0.5 ${cls}`}>{r.rischio} · {lab}</li>; })}</ul>}
                  {l.misure.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm space-y-0.5">{l.misure.map((m, k) => <li key={k}>{m}</li>)}</ul>}
                  {l.dpi.length > 0 && <p className="text-sm mt-2"><span className="text-zinc-500">DPI:</span> {l.dpi.join(", ")}</p>}
                </div>
              ))}
            </Section>
            <Section title="DPI obbligatori">
              <ul className="list-disc pl-5 space-y-0.5">{data.dpi.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </Section>
            <Section title="Emergenze">
              <p className="flex items-center gap-2 font-semibold text-red-700"><Phone className="w-4 h-4" aria-hidden="true" />Numero unico emergenze 112</p>
              {data.emergenze?.ospedale && <p><span className="text-zinc-500">Pronto soccorso:</span> {data.emergenze.ospedale}</p>}
              {data.emergenze?.punto_raccolta && <p><span className="text-zinc-500">Punto di raccolta:</span> {data.emergenze.punto_raccolta}</p>}
              {data.emergenze?.procedure && <p>{data.emergenze.procedure}</p>}
            </Section>
          </>
        ) : (
          <article className="border-t border-zinc-100 px-5 py-5 text-[15px] leading-relaxed text-zinc-800 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto" tabIndex={0} aria-label="Testo del contratto">
            {data.contenuto}
          </article>
        )}

        <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-6">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-700 mx-auto" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-zinc-900 mt-3">Firma registrata</h2>
              <p className="text-sm text-zinc-600 mt-1">{pos ? "Grazie: la tua presa visione è stata inviata all'impresa." : "Grazie: il contratto firmato è stato inviato all'impresa."}</p>
              {pos && <Button variant="outline" className="mt-5" onClick={signAnother}>Firma per un'altra persona</Button>}
            </div>
          ) : alreadySigned ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-700 mx-auto" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-zinc-900 mt-3">Contratto già firmato</h2>
              <p className="text-sm text-zinc-600 mt-1">Firmato da {data.firmato.nome} il {dt(data.firmato.data)}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-zinc-900">{pos ? "Firma la presa visione" : "Firma il contratto"}</h2>
              {pos && (
                <fieldset>
                  <legend className="text-sm font-medium text-zinc-800 mb-2">Chi sei?</legend>
                  <div className="grid gap-2">
                    {data.firmatari.map((f) => (
                      <label key={f.id} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 cursor-pointer bg-white ${signer === f.id ? "border-brand-500 ring-1 ring-brand-500" : "border-zinc-200"}`}>
                        <input type="radio" name="firmatario" value={f.id} checked={signer === f.id} onChange={() => setSigner(f.id)} className="accent-[#c3122a] w-4 h-4" />
                        <span className="min-w-0 flex-1"><span className="block font-medium text-zinc-900">{f.nome}</span><span className="block text-xs text-zinc-500">{f.ruolo}</span></span>
                        {f.firmato && <span className="text-xs text-emerald-700 flex items-center gap-1 shrink-0"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />firmato</span>}
                      </label>
                    ))}
                  </div>
                  {chosen?.firmato && <p className="text-xs text-amber-800 mt-2">Hai già firmato il {dt(chosen.firmato)}: firmando di nuovo la firma precedente viene sostituita.</p>}
                </fieldset>
              )}
              <div>
                <Label htmlFor="sign-nome">Nome e cognome</Label>
                <Input id="sign-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" className="mt-1 h-11 bg-white text-base" />
              </div>
              <label htmlFor="sign-accetto" className="flex items-start gap-3 text-sm text-zinc-700 cursor-pointer">
                <Checkbox id="sign-accetto" checked={accetto} onCheckedChange={(v) => setAccetto(v === true)} className="mt-0.5" />
                <span>{pos ? "Dichiaro di aver letto il Piano Operativo di Sicurezza, di aver ricevuto le informazioni sui rischi e sulle misure di prevenzione e di impegnarmi a rispettarle." : "Dichiaro di aver letto integralmente il contratto e di accettarne il contenuto."}</span>
              </label>
              <div>
                <p className="text-sm font-medium text-zinc-800 mb-1.5">Firma con il dito nel riquadro</p>
                <div className="bg-white rounded-xl border border-zinc-200"><SignaturePad value={firma} onChange={setFirma} label="Firma" /></div>
              </div>
              {formError && <p role="alert" className="text-sm text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" aria-hidden="true" />{formError}</p>}
              <Button onClick={submit} disabled={sending} className="w-full h-12 text-base bg-brand-600 hover:bg-brand-700 gap-2">
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSignature className="w-5 h-5" />} Firma
              </Button>
              <p className="text-xs text-zinc-500 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 text-zinc-500" aria-hidden="true" />Firma elettronica semplice: insieme alla firma vengono registrati data e ora, indirizzo IP, dispositivo e un'impronta del documento che ne garantisce l'integrità.</p>
            </div>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-zinc-500 py-6">Firma gestita con Talo · <a href="/legal/privacy" className="underline">Privacy</a></p>
    </main>
  );
}
