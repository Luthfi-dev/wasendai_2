import React, { useState } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import {
  Code,
  Copy,
  Check,
  Send,
  Sparkles,
  Terminal,
  Key,
  ShieldCheck,
  Zap,
  Globe,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  RefreshCw,
  Server,
  Image as ImageIcon,
  FileText,
  Upload
} from 'lucide-react';
import { UserAccount } from '../types/whatsapp';

interface ApiDocsPanelProps {
  currentUser: UserAccount | null;
}

type PayloadMode = 'text' | 'media_only' | 'media_caption' | 'text_and_media' | 'document';

export const ApiDocsPanel: React.FC<ApiDocsPanelProps> = ({ currentUser }) => {
  const [selectedLang, setSelectedLang] = useState<'curl' | 'nodejs' | 'python' | 'php'>('curl');
  const [activeEndpoint, setActiveEndpoint] = useState<'send' | 'status' | 'broadcast' | 'guide'>('send');
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [systemPhone, setSystemPhone] = useState('...');

  // Fetch Config (Admin only) or fallback to current user's phone
  React.useEffect(() => {
    if (currentUser?.role !== 'admin') {
      if (currentUser?.phone) setSystemPhone(currentUser.phone);
      return;
    }
    apiFetch('/api/config')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        const cfg = d.data || d;
        if (cfg.active_phone_number) setSystemPhone(cfg.active_phone_number);
        else if (cfg.primary_bot_phone) setSystemPhone(cfg.primary_bot_phone);
      })
      .catch(() => {});
  }, [currentUser?.role, currentUser?.phone]);

  // Live Test State
  const [payloadMode, setPayloadMode] = useState<PayloadMode>('text');
  const [testTo, setTestTo] = useState('081234567890');
  const [testMessage, setTestMessage] = useState('Halo! Pesanan Anda telah kami konfirmasi.');
  const [testCaption, setTestCaption] = useState('Berikut detail gambar/promo pesanan Anda.');
  const [mediaSourceType, setMediaSourceType] = useState<'url' | 'base64'>('url');
  const [mediaType, setMediaType] = useState<'image' | 'document'>('image');
  const [mediaUrl, setMediaUrl] = useState('https://picsum.photos/seed/japriin/600/400.jpg');
  const [mediaBase64, setMediaBase64] = useState('');
  const [mimeType, setMimeType] = useState('application/pdf');
  const [fileName, setFileName] = useState('invoice-pesanan.pdf');
  const [isTesting, setIsTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<any | null>(null);

  const token = currentUser?.api_key || 'API_TOKEN_ANDA';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const handleModeChange = (nextMode: PayloadMode) => {
    setPayloadMode(nextMode);
    if (nextMode === 'document') {
      setMediaType('document');
      if (mediaUrl.includes('picsum.photos')) {
        setMediaUrl('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
      }
    } else if (nextMode === 'media_only' || nextMode === 'media_caption' || nextMode === 'text_and_media') {
      if (mediaType === 'document' && nextMode !== 'text_and_media') {
        setMediaType('image');
      }
      if (mediaUrl.includes('dummy.pdf')) {
        setMediaUrl('https://picsum.photos/seed/japriin/600/400.jpg');
      }
    }
  };

  const handleUploadLocalMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 9 * 1024 * 1024) {
      setTestResponse({ status: 400, data: { error: 'Ukuran file maksimal 9 MB untuk uji coba langsung.' } });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setMediaSourceType('base64');
      setMediaBase64(dataUrl);
      setFileName(file.name);
      if (file.type) {
        setMimeType(file.type);
        setMediaType(file.type.startsWith('image/') ? 'image' : 'document');
      }
    };
    reader.readAsDataURL(file);
  };

  const buildPayloadObject = (forSnippetDisplay: boolean): Record<string, any> => {
    const targetObj: Record<string, any> =
      activeEndpoint === 'broadcast'
        ? { recipients: [testTo, '081298765432'] }
        : { to: testTo };

    if (payloadMode === 'text') {
      return { ...targetObj, message: testMessage };
    }

    const effectiveMediaType = payloadMode === 'document' ? 'document' : mediaType;
    const mediaFields: Record<string, any> = {
      media_type: effectiveMediaType
    };

    if (mediaSourceType === 'base64') {
      mediaFields.media_base64 = forSnippetDisplay
        ? (mediaBase64 ? `${mediaBase64.slice(0, 48)}...<BASE64_FILE>` : 'data:application/pdf;base64,JVBERi0xLjQK...')
        : mediaBase64;
      if (mimeType) mediaFields.mimetype = mimeType;
    } else {
      mediaFields.media_url = mediaUrl;
    }

    if (effectiveMediaType === 'document') {
      mediaFields.file_name = fileName || 'dokumen.pdf';
      if (mediaSourceType === 'url' && mimeType) {
        mediaFields.mimetype = mimeType;
      }
    }

    if (payloadMode === 'media_only') {
      return { ...targetObj, ...mediaFields };
    }
    if (payloadMode === 'media_caption') {
      return { ...targetObj, ...mediaFields, caption: testCaption };
    }
    if (payloadMode === 'text_and_media') {
      return {
        ...targetObj,
        message: testMessage,
        caption: testCaption,
        send_text_separately: true,
        ...mediaFields
      };
    }
    // document mode
    return {
      ...targetObj,
      ...mediaFields,
      ...(testCaption.trim() ? { caption: testCaption } : {}),
      ...(testMessage.trim() ? { message: testMessage, send_text_separately: true } : {})
    };
  };

  const handleCopy = (text: string, type: 'snippet' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'snippet') {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleExecuteLiveTest = async () => {
    setIsTesting(true);
    setTestResponse(null);
    try {
      if (activeEndpoint === 'send') {
        const res = await apiFetch('/api/v1/send-message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(buildPayloadObject(false))
        });
        const data = await res.json();
        setTestResponse({ status: res.status, data });
      } else if (activeEndpoint === 'status') {
        const res = await apiFetch('/api/v1/status', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        setTestResponse({ status: res.status, data });
      } else if (activeEndpoint === 'broadcast') {
        const res = await apiFetch('/api/v1/broadcast', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(buildPayloadObject(false))
        });
        const data = await res.json();
        setTestResponse({ status: res.status, data });
      }
    } catch (err: any) {
      setTestResponse({ status: 500, data: { error: err?.message || 'Gagal menghubungi server API.' } });
    } finally {
      setIsTesting(false);
    }
  };

  const toPhpArray = (obj: Record<string, any>): string => {
    const entries = Object.entries(obj).map(([k, v]) => {
      if (Array.isArray(v)) {
        return `    '${k}' => array(${v.map(x => `'${String(x).replace(/'/g, "\\'")}'`).join(', ')})`;
      }
      if (typeof v === 'boolean') {
        return `    '${k}' => ${v ? 'true' : 'false'}`;
      }
      return `    '${k}' => '${String(v).replace(/'/g, "\\'")}'`;
    });
    return `array(\n${entries.join(',\n')}\n  )`;
  };

  const getCodeSnippet = () => {
    if (activeEndpoint === 'status') {
      switch (selectedLang) {
        case 'curl':
          return `curl -X GET "${baseUrl}/api/v1/status" \\
  -H "Authorization: Bearer ${token}"`;
        case 'nodejs':
          return `const axios = require('axios');

async function checkStatus() {
  const res = await axios.get('${baseUrl}/api/v1/status', {
    headers: { 'Authorization': 'Bearer ${token}' }
  });
  console.log(res.data);
}
checkStatus();`;
        case 'python':
          return `import requests

res = requests.get("${baseUrl}/api/v1/status", headers={"Authorization": "Bearer ${token}"})
print(res.json())`;
        case 'php':
          return `<?php
$curl = curl_init();
curl_setopt_array($curl, array(
  CURLOPT_URL => '${baseUrl}/api/v1/status',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => array('Authorization: Bearer ${token}')
));
echo curl_exec($curl);
?>`;
      }
    }

    const endpointPath = activeEndpoint === 'broadcast' ? '/api/v1/broadcast' : '/api/v1/send-message';
    const payload = buildPayloadObject(true);
    const jsonPretty = JSON.stringify(payload, null, 2);
    const jsonIndented = jsonPretty.split('\n').map((l, i) => (i === 0 ? l : `  ${l}`)).join('\n');

    switch (selectedLang) {
      case 'curl':
        return `curl -X POST "${baseUrl}${endpointPath}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '${jsonIndented}'`;
      case 'nodejs':
        return `const axios = require('axios');

async function sendWhatsApp() {
  try {
    const response = await axios.post('${baseUrl}${endpointPath}', ${jsonPretty.split('\n').map((l, i) => (i === 0 ? l : `    ${l}`)).join('\n')}, {
      headers: {
        'Authorization': 'Bearer ${token}',
        'Content-Type': 'application/json'
      }
    });
    console.log('Success:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

sendWhatsApp();`;
      case 'python':
        return `import requests

url = "${baseUrl}${endpointPath}"
headers = {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json"
}
payload = ${jsonPretty.replace(/: true/g, ': True').replace(/: false/g, ': False')}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`;
      case 'php':
        return `<?php
$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => '${baseUrl}${endpointPath}',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS => json_encode(${toPhpArray(payload)}),
  CURLOPT_HTTPHEADER => array(
    'Authorization: Bearer ${token}',
    'Content-Type: application/json'
  ),
));

$response = curl_exec($curl);
curl_close($curl);
echo $response;
?>`;
    }
    return '';
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-7 text-white shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-2xl border border-indigo-500/30 shrink-0">
              <Code className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-indigo-200">
                  Dokumentasi Developer REST API v1
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                  LIVE DOCS
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Hubungkan website e-commerce, aplikasi kasir POS, CRM, ERP, atau sistem custom Anda ke WhatsApp Gateway dengan mudah. Cukup salin kode di bawah.
              </p>
            </div>
          </div>

          {/* Quick API Key Box */}
          <div className="bg-black/40 border border-white/10 p-3 rounded-2xl space-y-1 sm:max-w-xs shrink-0">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-bold">API Bearer Token Kamu:</span>
              <button
                onClick={() => handleCopy(token, 'token')}
                className="text-indigo-400 hover:underline font-bold flex items-center space-x-1"
              >
                {copiedToken ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedToken ? 'Disalin' : 'Salin'}</span>
              </button>
            </div>
            <code className="text-xs font-mono text-emerald-300 block truncate select-all">
              {token}
            </code>
          </div>
        </div>
      </div>

      {/* Main Documentation & Interactive Test Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Col: Endpoint Selector & Request Config */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pilih Endpoint REST API
            </h4>

            <div className="space-y-2">
              <button
                onClick={() => setActiveEndpoint('send')}
                className={`w-full p-3.5 rounded-2xl text-left border transition-all flex items-center justify-between ${
                  activeEndpoint === 'send'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-black font-mono">
                      POST
                    </span>
                    <span className="font-mono text-xs font-black">/api/v1/send-message</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Kirim teks, gambar, caption, atau dokumen PDF/Office ke 1 nomor
                  </p>
                </div>
              </button>

              <button
                onClick={() => setActiveEndpoint('status')}
                className={`w-full p-3.5 rounded-2xl text-left border transition-all flex items-center justify-between ${
                  activeEndpoint === 'status'
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-black font-mono">
                      GET
                    </span>
                    <span className="font-mono text-xs font-black">/api/v1/status</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cek status sesi gateway &amp; sisa kuota harian
                  </p>
                </div>
              </button>

              <button
                onClick={() => setActiveEndpoint('broadcast')}
                className={`w-full p-3.5 rounded-2xl text-left border transition-all flex items-center justify-between ${
                  activeEndpoint === 'broadcast'
                    ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-200 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-purple-600 text-white rounded text-[10px] font-black font-mono">
                      POST
                    </span>
                    <span className="font-mono text-xs font-black">/api/v1/broadcast</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Kirim teks, gambar, atau dokumen massal dengan proteksi jeda
                  </p>
                </div>
              </button>

              <button
                onClick={() => setActiveEndpoint('guide')}
                className={`w-full p-3.5 rounded-2xl text-left border transition-all flex items-center justify-between ${
                  activeEndpoint === 'guide'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-200 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-black font-mono">
                      GUIDE
                    </span>
                    <span className="font-mono text-xs font-black">Panduan Bot</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cara kirim pesan tanpa aplikasi
                  </p>
                </div>
              </button>
            </div>

            {/* Live Parameter Inputs */}
            {activeEndpoint !== 'status' && activeEndpoint !== 'guide' && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Mode Payload POST:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'text', label: 'Teks Saja' },
                        { id: 'media_only', label: 'Gambar Saja' },
                        { id: 'media_caption', label: 'Gambar + Caption' },
                        { id: 'text_and_media', label: 'Teks + Media' },
                        { id: 'document', label: 'Dokumen PDF/File' }
                      ] as const
                    ).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleModeChange(m.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border text-left transition-colors ${
                          payloadMode === m.id
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    {activeEndpoint === 'broadcast' ? 'Contoh Nomor Utama (recipients)' : 'Nomor Tujuan (to)'}
                  </label>
                  <input
                    type="text"
                    value={testTo}
                    onChange={e => setTestTo(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>

                {payloadMode !== 'text' && (
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Sumber Media / Dokumen
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setMediaSourceType('url')}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                            mediaSourceType === 'url'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          URL Publik
                        </button>
                        <button
                          type="button"
                          onClick={() => setMediaSourceType('base64')}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                            mediaSourceType === 'base64'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          Base64 / File
                        </button>
                      </div>
                    </div>

                    {payloadMode !== 'document' && (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-slate-500">media_type:</label>
                        <select
                          value={mediaType}
                          onChange={e => setMediaType(e.target.value as 'image' | 'document')}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-mono"
                        >
                          <option value="image">image (Gambar)</option>
                          <option value="document">document (PDF/DOC/ZIP)</option>
                        </select>
                      </div>
                    )}

                    {mediaSourceType === 'url' ? (
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">
                          media_url (HTTPS publik)
                        </label>
                        <input
                          type="url"
                          value={mediaUrl}
                          onChange={e => setMediaUrl(e.target.value)}
                          placeholder="https://domain-anda.com/file.pdf"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-dashed border-indigo-400 bg-white dark:bg-slate-900 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{mediaBase64 ? `File siap (${fileName})` : 'Pilih File Lokal (PDF/Gambar/DOCX)'}</span>
                          <input
                            type="file"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                            onChange={handleUploadLocalMedia}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}

                    {(payloadMode === 'document' || mediaType === 'document') && (
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">
                          Nama File (file_name)
                        </label>
                        <input
                          type="text"
                          value={fileName}
                          onChange={e => setFileName(e.target.value)}
                          placeholder="invoice-pesanan.pdf"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                      </div>
                    )}

                    {(payloadMode === 'media_caption' || payloadMode === 'text_and_media' || payloadMode === 'document') && (
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">
                          Caption Media (caption)
                        </label>
                        <input
                          type="text"
                          value={testCaption}
                          onChange={e => setTestCaption(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                    )}
                  </div>
                )}

                {(payloadMode === 'text' || payloadMode === 'text_and_media' || payloadMode === 'document') && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">
                      {payloadMode === 'text_and_media'
                        ? 'Pesan Teks Terpisah (message + send_text_separately: true)'
                        : payloadMode === 'document'
                          ? 'Teks Tambahan Opsional (message)'
                          : 'Isi Pesan (message)'}
                    </label>
                    <textarea
                      rows={3}
                      value={testMessage}
                      onChange={e => setTestMessage(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs"
                    />
                  </div>
                )}
              </div>
            )}

            {activeEndpoint === 'guide' && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs text-slate-600 dark:text-slate-400">
                <p className="font-bold text-slate-900 dark:text-white">Panduan WhatsApp BOT</p>
                <p>Chat nomor Anda sendiri <strong className="text-emerald-600 dark:text-emerald-400">{currentUser?.phone || '...'}</strong> dengan perintah berikut:</p>
                <div className="bg-slate-900 text-emerald-400 p-3 rounded-lg font-mono text-[11px] space-y-1">
                  <p>1. Ketik: <strong className="text-white">/send</strong> atau <strong className="text-white">/broadcast</strong></p>
                  <p>2. Balas verifikasi PIN</p>
                  <p>3. Kirim: <strong className="text-white">to=nomor,text=isi_pesan</strong></p>
                </div>
              </div>
            )}

            <button
              onClick={handleExecuteLiveTest}
              disabled={isTesting}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center space-x-2 min-h-[40px]"
            >
              {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>Jalankan Tes API Sekarang</span>
            </button>
          </div>
        </div>

        {/* Right Col: Code Generator & Live Console Response */}
        <div className="lg:col-span-7 space-y-4">
          {/* Code Snippet Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
                <span className="text-xs font-mono text-slate-400 pl-2">Salin &amp; Tempel Kode</span>
              </div>

              <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {(['curl', 'nodejs', 'python', 'php'] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => setSelectedLang(lang)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono transition-all ${
                      selectedLang === lang
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative p-4 font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed max-h-72">
              <button
                onClick={() => handleCopy(getCodeSnippet(), 'snippet')}
                className="absolute top-3 right-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? 'Tersalin!' : 'Copy Code'}</span>
              </button>
              <pre className="pr-20">{getCodeSnippet()}</pre>
            </div>
          </div>

          {/* Live Response Box */}
          {testResponse && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-500">Hasil Respons Server (Live):</span>
                <span className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-black ${
                  testResponse.status < 400
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                }`}>
                  Status HTTP: {testResponse.status}
                </span>
              </div>
              <pre className="p-3.5 bg-slate-950 text-emerald-400 rounded-2xl text-xs font-mono overflow-x-auto">
                {JSON.stringify(testResponse.data, null, 2)}
              </pre>
            </div>
          )}

          {/* Media & Document Parameter Reference */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Referensi Field POST (Teks, Gambar, Dokumen PDF/Office)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <code className="font-mono font-bold text-emerald-700 dark:text-emerald-400">message</code>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  Teks utama. Jika dikirim bersama media tanpa <code className="font-mono">caption</code>, otomatis menjadi caption, atau kirim terpisah jika <code className="font-mono">send_text_separately: true</code>.
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <code className="font-mono font-bold text-emerald-700 dark:text-emerald-400">media_url / media_base64</code>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  URL publik (HTTPS/HTTP) atau Data URI Base64 untuk gambar (PNG/JPG/WEBP), dokumen (PDF/DOCX/XLSX/PPTX/CSV/TXT/ZIP maks 10 MB), audio, atau video. Alias: <code className="font-mono">image_url</code>, <code className="font-mono">document_url</code>.
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <code className="font-mono font-bold text-emerald-700 dark:text-emerald-400">media_type &amp; caption</code>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  <code className="font-mono">media_type</code>: <code className="font-mono">image | document | video | audio</code> (opsional, terdeteksi otomatis dari MIME/ekstensi). <code className="font-mono">caption</code> opsional.
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <code className="font-mono font-bold text-emerald-700 dark:text-emerald-400">file_name &amp; send_text_separately</code>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  <code className="font-mono">file_name</code> menentukan nama lampiran PDF/dokumen di WhatsApp. Set <code className="font-mono">send_text_separately: true</code> untuk kirim teks &amp; media sebagai 2 pesan berurutan sekaligus.
                </p>
              </div>
            </div>
          </div>

          {/* Incoming Message Processing Info */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center space-x-2">
              <Globe className="w-4 h-4 text-emerald-600" />
              <span>Penerimaan Pesan Realtime (Baileys WebSocket &amp; Meta AI)</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pesan masuk dari pelanggan diproses langsung melalui koneksi WebSocket Baileys pada nomor yang tertaut (Auto-Reply Rules &amp; Meta AI gratis bawaan akun WhatsApp) dan langsung tercatat di Log Pesan tanpa perlu setup Webhook eksternal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
