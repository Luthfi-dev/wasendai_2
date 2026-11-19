import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const RUNTIME_SECRET_PATH = path.resolve(process.cwd(), '.runtime_secret');

function loadOrGenerateRuntimeSecret(): string {
  const fromEnv =
    process.env.APP_ENCRYPTION_KEY?.trim() ||
    process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    return fromEnv;
  }

  try {
    if (fs.existsSync(RUNTIME_SECRET_PATH)) {
      const stored = fs.readFileSync(RUNTIME_SECRET_PATH, 'utf8').trim();
      if (stored.length >= 32) {
        return stored;
      }
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(RUNTIME_SECRET_PATH, generated, { mode: 0o600 });
    return generated;
  } catch {
    // Ephemeral fallback if filesystem is read-only
    return crypto.randomBytes(48).toString('hex');
  }
}

const ROOT_SECRET = loadOrGenerateRuntimeSecret();

function deriveKey(purpose: string): Buffer {
  return crypto.createHmac('sha256', ROOT_SECRET).update(purpose).digest();
}

const ENC_KEY_GCM = deriveKey('japriin-aes-gcm-v2');
const SESSION_SIGNING_KEY = deriveKey('japriin-session-hmac-v2');
const LEGACY_CBC_KEY = crypto.scryptSync(ROOT_SECRET, 'japriin_legacy_cbc_salt', 32);

/**
 * Constant-time string comparison safe against length leaks.
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Burn comparable time before returning false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Encrypts sensitive strings (tokens, SMTP passwords, Gemini API keys, MySQL password)
 * using authenticated AES-256-GCM.
 */
export function encryptData(text: string): string {
  if (!text || typeof text !== 'string') return '';
  if (text.startsWith('gcm:')) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY_GCM, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `gcm:${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted strings.
 * Also supports legacy AES-256-CBC `ivHex:cipherHex` when decryptable with runtime key;
 * fails closed (returns '') on tampered GCM payloads.
 */
export function decryptData(encryptedText: string): string {
  if (!encryptedText || typeof encryptedText !== 'string') return '';

  if (encryptedText.startsWith('gcm:')) {
    const parts = encryptedText.split(':');
    if (parts.length !== 4) return '';
    try {
      const iv = Buffer.from(parts[1], 'hex');
      const tag = Buffer.from(parts[2], 'hex');
      const cipherHex = parts[3];
      const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY_GCM, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return '';
    }
  }

  // Legacy CBC support if ':' formatted 32-hex IV
  if (encryptedText.includes(':')) {
    const parts = encryptedText.split(':');
    if (parts.length === 2 && /^[0-9a-f]{32}$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1])) {
      try {
        const iv = Buffer.from(parts[0], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', LEGACY_CBC_KEY, iv);
        let dec = decipher.update(parts[1], 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
      } catch {
        return '';
      }
    }
  }

  // Plaintext unencrypted value (e.g. direct env/user input)
  return encryptedText;
}

/**
 * Hashes user passwords using scrypt with a per-user 16-byte random salt.
 */
export function hashPassword(password: string): string {
  if (!password) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

/**
 * Verifies user password against stored scrypt hash (or legacy HMAC-SHA256 hash).
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') return false;

  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    try {
      const [, salt, expectedHex] = parts;
      const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
      return safeEqual(derived, expectedHex);
    } catch {
      return false;
    }
  }

  // Legacy HMAC-SHA256 check (for smooth migration of existing hashed passwords)
  const legacyHash = crypto.createHmac('sha256', 'maudigi_salt_2026').update(password).digest('hex');
  return safeEqual(legacyHash, storedHash);
}

/**
 * Hashes user 4-8 digit security PIN using scrypt with a random 16-byte salt.
 */
export function hashPin(pin: string): string {
  if (!pin) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

/**
 * Verifies user PIN against stored scrypt hash (or legacy HMAC-SHA256 hash).
 */
export function verifyPin(pin: string, storedHash: string): boolean {
  if (!pin || !storedHash || typeof pin !== 'string' || typeof storedHash !== 'string') return false;

  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    try {
      const [, salt, expectedHex] = parts;
      const derived = crypto.scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
      return safeEqual(derived, expectedHex);
    } catch {
      return false;
    }
  }

  const legacyHash = crypto.createHmac('sha256', 'maudigi_pin_user_salt_2026').update(pin).digest('hex');
  return safeEqual(legacyHash, storedHash);
}

/**
 * Returns true if stored hash is legacy format and should be re-hashed on next login.
 */
export function needsHashUpgrade(storedHash?: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;
  return !storedHash.startsWith('scrypt:');
}

/**
 * Signs an opaque session token or payload with HMAC-SHA256.
 */
export function signToken(payload: string): string {
  const sig = crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verifies an HMAC-signed token and returns the payload or null if invalid.
 */
export function verifySignedToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expectedSig = crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(payload).digest('base64url');
  return safeEqual(sig, expectedSig) ? payload : null;
}

/**
 * Verifies Superadmin Master PIN against either SUPERADMIN_MASTER_PIN env var
 * or the authenticated admin's hashed security_pin in database (no hardcoded PIN fallback).
 */
export function verifyMasterPin(inputPin: string, adminSecurityPinHash?: string): boolean {
  if (!inputPin || typeof inputPin !== 'string') return false;
  const trimmed = inputPin.trim();
  if (!trimmed) return false;

  const envPin = process.env.SUPERADMIN_MASTER_PIN?.trim();
  if (envPin) {
    return safeEqual(trimmed, envPin);
  }

  if (adminSecurityPinHash) {
    return verifyPin(trimmed, adminSecurityPinHash);
  }

  return false;
}

/**
 * Masks sensitive keys for safe frontend display (e.g., AIzaSy****_wXYZ).
 */
export function maskSensitiveString(str: string, showFirst = 4, showLast = 4): string {
  if (!str) return '';
  if (str.length <= showFirst + showLast) {
    return '*'.repeat(str.length);
  }
  const start = str.slice(0, showFirst);
  const end = str.slice(-showLast);
  return `${start}${'*'.repeat(Math.min(12, str.length - showFirst - showLast))}${end}`;
}

export const maskSecret = maskSensitiveString;

/**
 * Generates a cryptographically secure 6-digit numeric OTP code.
 */
export function generateOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Generates a high-entropy random API Bearer token.
 */
export function generateApiKey(prefix = 'mgw_live_'): string {
  return `${prefix}${crypto.randomBytes(24).toString('hex')}`;
}
