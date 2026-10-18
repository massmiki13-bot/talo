import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, supabase } from "@/api/client";
import { Loader2, CheckCircle2, AlertTriangle, HardHat } from "lucide-react";
import TaloLogo from "@/components/brand/TaloLogo";
import { LANGS, savedLang, saveLang } from "@/lib/workerI18n";

// Testi di questa pagina (l'operaio non ha ancora un account: la lingua si sceglie qui).
const TXT = {
  it: { titolo: "Benvenuto nella squadra", sotto: "Il tuo datore di lavoro ti ha invitato su Talo: da qui timbri, mandi foto e segnalazioni, vedi ore, documenti e avvisi.", nuovo: "Sono nuovo: crea il mio account", ho: "Ho già un account: accedi", collego: "Ti collego alla tua impresa…", fatto: "Fatto! Apro la tua app…", errore: "Invito non valido o scaduto: chiedi al tuo capo un nuovo QR.", titolare: "Questo telefono è collegato all'account del titolare: l'invito va aperto con l'account dell'operaio.", esci: "Esci e usa un altro account" },
  ro: { titolo: "Bine ai venit în echipă", sotto: "Angajatorul tău te-a invitat pe Talo: de aici te pontezi, trimiți poze și rapoarte, vezi orele, documentele și anunțurile.", nuovo: "Sunt nou: creează-mi contul", ho: "Am deja cont: intră", collego: "Te conectez la firma ta…", fatto: "Gata! Deschid aplicația…", errore: "Invitație invalidă sau expirată: cere-i șefului un cod QR nou.", titolare: "Acest telefon este conectat la contul patronului: invitația trebuie deschisă cu contul muncitorului.", esci: "Ieși și folosește alt cont" },
  sq: { titolo: "Mirë se vjen në ekip", sotto: "Punëdhënësi yt të ka ftuar në Talo: nga këtu regjistron orarin, dërgon foto dhe sinjalizime, sheh orët, dokumentet dhe njoftimet.", nuovo: "Jam i ri: krijo llogarinë time", ho: "Kam llogari: hyr", collego: "Po të lidh me firmën tënde…", fatto: "U krye! Po hap aplikacionin…", errore: "Ftesë e pavlefshme ose e skaduar: kërkoji shefit një kod QR të ri.", titolare: "Ky telefon është i lidhur me llogarinë e pronarit: ftesa duhet hapur me llogarinë e punëtorit.", esci: "Dil dhe përdor një llogari tjetër" },
  de: { titolo: "Willkommen im Team", sotto: "Dein Arbeitgeber hat dich zu Talo eingeladen: Hier stempelst du, schickst Fotos und Meldungen und siehst Stunden, Dokumente und Mitteilungen.", nuovo: "Ich bin neu: Konto erstellen", ho: "Ich habe schon ein Konto: anmelden", collego: "Ich verbinde dich mit deiner Firma…", fatto: "Fertig! Die App wird geöffnet…", errore: "Einladung ungültig oder abgelaufen: Bitte deinen Chef um einen neuen QR-Code.", titolare: "Dieses Handy ist mit dem Konto des Inhabers verbunden: Die Einladung muss mit dem Konto des Arbeiters geöffnet werden.", esci: "Abmelden und anderes Konto verwenden" },
  bs: { titolo: "Dobrodošao u tim", sotto: "Tvoj poslodavac te pozvao na Talo: ovdje bilježiš dolazak, šalješ slike i prijave i vidiš sate, dokumente i obavijesti.", nuovo: "Nov sam: napravi moj račun", ho: "Već imam račun: prijavi se", collego: "Povezujem te s tvojom firmom…", fatto: "Gotovo! Otvaram aplikaciju…", errore: "Pozivnica nije važeća ili je istekla: traži od šefa novi QR kod.", titolare: "Ovaj telefon je povezan s računom vlasnika: pozivnicu treba otvoriti s računom radnika.", esci: "Odjavi se i koristi drugi račun" },
};

export default function JoinWorker() {
  const { inviteId } = useParams();
  const code = new URLSearchParams(window.location.search).get("c") || "";
  const [lang, setLang] = useState(savedLang() || "it");
  const [state, setState] = useState("check"); // check | anon | joining | done | error
  const [msg, setMsg] = useState("");
  const [errCode, setErrCode] = useState("");
  const tx = TXT[lang] || TXT.it;
  const back = `/entra/${inviteId}?c=${encodeURIComponent(code)}`;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) { setState("anon"); return; }
      setState("joining");
      try {
        const res = await api.functions.invoke("confirmCollaboratorInvite", { inviteId, code });
        if (res.data?.error) { setErrCode(res.data.code || (res.status === 409 ? "own_company" : "")); throw new Error(res.data.error); }
        setState("done");
        setTimeout(() => { window.location.href = "/"; }, 1200);
      } catch (e) { setMsg(e.message); setState("error"); }
    })();
  }, [inviteId, code]);

  const pick = (l) => { setLang(l); saveLang(l); };

  return (
    <main className="min-h-screen brushed text-white flex flex-col">
      <header className="p-5 flex items-center justify-between">
        <TaloLogo size={34} />
        <div className="flex rounded-lg bg-white/10 p-0.5" role="group" aria-label="Lingua">
          {LANGS.map((l) => <button key={l.code} type="button" onClick={() => pick(l.code)} aria-pressed={lang === l.code} className={`h-9 px-3 rounded-md text-sm font-bold ${lang === l.code ? "bg-white text-zinc-950" : "text-zinc-300"}`}>{l.short}</button>)}
        </div>
      </header>
      <div className="flex-1 grid place-items-center px-5 pb-12">
        <div className="w-full max-w-sm">
          <span className="grid place-items-center w-16 h-16 rounded-2xl glow-red" style={{ backgroundImage: "var(--metal-red)" }}><HardHat className="w-8 h-8" aria-hidden="true" /></span>
          <h1 className="font-display text-4xl font-bold uppercase leading-[0.95] mt-6">{tx.titolo}</h1>
          {state === "anon" && (
            <>
              <p className="text-zinc-300 mt-3">{tx.sotto}</p>
              <div className="space-y-3 mt-8">
                <Link to={`/register?ruolo=operaio&from=${encodeURIComponent(back)}`} className="w-full h-14 rounded-2xl bg-brand-600 font-semibold text-base flex items-center justify-center">{tx.nuovo}</Link>
                <Link to={`/login?from=${encodeURIComponent(back)}`} className="w-full h-14 rounded-2xl border border-white/20 font-semibold text-base flex items-center justify-center">{tx.ho}</Link>
              </div>
            </>
          )}
          {(state === "check" || state === "joining") && <p className="mt-6 flex items-center gap-2 text-zinc-300"><Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />{tx.collego}</p>}
          {state === "done" && <p className="mt-6 flex items-center gap-2 text-emerald-400 font-semibold"><CheckCircle2 className="w-5 h-5" aria-hidden="true" />{tx.fatto}</p>}
          {state === "error" && (
            <div className="mt-6 rounded-xl bg-white/10 p-4 space-y-3">
              <p className="flex items-start gap-2 font-semibold text-amber-300"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />{errCode === "own_company" ? tx.titolare : /scadut|expired/i.test(msg) || !msg ? tx.errore : msg}</p>
              {errCode !== "own_company" && msg && /scadut|expired/i.test(msg) && <p className="text-sm text-zinc-400">{msg}</p>}
              {errCode === "own_company" && (
                <button type="button" onClick={async () => { await supabase.auth.signOut(); setErrCode(""); setMsg(""); setState("anon"); }} className="w-full h-12 rounded-xl bg-white text-zinc-950 font-semibold">{tx.esci}</button>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
