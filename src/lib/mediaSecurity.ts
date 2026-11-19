import dns from 'dns';
import fs from 'fs';
import net from 'net';
import path from 'path';

export const MAX_OUTGOING_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB
const REMOTE_FETCH_TIMEOUT_MS = 15000;
const CATALOG_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'catalog');
const SAFE_LOCAL_CATALOG_FILE_RE = /^(?:prod|qris)_[a-f0-9-]+\.(png|jpg|webp|gif)$/i;

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4'
};

const MIME_TO_DEFAULT_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4'
};

export const ALLOWED_MEDIA_MIMETYPES = new Set<string>(Object.keys(MIME_TO_DEFAULT_EXT));

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = String(rawIp || '').trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (!ip) return true;

  if (ip.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(ip.slice('::ffff:'.length));
  }

  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10 + Alibaba metadata
    if (a === 127) return true; // Loopback 127.0.0.0/8
    if (a === 169 && b === 254) return true; // Link-local & cloud metadata 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // Private 172.16.0.0/12
    if (a === 192 && b === 168) return true; // Private 192.168.0.0/16
    if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // Benchmark
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  if (version === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // ULA fc00::/7
    if (ip.startsWith('fe80') || ip.startsWith('fec0')) return true; // Link-local
    if (ip.startsWith('ff')) return true; // Multicast
    return false;
  }

  return true;
}

export async function assertSafePublicMediaUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL media/dokumen tidak valid.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('URL media/dokumen hanya mendukung protokol http:// atau https://.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL dengan kredensial inline dilarang.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host === 'metadata' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Host tujuan URL media diblokir oleh kebijakan keamanan SSRF.');
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Alamat IP privat/lokal diblokir oleh kebijakan keamanan SSRF.');
    }
    return parsed;
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new Error(`Domain "${host}" gagal di-resolve.`);
  }
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw new Error(`Domain "${host}" tidak memiliki alamat IP valid.`);
  }
  for (const rec of resolved) {
    if (isPrivateOrReservedIp(rec.address)) {
      throw new Error('Host media mengarah ke jaringan privat/lokal dan diblokir.');
    }
  }

  return parsed;
}

function sanitizeSafeFileName(rawName: unknown, fallbackMime: string): string {
  const base = path.basename(String(rawName || '').trim()).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (base && base.length <= 140 && !base.startsWith('.')) {
    return base;
  }
  const ext = MIME_TO_DEFAULT_EXT[fallbackMime] || 'bin';
  return `file_${Date.now()}.${ext}`;
}

function inferMimeFromMagicBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const hdr6 = buf.slice(0, 6).toString('ascii');
  if (hdr6 === 'GIF87a' || hdr6 === 'GIF89a') return 'image/gif';
  if (buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

function looksLikeActiveMarkup(buf: Buffer): boolean {
  const head = buf.slice(0, 256).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<svg') || head.startsWith('<script');
}

function resolveMimeAndType(params: {
  explicitMime?: unknown;
  explicitType?: unknown;
  fileName?: string;
  buf: Buffer;
  hintField?: 'image' | 'document' | 'media';
}): { mediaType: 'image' | 'document' | 'video' | 'audio'; mimetype: string } {
  const magicMime = inferMimeFromMagicBytes(params.buf);
  const rawExplicitMime = typeof params.explicitMime === 'string'
    ? params.explicitMime.split(';')[0].trim().toLowerCase()
    : '';
  const normalizedExplicit = rawExplicitMime === 'image/jpg' ? 'image/jpeg' : rawExplicitMime;
  const extMime = params.fileName ? EXT_TO_MIME[path.extname(params.fileName).toLowerCase()] : undefined;

  let chosenMime = '';
  if (normalizedExplicit && ALLOWED_MEDIA_MIMETYPES.has(normalizedExplicit)) {
    chosenMime = normalizedExplicit;
  } else if (magicMime && ALLOWED_MEDIA_MIMETYPES.has(magicMime)) {
    chosenMime = magicMime;
  } else if (extMime && ALLOWED_MEDIA_MIMETYPES.has(extMime)) {
    chosenMime = extMime;
  }

  if (!chosenMime || !ALLOWED_MEDIA_MIMETYPES.has(chosenMime)) {
    throw new Error('Format/MIME media atau dokumen tidak didukung. Gunakan PNG, JPG, WEBP, GIF, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV, TXT, ZIP, MP3, OGG, atau MP4.');
  }

  if (chosenMime !== 'text/plain' && chosenMime !== 'text/csv' && looksLikeActiveMarkup(params.buf)) {
    throw new Error('Konten file terdeteksi sebagai HTML/SVG/Script dan ditolak demi keamanan.');
  }

  const reqType = typeof params.explicitType === 'string' ? params.explicitType.trim().toLowerCase() : '';
  if (reqType === 'image' || reqType === 'document' || reqType === 'video' || reqType === 'audio') {
    if (reqType === 'image' && !chosenMime.startsWith('image/')) {
      throw new Error('Tipe "image" harus menggunakan file gambar (PNG/JPG/WEBP/GIF).');
    }
    return { mediaType: reqType, mimetype: chosenMime };
  }

  if (params.hintField === 'document') {
    return { mediaType: 'document', mimetype: chosenMime };
  }
  if (chosenMime.startsWith('image/')) {
    return { mediaType: 'image', mimetype: chosenMime };
  }
  if (chosenMime.startsWith('video/')) {
    return { mediaType: 'video', mimetype: chosenMime };
  }
  if (chosenMime.startsWith('audio/')) {
    return { mediaType: 'audio', mimetype: chosenMime };
  }
  return { mediaType: 'document', mimetype: chosenMime };
}

export interface ResolvedApiMedia {
  hasMedia: true;
  mediaType: 'image' | 'document' | 'video' | 'audio';
  mediaBuffer: Buffer;
  mimetype: string;
  fileName: string;
}

export async function resolveIncomingApiMedia(
  body: Record<string, any> | undefined | null
): Promise<{ hasMedia: false } | ResolvedApiMedia> {
  if (!body || typeof body !== 'object') return { hasMedia: false };

  const rawUrl = String(body.media_url || body.image_url || body.document_url || body.file_url || '').trim();
  const rawBase64 = String(
    body.media_base64 || body.base64 || body.file_base64 || body.document_base64 || body.image_base64 || ''
  ).trim();

  if (!rawUrl && !rawBase64) {
    return { hasMedia: false };
  }

  const hintField: 'image' | 'document' | 'media' = body.document_url || body.document_base64
    ? 'document'
    : (body.image_url || body.image_base64 ? 'image' : 'media');

  if (rawBase64) {
    let dataUriMime = '';
    let b64Body = rawBase64;
    const dataUriMatch = rawBase64.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (dataUriMatch) {
      dataUriMime = dataUriMatch[1].trim().toLowerCase();
      b64Body = dataUriMatch[2];
    } else if (/^data:/i.test(rawBase64)) {
      throw new Error('Format Data URI base64 tidak valid.');
    }

    const cleanB64 = b64Body.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanB64) || cleanB64.length === 0) {
      throw new Error('Payload base64 tidak valid.');
    }
    if (cleanB64.length > MAX_OUTGOING_MEDIA_BYTES * 1.4) {
      throw new Error('Ukuran media/dokumen terlalu besar (maksimal 10 MB).');
    }

    const buf = Buffer.from(cleanB64, 'base64');
    if (buf.length === 0 || buf.length > MAX_OUTGOING_MEDIA_BYTES) {
      throw new Error('Ukuran media/dokumen harus antara 1 byte hingga 10 MB.');
    }

    const resolved = resolveMimeAndType({
      explicitMime: body.mimetype || dataUriMime,
      explicitType: body.media_type,
      fileName: body.file_name || body.filename,
      buf,
      hintField
    });
    const fileName = sanitizeSafeFileName(body.file_name || body.filename, resolved.mimetype);
    return {
      hasMedia: true,
      mediaType: resolved.mediaType,
      mediaBuffer: buf,
      mimetype: resolved.mimetype,
      fileName
    };
  }

  // Local catalog image fast read (e.g. /api/catalog/images/qris_xxx.png)
  if (rawUrl.startsWith('/api/catalog/images/')) {
    const filename = path.basename(rawUrl);
    if (!SAFE_LOCAL_CATALOG_FILE_RE.test(filename)) {
      throw new Error('Path file katalog lokal tidak valid.');
    }
    const localPath = path.resolve(CATALOG_UPLOAD_DIR, filename);
    if (!localPath.startsWith(CATALOG_UPLOAD_DIR + path.sep) || !fs.existsSync(localPath)) {
      throw new Error('File gambar lokal tidak ditemukan.');
    }
    const buf = fs.readFileSync(localPath);
    const resolved = resolveMimeAndType({
      explicitMime: body.mimetype,
      explicitType: body.media_type,
      fileName: filename,
      buf,
      hintField
    });
    return {
      hasMedia: true,
      mediaType: resolved.mediaType,
      mediaBuffer: buf,
      mimetype: resolved.mimetype,
      fileName: sanitizeSafeFileName(body.file_name || body.filename || filename, resolved.mimetype)
    };
  }

  // Remote URL with strict SSRF checks
  const safeUrl = await assertSafePublicMediaUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(safeUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Japriin-Gateway-MediaFetcher/1.0'
      }
    });

    if (resp.status >= 300 && resp.status < 400) {
      throw new Error('Redirect pada URL media ditolak demi mencegah SSRF.');
    }
    if (!resp.ok) {
      throw new Error(`Gagal mengunduh file dari URL (HTTP ${resp.status}).`);
    }

    const contentLen = Number(resp.headers.get('content-length') || 0);
    if (contentLen > MAX_OUTGOING_MEDIA_BYTES) {
      throw new Error('Ukuran file dari URL melebihi batas maksimal 10 MB.');
    }

    const ab = await resp.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length === 0 || buf.length > MAX_OUTGOING_MEDIA_BYTES) {
      throw new Error('Ukuran file dari URL harus antara 1 byte hingga 10 MB.');
    }

    const respMime = String(resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const urlBaseName = path.basename(safeUrl.pathname || '');
    const resolved = resolveMimeAndType({
      explicitMime: body.mimetype || (respMime && respMime !== 'application/octet-stream' ? respMime : ''),
      explicitType: body.media_type,
      fileName: body.file_name || body.filename || urlBaseName,
      buf,
      hintField
    });

    return {
      hasMedia: true,
      mediaType: resolved.mediaType,
      mediaBuffer: buf,
      mimetype: resolved.mimetype,
      fileName: sanitizeSafeFileName(body.file_name || body.filename || urlBaseName, resolved.mimetype)
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Timeout saat mengunduh media/dokumen dari URL (maks 15 detik).');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
