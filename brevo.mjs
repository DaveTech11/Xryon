// Brevo (https://www.brevo.com) transactional email over HTTPS, used for the sign-up / sign-in codes.
// Works on Render's free tier because it does not use SMTP ports.
//
// Render -> Environment:
//   BREVO_API_KEY     an API key (starts "xkeysib-"), NOT an SMTP key (starts "xsmtp-")
//   BREVO_FROM_EMAIL  a sender you added and verified in Brevo -> Senders, Domains & Dedicated IPs -> Senders
//   BREVO_FROM_NAME   optional, defaults to "Xyron"
// Nothing else is needed. Brevo is tried first whenever BREVO_API_KEY is set.

export const BREVO_URL = process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';

// Removes the usual copy-paste mistakes: quotes, "api-key:" / "BREVO_API_KEY=" in front, spaces and line breaks.
export function cleanBrevoKey(raw) {
  const quotes = (v) => v.replace(/^["'`]+|["'`]+$/g, '').trim();
  let k = quotes(String(raw || '').trim());
  k = k.replace(/^(?:export\s+)?BREVO_API_KEY\s*=\s*/i, '');
  k = quotes(k).replace(/^api-key\s*:\s*/i, '');
  return quotes(k).replace(/\s+/g, '');
}
export const brevoConfigured = () => Boolean(cleanBrevoKey(process.env.BREVO_API_KEY));

// "Xyron <hello@x.com>" or just "hello@x.com" -> { name, email }
export function brevoSender() {
  const raw = String(process.env.BREVO_FROM_EMAIL || '').trim().replace(/^["'`]+|["'`]+$/g, '');
  const m = raw.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
  const email = (m ? m[2] : raw).trim();
  const name = String(process.env.BREVO_FROM_NAME || (m && m[1].trim().replace(/^["']|["']$/g, '')) || 'Xyron').trim();
  return { name, email };
}

// Plain-English reason for a Brevo failure (shown on the sign-up screen and in the log).
export function brevoHint(status, text = '') {
  const t = String(text);
  if (/unrecognised ip|unrecognized ip|ip address/i.test(t)) return "Brevo blocks this server's IP address. In Brevo go to Security -> Authorised IPs and turn blocking off (Render's IP changes), then try again.";
  if (/sender/i.test(t) && /(not valid|invalid|not verified|not allowed|not found)/i.test(t)) return 'The sender in BREVO_FROM_EMAIL is not verified in Brevo. Add it under Senders and confirm the email Brevo sends you.';
  if (/not yet activated|account.*(activat|suspend|disabled)|contact.*support/i.test(t)) return 'Your Brevo account is not activated for sending yet. Contact Brevo support (or finish their account verification) and try again.';
  if (/(daily|credit|quota|limit)/i.test(t) || status === 429 || status === 402) return 'Brevo sending limit reached (free plan is about 300 emails a day). Try again later.';
  if (status === 401) return 'Brevo rejected the API key. Create a new API key (starts "xkeysib-") in Brevo -> SMTP & API -> API Keys and paste it into BREVO_API_KEY with no quotes or spaces.';
  if (status === 400) return 'Brevo rejected the request, usually a bad sender or recipient email address.';
  if (status >= 500) return 'Brevo itself is having problems. Try again shortly.';
  return '';
}

export function describeBrevoConfig() {
  const k = cleanBrevoKey(process.env.BREVO_API_KEY);
  if (!k) return 'Brevo: NOT SET (add BREVO_API_KEY and BREVO_FROM_EMAIL in Render to send codes with Brevo)';
  const s = brevoSender();
  const kind = k.startsWith('xkeysib-') ? 'API key ok' : k.startsWith('xsmtp-') ? 'WRONG KEY TYPE: this is an SMTP key, use an API key (xkeysib-...)' : 'key does not start with xkeysib- (check it)';
  return `Brevo: ${kind}, ${k.length} chars | sender=${s.email || 'NOT SET (BREVO_FROM_EMAIL)'} name="${s.name}"`;
}

export async function sendBrevo({ to, subject, text, html }) {
  const key = cleanBrevoKey(process.env.BREVO_API_KEY);
  if (!key) throw Error('Brevo: BREVO_API_KEY is not set');
  if (key.startsWith('xsmtp-')) throw Error('Brevo: BREVO_API_KEY is an SMTP key (xsmtp-...). Use an API key (xkeysib-...) from Brevo -> SMTP & API -> API Keys.');
  const sender = brevoSender();
  if (!sender.email) throw Error('Brevo: set BREVO_FROM_EMAIL to a sender verified in your Brevo account');
  let r;
  try {
    r = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw Error(`Brevo could not be reached (${e?.cause?.code || e?.name || e?.message}). The server may have no internet access to api.brevo.com.`);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    let msg = body;
    try { const j = JSON.parse(body); msg = j.message || j.error || body; } catch { /* plain text */ }
    const hint = brevoHint(r.status, msg);
    throw Error(`Brevo error (${r.status}): ${String(msg).replace(/\s+/g, ' ').slice(0, 200)}${hint ? ` - ${hint}` : ''}`);
  }
  return true;
}
