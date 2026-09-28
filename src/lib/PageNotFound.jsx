import React from "react";
import { Link, useLocation } from "react-router-dom";
import StatusScreen, { primaryBtn, ghostBtn } from "@/components/shared/StatusScreen";

export default function PageNotFound() {
  const { pathname } = useLocation();
  return (
    <StatusScreen
      code="404"
      title="Pagina non trovata"
      actions={<>
        <Link to="/" className={primaryBtn}>Vai alla dashboard</Link>
        <button type="button" onClick={() => window.history.back()} className={ghostBtn}>Torna indietro</button>
      </>}
    >
      <p>L'indirizzo <span className="font-mono text-zinc-100 break-all">{pathname}</span> non esiste o è stato spostato. Controlla il link oppure riparti dalla dashboard.</p>
    </StatusScreen>
  );
}
