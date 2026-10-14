import React from 'react';
import { logError } from '@/api/client';
import StatusScreen, { primaryBtn, ghostBtn } from '@/components/shared/StatusScreen';

// `inline`: l'errore resta dentro la pagina (menu e navigazione continuano a funzionare).
// `resetKey`: quando cambia (es. il percorso) la schermata di errore sparisce da sola.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error);
    logError(error, { componentStack: String(info?.componentStack || '').slice(0, 2000) });
  }

  componentDidUpdate(prev) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) this.setState({ hasError: false });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.inline) {
      return (
        <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center mt-10">
          <h1 className="font-display text-2xl font-bold uppercase text-zinc-900">Questa pagina ha avuto un problema</h1>
          <p className="mt-2 text-sm text-zinc-600">L'errore è stato registrato automaticamente: i dati già salvati non sono stati toccati. Puoi riprovare o passare a un'altra sezione dal menu.</p>
          <button type="button" onClick={() => window.location.reload()} className={`${primaryBtn} mt-5`}>Ricarica la pagina</button>
        </div>
      );
    }
    return (
      <StatusScreen
        title="Qualcosa è andato storto"
        actions={<>
          <button type="button" onClick={() => window.location.reload()} className={primaryBtn}>Ricarica la pagina</button>
          <a href="/" className={ghostBtn}>Vai alla dashboard</a>
        </>}
      >
        <p>Si è verificato un errore imprevisto. È stato registrato automaticamente: i dati già salvati non sono stati toccati.</p>
      </StatusScreen>
    );
  }
}
