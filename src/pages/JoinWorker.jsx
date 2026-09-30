import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, supabase } from "@/api/client";
import { Loader2, CheckCircle2, AlertTriangle, HardHat } from "lucide-react";
import TaloLogo from "@/components/brand/TaloLogo";
import { LANGS, savedLang, saveLang } from "@/lib/workerI18n";

// Testi di questa pagina (l'operaio non ha ancora un account: la lingua si sceglie qui).
const TXT = {
  it: { titolo: "Benvenuto nella squadra", sotto: "Il tuo datore di lavoro ti ha invitato su Talo: da qui timbri, mandi foto e segnalazioni, vedi ore, documenti e avvisi.", nuovo: "Sono nuovo: crea il mio account", ho: "Ho già un account: accedi", collego: "Ti collego alla tua impresa…", fatto: "Fatto! Apro la tua app…", errore: "Invito non valido o scaduto: chiedi al tuo capo un nuovo QR." },
  ro: { titolo: "Bine ai venit în echipă", sotto: "Angajatorul tău te-a invitat pe Talo: de aici te pontezi, trimiți poze și rapoarte, vezi orele, documentele și anunțurile.", nuovo: "Sunt nou: creează-mi contul", ho: "Am deja cont: intră", collego: "Te conectez la firma ta…", fatto: "Gata! Deschid aplicația…", errore: "Invitație invalidă sau expirată: cere-i șefului un cod QR nou." },
  sq: { titolo: "Mirë se vjen në ekip", sotto: "Punëdhënësi yt të ka ftuar në Talo: nga këtu regjistron orarin, dërgon foto dhe sinjalizime, sheh orët, dokumentet dhe njoftimet.", nuovo: "Jam i ri: krijo llogarinë time", ho: "Kam llogari: hyr", collego: "Po të lidh me firmën tënde…", fatto: "U krye! Po hap aplikacionin…", errore: "Ftesë e pavlefshme ose e skaduar: kërkoji shefit një kod QR të ri." },
};

export default function JoinWorker() {
  const { inviteId } = useParams();
  const code = new URLSearchParams(window.location.search).get("c") || "";
  const [lang, setLang] = useState(savedLang() || "it");
  const [state, setState] = useState("check"); // check | anon | joining | done | error
  const [msg, setMsg] = useState("");
  const tx = TXT[lang] || TXT.it;
  const back = `/entra/${inviteId}?c=${encodeURIComponent(code)}`;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) { setState("anon"); return; }
      setState("joining");
      try {
        const res = await api.functions.invoke("confirmCollaboratorInvite", { inviteId, code });
        if (res.data?.error) throw new Error(res.data.error);
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
            <div className="mt-6 rounded-xl bg-white/10 p-4">
              <p className="flex items-center gap-2 font-semibold text-amber-300"><AlertTriangle className="w-5 h-5" aria-hidden="true" />{tx.errore}</p>
              {msg && <p className="text-sm text-zinc-400 mt-1">{msg}</p>}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
