import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorizzato' }, { status: 401 });

    const { account_id } = await req.json();
    if (!account_id) return Response.json({ error: 'account_id mancante' }, { status: 400 });

    const accounts = await base44.asServiceRole.entities.EmailAccount.filter({ id: account_id });
    const account = accounts[0];
    if (!account) return Response.json({ error: 'Account non trovato' }, { status: 404 });

    // Gmail OAuth: verifica che il token sia valido
    if (account.provider === 'gmail_oauth') {
      try {
        const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
          const profile = await res.json();
          return Response.json({
            connected: true,
            status: 'ready',
            message: 'Pronta per l\'invio',
            email_address: profile.emailAddress
          });
        }
        return Response.json({
          connected: false,
          status: 'needs_reauth',
          message: 'Autorizzazione scaduta, ricollega Gmail'
        });
      } catch (e) {
        return Response.json({
          connected: false,
          status: 'not_authorized',
          message: 'Gmail non autorizzato per l\'invio'
        });
      }
    }

    // SMTP: verifica connessione al server
    if (account.provider === 'smtp') {
      if (!account.smtp_host || !account.smtp_password) {
        return Response.json({
          connected: false,
          status: 'incomplete',
          message: 'Dati SMTP incompleti — inserisci server e password per app'
        });
      }
      try {
        const nodemailer = (await import('npm:nodemailer@6.9.16')).default;
        const port = account.smtp_port || 587;
        const transporter = nodemailer.createTransport({
          host: account.smtp_host,
          port: port,
          secure: port === 465,
          auth: {
            user: account.smtp_username || account.email_address,
            pass: account.smtp_password
          }
        });
        await transporter.verify();
        return Response.json({
          connected: true,
          status: 'ready',
          message: 'Pronta per l\'invio'
        });
      } catch (e) {
        return Response.json({
          connected: false,
          status: 'auth_failed',
          message: 'Verifica fallita: ' + e.message
        });
      }
    }

    return Response.json({
      connected: false,
      status: 'unknown',
      message: 'Provider non supportato'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});