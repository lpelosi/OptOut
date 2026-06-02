import nodemailer from 'nodemailer';
import { config } from './config.js';

// One shared transport. If SMTP isn't configured (dev), fall back to logging.
let transport = null;
if (config.smtp.host) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

export async function sendLoginCode(email, code) {
  const subject = `Your ${config.appName} sign-in code`;
  const text = `Your ${config.appName} code is ${code}\n\nIt expires in ${config.magicCodeTtlMin} minutes. If you didn't request this, ignore this email.`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto">
      <h2 style="margin:0 0 8px">${config.appName}</h2>
      <p style="color:#555">Use this code to sign in:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
      <p style="color:#888;font-size:13px">Expires in ${config.magicCodeTtlMin} minutes. If you didn't request this, ignore this email.</p>
    </div>`;

  if (!transport) {
    console.log(`[mailer:dev] login code for ${email}: ${code}`);
    return;
  }
  await transport.sendMail({ from: config.smtp.from, to: email, subject, text, html });
}
