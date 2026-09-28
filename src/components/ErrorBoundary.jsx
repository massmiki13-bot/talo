import React from 'react';
import { logError } from '@/api/client';
import StatusScreen, { primaryBtn, ghostBtn } from '@/components/shared/StatusScreen';

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

  render() {
    if (this.state.hasError) {
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
    return this.props.children;
  }
}
