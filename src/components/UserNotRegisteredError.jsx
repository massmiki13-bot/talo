import React from "react";
import { api } from "@/api/client";
import StatusScreen, { primaryBtn, ghostBtn } from "@/components/shared/StatusScreen";

export default function UserNotRegisteredError() {
  return (
    <StatusScreen
      title="Accesso non autorizzato"
      actions={<>
        <button type="button" onClick={() => api.auth.logout("/login")} className={primaryBtn}>Entra con un altro account</button>
        <a href="mailto:talo.application@gmail.com" className={ghostBtn}>Scrivi all'assistenza</a>
      </>}
    >
      <p>Questo account non è collegato a nessuna azienda su Talo.</p>
      <ul className="mt-4 space-y-1.5 text-sm text-zinc-400 list-disc list-inside">
        <li>Controlla di aver effettuato l'accesso con l'email giusta.</li>
        <li>Se sei un collaboratore, chiedi al titolare di inviarti di nuovo l'invito.</li>
        <li>Se il problema continua, esci e rientra.</li>
      </ul>
    </StatusScreen>
  );
}
