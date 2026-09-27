import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function bytesToBinaryString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode(...chunk));
  }
  return chunks.join('');
}

function sanitizeHeader(value: string): string {
  // Strip CR/LF to prevent header/MIME injection (CWE-93)
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const bytes = new TextEncoder().encode(subject);
  return `=?utf-8?B?${btoa(bytesToBinaryString(bytes))}?=`;
}

function isAllowedAttachmentUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return false;
    // Block private/loopback/link-local IP ranges
    const ipMatch = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const [a, b] = [parseInt(ipMatch[1]), parseInt(ipMatch[2])];
      if (a === 10) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 127) return false;
      if (a === 169 && b === 254) return false;
      if (a === 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadAttachment(url: string): Promise<Uint8Array | null> {
  if (!isAllowedAttachmentUrl(url)) return null;
  try {
    const fileResp = await fetch(url);
    if (fileResp.ok) {
      const arrayBuffer = await fileResp.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
  } catch (e) {
    // Non bloccare l'invio se il download fallisce
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorizzato' }, { status: 401 });

    const { to, subject, body, from_email, attachment_url, attachment_name, attachments } = await req.json();

    if (!to || !subject || !from_email) {
      return Response.json({ error: 'Parametri mancanti: to, subject, from_email sono obbligatori' }, { status: 400 });
    }

    const accounts = await base44.asServiceRole.entities.EmailAccount.filter({
      email_address: from_email,
      active: true
    });
    const account = accounts[0];

    if (!account) {
      return Response.json({ error: 'Nessun account email configurato per questo indirizzo' }, { status: 404 });
    }

    // Authorization: only the account owner or an admin may use stored email credentials
    if (account.created_by_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'Non autorizzato a utilizzare questo account email' }, { status: 403 });
    }

    const displayName = sanitizeHeader(account.display_name || account.email_address);

    // Costruisce la lista degli allegati (supporta array multiplo e backward-compatible singolo)
    const attachmentList: { data: Uint8Array; name: string }[] = [];

    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        if (att.url) {
          const data = await downloadAttachment(att.url);
          if (data) {
            attachmentList.push({ data, name: att.name || 'documento' });
          }
        }
      }
    } else if (attachment_url) {
      const data = await downloadAttachment(attachment_url);
      if (data) {
        attachmentList.push({ data, name: attachment_name || 'documento.pdf' });
      }
    }

    if (account.provider === 'gmail_oauth') {
      let tokenData;
      try {
        tokenData = await base44.asServiceRole.connectors.getConnection('gmail');
      } catch (e) {
        return Response.json({
          error: 'Gmail non collegato. Vai in Profilo Ditta → Caselle email per autorizzare Gmail.',
          provider: 'gmail_oauth',
          needs_reauth: true
        }, { status: 400 });
      }

      const accessToken = tokenData.accessToken;

      // Costruisce il messaggio MIME RFC 2822 (con supporto allegati multipli)
      const boundary = 'talo_boundary_' + Math.random().toString(36).substring(2);
      const lines: string[] = [];

      lines.push(`From: ${displayName} <${account.email_address}>`);
      lines.push(`To: ${sanitizeHeader(to)}`);
      lines.push(`Subject: ${encodeSubject(sanitizeHeader(subject))}`);
      lines.push('MIME-Version: 1.0');

      if (attachmentList.length > 0) {
        lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        lines.push('');
        // Parte testo
        lines.push(`--${boundary}`);
        lines.push('Content-Type: text/html; charset=utf-8');
        lines.push('Content-Transfer-Encoding: 8bit');
        lines.push('');
        lines.push(body);
        lines.push('');
        // Parti allegato
        for (const att of attachmentList) {
          lines.push(`--${boundary}`);
          const safeName = sanitizeHeader(att.name);
          lines.push(`Content-Type: application/octet-stream; name="${safeName}"`);
          lines.push('Content-Transfer-Encoding: base64');
          lines.push(`Content-Disposition: attachment; filename="${safeName}"`);
          lines.push('');
          const base64Content = btoa(bytesToBinaryString(att.data));
          for (let i = 0; i < base64Content.length; i += 76) {
            lines.push(base64Content.slice(i, i + 76));
          }
          lines.push('');
        }
        lines.push(`--${boundary}--`);
      } else {
        lines.push('Content-Type: text/html; charset=utf-8');
        lines.push('Content-Transfer-Encoding: 8bit');
        lines.push('');
        lines.push(body);
      }

      const rawMessage = lines.join('\r\n');
      const rawBytes = new TextEncoder().encode(rawMessage);
      const encoded = btoa(bytesToBinaryString(rawBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encoded })
      });

      if (response.status === 403) {
        return Response.json({
          error: 'Gmail non ha l\'autorizzazione per l\'invio email. Riautorizza l\'account Gmail con le autorizzazioni complete (ambito gmail.send).',
          provider: 'gmail_oauth',
          needs_reauth: true
        }, { status: 403 });
      }

      if (!response.ok) {
        const errText = await response.text();
        return Response.json({
          error: `Errore Gmail API (${response.status}): ${errText}`,
          provider: 'gmail_oauth'
        }, { status: 500 });
      }

      return Response.json({ success: true, provider: 'gmail_oauth' });

    } else if (account.provider === 'outlook_oauth') {
      return Response.json({
        error: 'Outlook OAuth non disponibile. Collega Outlook tramite SMTP con password per app.',
        provider: 'outlook_oauth',
        needs_smtp: true
      }, { status: 400 });

    } else {
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

      const mailOptions: any = {
        from: `"${displayName}" <${account.email_address}>`,
        to: to,
        subject: subject,
        html: body,
      };

      if (attachmentList.length > 0) {
        mailOptions.attachments = attachmentList.map(att => ({
          filename: att.name,
          content: Buffer.from(att.data),
        }));
      }

      const info = await transporter.sendMail(mailOptions);

      return Response.json({ success: true, provider: 'smtp', messageId: info.messageId });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});