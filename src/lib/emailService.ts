import nodemailer from 'nodemailer';
import { getActiveSmtpAccounts, updateSmtpStats, initDbFile } from './db.js';
import { decryptData } from './security.js';

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHeaderCrlf(value: string): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

export function formatSmtpErrorMessage(err: any): string {
  const rawMsg = typeof err === 'string' ? err : (err?.message || 'Gagal terhubung ke server SMTP');
  const lower = rawMsg.toLowerCase();

  if (lower.includes('missing credentials') || lower.includes('plain')) {
    return 'App Password SMTP kosong atau gagal didekripsi (APP_ENCRYPTION_KEY berubah). Silakan perbarui App Password 16 digit pada akun SMTP di panel Admin.';
  }
  if (rawMsg.includes('Username and Password not accepted') || rawMsg.includes('535')) {
    return 'Email atau App Password ditolak Google (535). Pastikan Anda menggunakan "App Password 16 digit" Google (bukan password login biasa) dan Verifikasi 2 Langkah di akun Google sudah aktif.';
  }
  if (rawMsg.includes('ETIMEDOUT') || rawMsg.includes('ECONNREFUSED') || rawMsg.includes('ENOTFOUND')) {
    return 'Koneksi timeout / ditolak server SMTP. Periksa kembali Host & Port (587 atau 465).';
  }
  return rawMsg;
}

function createSmtpTransport(acc: {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
}) {
  const cleanHost = stripHeaderCrlf(acc.host) || 'smtp.gmail.com';
  const cleanPort = Number(acc.port) || 587;
  const isSsl = cleanPort === 465 ? true : Boolean(acc.secure);
  const cleanUser = stripHeaderCrlf(acc.user);

  if (!cleanUser) {
    throw new Error('Email pengirim (user) SMTP kosong. Silakan periksa konfigurasi akun SMTP.');
  }

  const rawPass = decryptData(acc.pass);
  const cleanPass = cleanHost.toLowerCase().includes('gmail.com')
    ? rawPass.replace(/\s+/g, '')
    : rawPass.trim();

  if (!cleanPass) {
    const hadCiphertext = Boolean(acc.pass && String(acc.pass).trim().length > 0);
    if (hadCiphertext) {
      throw new Error(
        'App Password SMTP gagal didekripsi (APP_ENCRYPTION_KEY berubah atau tidak cocok). Silakan perbarui App Password 16 digit pada akun SMTP ini di Pengaturan SMTP.'
      );
    }
    throw new Error(
      'App Password SMTP belum diisi. Silakan isi App Password 16 digit pada akun SMTP ini di Pengaturan SMTP.'
    );
  }

  return nodemailer.createTransport({
    host: cleanHost,
    port: cleanPort,
    secure: isSsl,
    auth: {
      user: cleanUser,
      pass: cleanPass
    },
    requireTLS: cleanPort === 587,
    tls: {
      rejectUnauthorized: process.env.SMTP_ALLOW_INSECURE_TLS !== 'true',
      minVersion: 'TLSv1.2'
    },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000
  });
}

export async function testSmtpAccountConnection(options: {
  accountId?: string;
  recipientEmail?: string;
}): Promise<{
  success: boolean;
  message: string;
  usedAccount?: string;
  error?: string;
}> {
  const db = initDbFile();
  const wl = db.systemConfig?.whitelabel_config;
  const appName = wl?.app_name || 'Japriin';

  let acc = options.accountId
    ? (db.smtpAccounts || []).find(a => a.id === options.accountId)
    : undefined;

  if (!acc) {
    const activeAccounts = getActiveSmtpAccounts();
    if (activeAccounts.length === 0) {
      return {
        success: false,
        message: 'Belum ada akun SMTP aktif di database. Silakan tambahkan minimal 1 akun SMTP Gmail.',
        error: 'Tidak ada akun SMTP aktif'
      };
    }
    acc = activeAccounts[0];
  }

  try {
    const transporter = createSmtpTransport(acc);
    await transporter.verify();

    if (options.recipientEmail && options.recipientEmail.includes('@')) {
      const safeTarget = stripHeaderCrlf(options.recipientEmail);
      const safeAppName = escapeHtml(appName);
      const safeAccName = escapeHtml(acc.name);
      const safeAccUser = escapeHtml(acc.user);
      const safeHost = escapeHtml(`${acc.host}:${acc.port}`);

      await transporter.sendMail({
        from: `"${stripHeaderCrlf(acc.sender_name || appName)}" <${stripHeaderCrlf(acc.user)}>`,
        to: safeTarget,
        subject: stripHeaderCrlf(`[Tes Koneksi] ${appName} Multi-SMTP Berhasil!`),
        html: `
          <div style="font-family: 'Inter', Arial, sans-serif; padding: 28px; background: #f8fafc; color: #0f172a; max-width: 520px; margin: 0 auto; border-radius: 16px; border: 1px solid #e2e8f0;">
            <div style="background: linear-gradient(135deg, #10b981, #0d9488); color: white; padding: 18px 24px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
              <h2 style="margin: 0; font-size: 18px; font-weight: 800;">${safeAppName} — SMTP Connected</h2>
              <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.9;">Konfigurasi Email Rotasi Siap Mengirim OTP Pendaftar</p>
            </div>
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Halo Admin! Email ini dikirim sebagai uji coba koneksi menggunakan akun SMTP <strong>${safeAccName}</strong> (${safeAccUser}).
            </p>
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 14px; border-radius: 12px; margin: 16px 0; font-size: 13px; color: #065f46;">
              ✓ Server SMTP (${safeHost}) terautentikasi &amp; berfungsi 100%!
            </div>
            <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 24px;">
              Dikirim otomatis oleh ${safeAppName} Engine
            </p>
          </div>
        `
      });
      updateSmtpStats(acc.id, true);
      return {
        success: true,
        message: `Tes koneksi & pengiriman email via ${acc.user} ke ${safeTarget} BERHASIL!`,
        usedAccount: acc.user
      };
    }

    updateSmtpStats(acc.id, true);
    return {
      success: true,
      message: `Autentikasi SMTP ${acc.user} (${acc.host}:${acc.port}) TERHUBUNG SEMPURNA!`,
      usedAccount: acc.user
    };
  } catch (err: any) {
    const friendlyMsg = formatSmtpErrorMessage(err);
    updateSmtpStats(acc.id, false, friendlyMsg);
    return {
      success: false,
      message: friendlyMsg,
      error: friendlyMsg,
      usedAccount: acc.user
    };
  }
}

export async function sendEmailWithRotation(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; usedAccount?: string; error?: string }> {
  const accounts = getActiveSmtpAccounts();
  const db = initDbFile();
  const appName = db.systemConfig?.whitelabel_config?.app_name || 'Japriin';

  const safeTo = stripHeaderCrlf(options.to);
  const safeSubject = stripHeaderCrlf(options.subject);

  if (accounts.length === 0) {
    console.warn('[Email Rotation] No active SMTP accounts configured. Email cannot be dispatched.');
    return {
      success: false,
      error: 'Belum ada akun SMTP aktif di database. Silakan tambahkan minimal 1 akun SMTP di tab Kredensial.'
    };
  }

  let lastError = '';

  for (const acc of accounts) {
    try {
      const transporter = createSmtpTransport(acc);

      await transporter.sendMail({
        from: `"${stripHeaderCrlf(acc.sender_name || appName)}" <${stripHeaderCrlf(acc.user)}>`,
        to: safeTo,
        subject: safeSubject,
        text: options.text || options.html.replace(/<[^>]+>/g, ''),
        html: options.html
      });

      updateSmtpStats(acc.id, true);
      console.log(`[Email Rotation] Successfully sent to ${safeTo} via SMTP: ${acc.user}`);
      return { success: true, usedAccount: acc.user };
    } catch (err: any) {
      const friendlyMsg = formatSmtpErrorMessage(err);
      lastError = friendlyMsg;
      console.warn(`[Email Rotation] Failed via ${acc.user}, rotating to next SMTP:`, friendlyMsg);
      updateSmtpStats(acc.id, false, friendlyMsg);
    }
  }

  return {
    success: false,
    error: `Semua akun SMTP (${accounts.length}) gagal mengirim email. Detail: ${lastError}`
  };
}

export async function sendVerificationOtpEmail(toEmail: string, username: string, otp: string) {
  const db = initDbFile();
  const wl = db.systemConfig?.whitelabel_config;
  const appName = escapeHtml(wl?.app_name || 'Japriin');
  const footerText = escapeHtml(wl?.footer_text || `${wl?.app_name || 'Japriin'} Engine`);
  const safeUser = escapeHtml(username);
  const safeOtp = escapeHtml(otp);

  const subject = `[${stripHeaderCrlf(wl?.app_name || 'Japriin')}] Kode Verifikasi OTP Pendaftaran Anda: ${stripHeaderCrlf(otp)}`;
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; padding: 32px; background: #f8fafc; color: #0f172a; max-width: 520px; margin: 0 auto; border-radius: 16px; border: 1px solid #e2e8f0;">
      <div style="background: linear-gradient(135deg, #059669, #0d9488); color: white; padding: 20px 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">${appName}</h2>
        <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.9;">Verifikasi Keamanan Akun Baru</p>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Halo <strong>${safeUser}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Terima kasih telah mendaftar! Untuk mengaktifkan akun Anda, silakan masukkan kode verifikasi 6 digit berikut:
      </p>
      <div style="background: #ecfdf5; border: 2px dashed #10b981; padding: 20px; border-radius: 12px; text-align: center; margin: 24px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #047857;">
          ${safeOtp}
        </span>
      </div>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5;">
        Kode ini berlaku selama <strong>15 menit</strong>. Jangan berikan kode rahasia ini kepada siapa pun.
      </p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 11px; color: #94a3b8; text-align: center;">
        Email ini dikirim secara otomatis oleh ${footerText}.
      </p>
    </div>
  `;

  return await sendEmailWithRotation({ to: toEmail, subject, html });
}

export async function sendPasswordResetEmail(toEmail: string, username: string, otp: string) {
  const db = initDbFile();
  const wl = db.systemConfig?.whitelabel_config;
  const appName = escapeHtml(wl?.app_name || 'Japriin');
  const safeUser = escapeHtml(username);
  const safeOtp = escapeHtml(otp);

  const subject = `[${stripHeaderCrlf(wl?.app_name || 'Japriin')}] Kode Reset Password Akun Anda`;
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; padding: 32px; background: #f8fafc; color: #0f172a; max-width: 520px; margin: 0 auto; border-radius: 16px; border: 1px solid #e2e8f0;">
      <div style="background: #1e293b; color: white; padding: 20px 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 800;">${appName} — Reset Password</h2>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Halo <strong>${safeUser}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Kami menerima permintaan untuk mereset password akun Anda. Gunakan kode OTP berikut ini untuk membuat password baru:
      </p>
      <div style="background: #eff6ff; border: 2px dashed #3b82f6; padding: 20px; border-radius: 12px; text-align: center; margin: 24px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #1d4ed8;">
          ${safeOtp}
        </span>
      </div>
      <p style="font-size: 12px; color: #64748b; line-height: 1.5;">
        Jika Anda tidak merasa meminta reset password, abaikan saja email ini.
      </p>
    </div>
  `;

  return await sendEmailWithRotation({ to: toEmail, subject, html });
}
