// Minimal SMTP sender with no extra packages (works with Gmail, Brevo, Mailgun, Zoho, ...).
//
// Set these in .env to turn it on:
//   SMTP_HOST=smtp.gmail.com        (optional if SMTP_USER + SMTP_PASS are set: Gmail is assumed)
//   SMTP_PORT=465                   (465 = TLS from the start, 587 = STARTTLS)
//   SMTP_USER=you@gmail.com
//   SMTP_PASS=abcd efgh ijkl mnop   (Gmail: an "App password", NOT your normal password)
//   SMTP_FROM=Xyron <you@gmail.com> (optional)
//
// Note: Render FREE web services block outbound SMTP ports (25/465/587). On those, server.mjs
// automatically falls back to the Formspree sender. Paid Render instances and your own computer work.

import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

const env = (k) => String(process.env[k] || '').trim();

export function smtpConfig() {
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS').replace(/\s+/g, ''); // Gmail shows app passwords with spaces
  const host = env('SMTP_HOST') || (user && pass ? 'smtp.gmail.com' : '');
  if (!host || !user || !pass) return null;
  const port = Number(env('SMTP_PORT')) || 465;
  const secureEnv = env('SMTP_SECURE').toLowerCase();
  const secure = secureEnv ? ['1', 'true', 'yes', 'on'].includes(secureEnv) : port === 465;
  const from = env('SMTP_FROM') || `Xyron <${user}>`;
  return { host, port, secure, user, pass, from, rejectUnauthorized: env('SMTP_REJECT_UNAUTHORIZED').toLowerCase() !== 'false' };
}

export const smtpConfigured = () => Boolean(smtpConfig());

const addrOf = (s) => (String(s).match(/<([^>]+)>/)?.[1] || String(s)).trim();
const enc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const b64lines = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');

function buildMessage({ from, to, subject, text, html, host }) {
  const boundary = 'xyron_' + crypto.randomBytes(12).toString('hex');
  const head = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${enc(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${host}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(text)}`,
    html ? `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(html)}` : '',
    `--${boundary}--`,
  ].filter(Boolean).join('\r\n');
  return `${head}\r\n\r\n${parts}\r\n`;
}

// Reads SMTP replies (a reply may span several "250-..." lines and ends with "250 ...").
function makeReader(sock) {
  let buf = '';
  let waiting = null;
  let failure = null;
  const tryResolve = () => {
    if (!waiting) return;
    if (failure) { const w = waiting; waiting = null; return w.reject(failure); }
    const lines = buf.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
        const reply = lines.slice(0, i + 1);
        buf = lines.slice(i + 1).join('\r\n');
        const w = waiting; waiting = null;
        return w.resolve({ code: Number(reply[i].slice(0, 3)), lines: reply });
      }
    }
  };
  const onData = (d) => { buf += d.toString('utf8'); tryResolve(); };
  const onFail = (e) => { failure = e instanceof Error ? e : new Error('SMTP connection closed'); tryResolve(); };
  sock.on('data', onData);
  sock.on('error', onFail);
  sock.on('close', () => onFail(new Error('SMTP connection closed')));
  return {
    next: () => new Promise((resolve, reject) => { waiting = { resolve, reject }; tryResolve(); }),
    detach: () => { sock.off('data', onData); },
    reset: () => { buf = ''; },
  };
}

export async function sendSmtp({ to, subject, text, html }) {
  const cfg = smtpConfig();
  if (!cfg) throw new Error('SMTP is not configured');
  const timeoutMs = Number(env('SMTP_TIMEOUT_MS')) || 10000;

  let sock = await new Promise((resolve, reject) => {
    const opts = { host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized };
    const s = cfg.secure ? tls.connect(opts) : net.connect({ host: cfg.host, port: cfg.port });
    const t = setTimeout(() => { s.destroy(); reject(new Error(`SMTP connect timeout (${cfg.host}:${cfg.port})`)); }, timeoutMs);
    s.once(cfg.secure ? 'secureConnect' : 'connect', () => { clearTimeout(t); resolve(s); });
    s.once('error', (e) => { clearTimeout(t); reject(e); });
  });
  sock.setTimeout(timeoutMs, () => sock.destroy(new Error('SMTP timeout')));

  let reader = makeReader(sock);
  const expect = async (okCodes, what) => {
    const r = await reader.next();
    if (!okCodes.includes(r.code)) throw new Error(`SMTP ${what} failed: ${r.lines.join(' | ').slice(0, 200)}`);
    return r;
  };
  const cmd = async (line, okCodes, what) => { sock.write(line + '\r\n'); return expect(okCodes, what || line.split(' ')[0]); };

  try {
    await expect([220], 'greeting');
    let ehlo = await cmd(`EHLO ${env('SMTP_EHLO_NAME') || 'xyron.local'}`, [250], 'EHLO');

    if (!cfg.secure && ehlo.lines.some((l) => /STARTTLS/i.test(l))) {
      await cmd('STARTTLS', [220], 'STARTTLS');
      reader.detach();
      sock = tls.connect({ socket: sock, servername: cfg.host, rejectUnauthorized: cfg.rejectUnauthorized });
      await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
      sock.setTimeout(timeoutMs, () => sock.destroy(new Error('SMTP timeout')));
      reader = makeReader(sock);
      ehlo = await cmd(`EHLO ${env('SMTP_EHLO_NAME') || 'xyron.local'}`, [250], 'EHLO');
    } else if (!cfg.secure && !['localhost', '127.0.0.1', '::1'].includes(cfg.host)) {
      throw new Error('SMTP server does not offer STARTTLS; refusing to send the password unencrypted');
    }

    const authLine = ehlo.lines.find((l) => /AUTH /i.test(l)) || '';
    if (/PLAIN/i.test(authLine) || !authLine) {
      const token = Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString('base64');
      await cmd(`AUTH PLAIN ${token}`, [235], 'login (check SMTP_USER / app password)');
    } else if (/LOGIN/i.test(authLine)) {
      await cmd('AUTH LOGIN', [334], 'AUTH');
      await cmd(Buffer.from(cfg.user).toString('base64'), [334], 'AUTH user');
      await cmd(Buffer.from(cfg.pass).toString('base64'), [235], 'login (check SMTP_USER / app password)');
    } else {
      throw new Error('SMTP server offers no supported login method');
    }

    await cmd(`MAIL FROM:<${addrOf(cfg.from)}>`, [250], 'MAIL FROM');
    await cmd(`RCPT TO:<${addrOf(to)}>`, [250, 251], 'RCPT TO');
    await cmd('DATA', [354], 'DATA');
    const msg = buildMessage({ from: cfg.from, to, subject, text, html, host: cfg.host }).replace(/^\./gm, '..');
    sock.write(msg + '.\r\n');
    await expect([250], 'message');
    try { sock.write('QUIT\r\n'); } catch { /* ignore */ }
  } finally {
    sock.destroy();
  }
}
