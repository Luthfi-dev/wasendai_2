import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import {
  ShieldCheck,
  Copy,
  Check,
  Key,
  Database,
  Globe,
  Mail,
  Bot,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  Send,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Settings,
  Lock,
  Unlock,
  Edit2,
  X
} from 'lucide-react';
import { EnvConfigMasked } from '../types/whatsapp';
import { ConfirmModal } from './ConfirmModal';
import { MetaAiVerifyModal } from './MetaAiVerifyModal';

interface ConfigPanelProps {
  config: EnvConfigMasked | null;
}

interface EditingSmtpDraft {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  sender_name: string;
  pass: string;
  is_active: boolean;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config }) => {
  const [activeSubTab, setActiveSubTab] = useState<'gateway' | 'smtp' | 'gemini'>('gateway');

  // Gateway Settings State
  const [appUrl, setAppUrl] = useState('');
  const [isSavingGateway, setIsSavingGateway] = useState(false);
  const [gatewayToast, setGatewayToast] = useState('');

  // Multi-SMTP State
  const [smtpList, setSmtpList] = useState<any[]>([]);
  const [newSmtpUser, setNewSmtpUser] = useState('');
  const [newSmtpPass, setNewSmtpPass] = useState('');
  const [newSmtpName, setNewSmtpName] = useState('');
  const [newSmtpHost, setNewSmtpHost] = useState('smtp.gmail.com');
  const [newSmtpPort, setNewSmtpPort] = useState(587);
  const [newSmtpSecure, setNewSmtpSecure] = useState(false);
  const [newSmtpSenderName, setNewSmtpSenderName] = useState('');
  const [isAddingSmtp, setIsAddingSmtp] = useState(false);
  const [testingSmtpId, setTestingSmtpId] = useState<string | null>(null);
  const [editingSmtp, setEditingSmtp] = useState<EditingSmtpDraft | null>(null);
  const [isSavingEditSmtp, setIsSavingEditSmtp] = useState(false);
  const [deleteConfirmSmtp, setDeleteConfirmSmtp] = useState<{ id: string; label: string } | null>(null);
  const [isDeletingSmtp, setIsDeletingSmtp] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [emailToast, setEmailToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Master PIN Lock State (required for mutating /api/smtp* & /api/config)
  const [masterUnlocked, setMasterUnlocked] = useState<boolean>(false);
  const [masterPinConfigured, setMasterPinConfigured] = useState<boolean>(true);
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [masterPinInput, setMasterPinInput] = useState<string>('');
  const [masterPinError, setMasterPinError] = useState<string>('');
  const [isUnlockingMaster, setIsUnlockingMaster] = useState<boolean>(false);

  // Meta AI WhatsApp & AI Config State
  const [metaAiStatus, setMetaAiStatus] = useState<{
    connected: boolean;
    verified: boolean;
    phone_number: string | null;
    session_id: string | null;
    queue_depth: number;
    meta_ai_jid: string;
    last_error: string | null;
    connected_sessions: Array<{ sessionId: string; userId: string; phoneNumber: string }>;
  }>({
    connected: false,
    verified: false,
    phone_number: null,
    session_id: null,
    queue_depth: 0,
    meta_ai_jid: '13135550002@s.whatsapp.net',
    last_error: null,
    connected_sessions: []
  });
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');
  const [aiFallbackNoRule, setAiFallbackNoRule] = useState(true);
  const [aiOfflineMessage, setAiOfflineMessage] = useState('Halo! Terima kasih telah menghubungi kami. Maaf saat ini petugas/CS kami sedang offline. Kami akan membalas pesan Anda sesegera mungkin.');
  const [isSavingAiConfig, setIsSavingAiConfig] = useState(false);
  const [isMetaAiVerifyModalOpen, setIsMetaAiVerifyModalOpen] = useState(false);
  const [geminiToast, setGeminiToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchMasterStatus = async () => {
    try {
      const res = await apiFetch('/api/auth/master-status');
      const data = await res.json();
      if (data?.success) {
        setMasterUnlocked(Boolean(data.unlocked));
        setMasterPinConfigured(Boolean(data.pinConfigured));
      }
    } catch {}
  };

  // Fetch initial data
  const fetchGatewayConfig = async () => {
    try {
      const res = await apiFetch('/api/config');
      const data = await res.json();
      if (data.success && data.fullConfig) {
        setAppUrl(data.fullConfig.app_url || window.location.origin);
        if (data.fullConfig.ai_config) {
          setAiEnabled(Boolean(data.fullConfig.ai_config.enabled));
          setAiSystemPrompt(data.fullConfig.ai_config.system_prompt || '');
          setAiFallbackNoRule(Boolean(data.fullConfig.ai_config.fallback_when_no_rule));
          setAiOfflineMessage(data.fullConfig.ai_config.offline_fallback_message || 'Halo! Terima kasih telah menghubungi kami. Maaf saat ini petugas/CS kami sedang offline. Kami akan membalas pesan Anda sesegera mungkin.');
        }
      }
    } catch (e) {}
  };

  const fetchSmtpAccounts = async () => {
    try {
      const res = await apiFetch('/api/smtp');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSmtpList(data.data);
      }
    } catch (e) {}
  };

  const fetchMetaAiStatus = async () => {
    try {
      const res = await apiFetch('/api/ai/status');
      const data = await res.json();
      if (data?.success) {
        setMetaAiStatus({
          connected: Boolean(data.meta_ai_connected),
          verified: Boolean(data.meta_ai_verified),
          phone_number: data.phone_number || null,
          session_id: data.session_id || null,
          queue_depth: Number(data.queue_depth) || 0,
          meta_ai_jid: data.meta_ai_jid || '13135550002@s.whatsapp.net',
          last_error: data.last_error || null,
          connected_sessions: Array.isArray(data.connected_sessions) ? data.connected_sessions : []
        });
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchMasterStatus();
    fetchGatewayConfig();
    fetchSmtpAccounts();
    fetchMetaAiStatus();
  }, []);

  const handleUnlockMasterPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterPinInput.trim()) return;
    setIsUnlockingMaster(true);
    setMasterPinError('');
    try {
      const res = await apiFetch('/api/auth/master-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: masterPinInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMasterUnlocked(true);
        setPinModalOpen(false);
        setMasterPinInput('');
        setEmailToast({ type: 'success', text: '✓ PIN Master terverifikasi! Silakan lanjutkan penyimpanan perubahan.' });
        setTimeout(() => setEmailToast(null), 4000);
      } else {
        setMasterPinError(data.error || 'PIN Master Superadmin salah.');
      }
    } catch {
      setMasterPinError('Gagal memverifikasi PIN Master.');
    } finally {
      setIsUnlockingMaster(false);
    }
  };

  const handleMasterLockedResponse = (data: any, fallbackError: string) => {
    if (data?.code === 'MASTER_PIN_REQUIRED') {
      setMasterUnlocked(false);
      setMasterPinError('');
      setPinModalOpen(true);
      setEmailToast({ type: 'error', text: data.error || 'Masukkan PIN Master Superadmin untuk melakukan perubahan ini.' });
      return true;
    }
    setEmailToast({ type: 'error', text: data?.error || fallbackError });
    return false;
  };

  // Save Gateway Base URL
  const handleSaveGateway = async () => {
    setIsSavingGateway(true);
    setGatewayToast('');
    try {
      const res = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_url: appUrl })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGatewayToast('✅ Pengaturan Domain Gateway berhasil disimpan ke database!');
        fetchGatewayConfig();
        setTimeout(() => setGatewayToast(''), 3500);
      } else if (data?.code === 'MASTER_PIN_REQUIRED') {
        setMasterUnlocked(false);
        setPinModalOpen(true);
        setGatewayToast(`🔒 ${data.error || 'Masukkan PIN Master Superadmin terlebih dahulu.'}`);
      } else {
        setGatewayToast(`❌ ${data?.error || 'Gagal menyimpan konfigurasi.'}`);
      }
    } catch (e) {
      setGatewayToast('❌ Gagal menyimpan konfigurasi.');
    } finally {
      setIsSavingGateway(false);
    }
  };

  // Add SMTP Account
  const handleAddSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSmtpUser.trim() || !newSmtpPass.trim()) {
      setEmailToast({ type: 'error', text: 'Email pengirim dan App Password wajib diisi.' });
      return;
    }

    setIsAddingSmtp(true);
    setEmailToast(null);
    try {
      const portNum = Number(newSmtpPort) || 587;
      const res = await apiFetch('/api/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSmtpName.trim() || `SMTP (${newSmtpUser.trim().split('@')[0]})`,
          host: newSmtpHost.trim() || 'smtp.gmail.com',
          port: portNum,
          secure: portNum === 465 ? true : portNum === 587 ? false : newSmtpSecure,
          user: newSmtpUser.trim(),
          pass: newSmtpPass.trim(),
          sender_name: newSmtpSenderName.trim() || config?.app_name || 'Japriin',
          is_active: true
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailToast({ type: 'success', text: '✓ Akun SMTP berhasil ditambahkan ke dalam rotasi!' });
        setNewSmtpUser('');
        setNewSmtpPass('');
        setNewSmtpName('');
        setNewSmtpSenderName('');
        if (data.data) {
          setSmtpList(prev => [...prev, data.data]);
        }
        await fetchSmtpAccounts();
        setTimeout(() => setEmailToast(null), 4000);
      } else {
        handleMasterLockedResponse(data, 'Gagal menambahkan akun SMTP.');
      }
    } catch (err: any) {
      setEmailToast({ type: 'error', text: err?.message || 'Gagal menghubungi server saat menambahkan SMTP.' });
    } finally {
      setIsAddingSmtp(false);
    }
  };

  // Toggle SMTP Active / Inactive
  const handleToggleSmtp = async (id: string) => {
    setEmailToast(null);
    try {
      const res = await apiFetch(`/api/smtp/${id}/toggle`, { method: 'PUT' });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.data) {
          setSmtpList(prev => prev.map(item => (item.id === id ? data.data : item)));
        }
        setEmailToast({ type: 'success', text: `✓ ${data.message || 'Status akun SMTP diperbarui.'}` });
        await fetchSmtpAccounts();
        setTimeout(() => setEmailToast(null), 3000);
      } else {
        handleMasterLockedResponse(data, 'Gagal mengubah status akun SMTP.');
      }
    } catch {
      setEmailToast({ type: 'error', text: 'Gagal menghubungi server.' });
    }
  };

  // Save Full Edited SMTP Account
  const handleSaveEditSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSmtp) return;
    if (!editingSmtp.name.trim() || !editingSmtp.host.trim() || !editingSmtp.user.trim()) {
      setEmailToast({ type: 'error', text: 'Nama akun, Host SMTP, dan Email pengirim wajib diisi.' });
      return;
    }

    setIsSavingEditSmtp(true);
    setEmailToast(null);
    try {
      const portNum = Number(editingSmtp.port) || 587;
      const payload: Record<string, any> = {
        name: editingSmtp.name.trim(),
        host: editingSmtp.host.trim(),
        port: portNum,
        secure: portNum === 465 ? true : portNum === 587 ? false : editingSmtp.secure,
        user: editingSmtp.user.trim(),
        sender_name: editingSmtp.sender_name.trim() || config?.app_name || 'Japriin',
        is_active: editingSmtp.is_active
      };
      if (editingSmtp.pass.trim()) {
        payload.pass = editingSmtp.pass.trim();
      }

      const res = await apiFetch(`/api/smtp/${editingSmtp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailToast({ type: 'success', text: `✓ Akun SMTP "${editingSmtp.name.trim()}" berhasil diperbarui!` });
        setEditingSmtp(null);
        if (data.data) {
          setSmtpList(prev => prev.map(item => (item.id === editingSmtp.id ? data.data : item)));
        }
        await fetchSmtpAccounts();
        setTimeout(() => setEmailToast(null), 4000);
      } else {
        handleMasterLockedResponse(data, 'Gagal memperbarui akun SMTP.');
      }
    } catch (err: any) {
      setEmailToast({ type: 'error', text: err?.message || 'Gagal menghubungi server.' });
    } finally {
      setIsSavingEditSmtp(false);
    }
  };

  // Test Specific SMTP Account Connection
  const handleTestSingleSmtp = async (id: string) => {
    setTestingSmtpId(id);
    setEmailToast(null);
    try {
      const res = await apiFetch('/api/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: id, recipient_email: testEmailRecipient.trim() || undefined })
      });
      const data = await res.json();
      if (data.success) {
        setEmailToast({ type: 'success', text: `✓ ${data.message}` });
        fetchSmtpAccounts();
      } else {
        setEmailToast({ type: 'error', text: `❌ ${data.error || data.message}` });
        fetchSmtpAccounts();
      }
    } catch (err: any) {
      setEmailToast({ type: 'error', text: 'Gagal menguji koneksi akun SMTP.' });
    } finally {
      setTestingSmtpId(null);
    }
  };

  // Delete SMTP Account (Confirmed via ConfirmModal)
  const confirmDeleteSmtp = async () => {
    if (!deleteConfirmSmtp) return;
    const targetId = deleteConfirmSmtp.id;
    setIsDeletingSmtp(true);
    setEmailToast(null);
    try {
      const res = await apiFetch(`/api/smtp/${targetId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setDeleteConfirmSmtp(null);
        if (editingSmtp?.id === targetId) setEditingSmtp(null);
        setSmtpList(prev => prev.filter(s => s.id !== targetId));
        setEmailToast({ type: 'success', text: '✓ Akun SMTP berhasil dihapus dari rotasi.' });
        await fetchSmtpAccounts();
        setTimeout(() => setEmailToast(null), 3500);
      } else {
        setDeleteConfirmSmtp(null);
        handleMasterLockedResponse(data, 'Gagal menghapus akun SMTP.');
      }
    } catch {
      setDeleteConfirmSmtp(null);
      setEmailToast({ type: 'error', text: 'Gagal menghubungi server saat menghapus akun SMTP.' });
    } finally {
      setIsDeletingSmtp(false);
    }
  };

  // Send Test Email via Multi-SMTP Rotation
  const handleTestEmail = async () => {
    if (!testEmailRecipient) return;
    setIsSendingTestEmail(true);
    setEmailToast(null);
    try {
      const res = await apiFetch('/api/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_email: testEmailRecipient })
      });
      const data = await res.json();
      if (data.success) {
        setEmailToast({ type: 'success', text: `✓ ${data.message}` });
        fetchSmtpAccounts();
      } else {
        setEmailToast({ type: 'error', text: `❌ ${data.error}` });
      }
    } catch (err: any) {
      setEmailToast({ type: 'error', text: 'Gagal mengirim email uji coba.' });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  // Test & Verify Meta AI WhatsApp Connection via Guided Modal
  const handleTestMetaAi = () => {
    setGeminiToast(null);
    setIsMetaAiVerifyModalOpen(true);
  };

  // Save AI Prompt & Config
  const handleSaveAiConfig = async () => {
    setIsSavingAiConfig(true);
    setGeminiToast(null);
    try {
      const res = await apiFetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: aiEnabled,
          system_prompt: aiSystemPrompt,
          fallback_when_no_rule: aiFallbackNoRule,
          offline_fallback_message: aiOfflineMessage
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGeminiToast({ type: 'success', text: '✓ Pengaturan Meta AI WhatsApp & Pesan Offline berhasil disimpan!' });
        fetchGatewayConfig();
        setTimeout(() => setGeminiToast(null), 3500);
      } else if (data?.code === 'META_AI_NOT_VERIFIED' || data?.code === 'WA_NOT_CONNECTED') {
        setAiEnabled(false);
        setIsMetaAiVerifyModalOpen(true);
        setGeminiToast({ type: 'error', text: data.error || 'Verifikasi Meta AI diperlukan sebelum mengaktifkan fitur ini.' });
      } else {
        setGeminiToast({ type: 'error', text: data.error || 'Gagal menyimpan konfigurasi AI.' });
      }
    } catch (e) {
      setGeminiToast({ type: 'error', text: 'Gagal menghubungi server.' });
    } finally {
      setIsSavingAiConfig(false);
    }
  };

  return (
    <div className="space-y-6 mb-8 transition-colors duration-200">
      {/* Superadmin Subtab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveSubTab('gateway')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 border ${
            activeSubTab === 'gateway'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span>Domain Gateway &amp; Server</span>
        </button>

        <button
          onClick={() => setActiveSubTab('smtp')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 border ${
            activeSubTab === 'smtp'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Mail className="w-4 h-4 shrink-0" />
          <span>Multi-SMTP Gmail ({smtpList.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('gemini')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 border ${
            activeSubTab === 'gemini'
              ? 'bg-indigo-600 text-white border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Bot className="w-4 h-4 shrink-0" />
          <span>Meta AI WhatsApp ({metaAiStatus.connected_sessions.length} Sesi)</span>
        </button>
      </div>

      {/* ---------------- SUBTAB 1: DOMAIN GATEWAY & SERVER ---------------- */}
      {activeSubTab === 'gateway' && (
        <div className="space-y-6">
          {gatewayToast && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400 rounded-xl text-xs font-bold flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{gatewayToast}</span>
            </div>
          )}

          {/* App Base URL Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Konfigurasi Domain &amp; Engine Baileys
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Aplikasi berjalan 100% menggunakan WhatsApp WebSocket (Baileys Multi-Device) tanpa memerlukan API berbayar atau Webhook Meta Cloud.
                </p>
              </div>
              <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-[10px] font-bold rounded-full">
                Baileys Direct
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  App Base URL
                </label>
                <input
                  type="text"
                  value={appUrl}
                  onChange={e => setAppUrl(e.target.value)}
                  placeholder="http://localhost:3000 atau https://domain-anda.com"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                  Digunakan untuk tautan undangan, reset password email, dan dokumentasi REST API v1.
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSaveGateway}
                disabled={isSavingGateway}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                {isSavingGateway ? 'Menyimpan...' : 'Simpan Domain Gateway'}
              </button>
            </div>
          </div>

          {/* VPS & Node.js Deployment Reference */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Panduan Menjalankan Server Baileys 24/7 (VPS &amp; cPanel Node.js)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">
                  1. Server VPS (Ubuntu + Nginx + PM2)
                </span>
                <ol className="list-decimal list-inside text-[11px] text-slate-600 dark:text-slate-400 space-y-1 leading-relaxed">
                  <li>Arahkan <strong>A Record</strong> domain/subdomain ke IP VPS Anda lalu build: <code className="font-mono">npm run build</code>.</li>
                  <li>Jalankan aplikasi via PM2: <code className="font-mono">pm2 start server.js --name &quot;japriin-gateway&quot;</code>.</li>
                  <li>Pasang Nginx Reverse Proxy ke <code className="font-mono">http://127.0.0.1:3000</code> dan aktifkan SSL dengan <code className="font-mono">certbot --nginx</code>.</li>
                  <li>Hubungkan nomor WhatsApp di menu <strong>Koneksi WA</strong> (Kode Pairing atau QR).</li>
                </ol>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 block">
                  2. Hosting cPanel (Setup Node.js App)
                </span>
                <ol className="list-decimal list-inside text-[11px] text-slate-600 dark:text-slate-400 space-y-1 leading-relaxed">
                  <li>Buka menu <strong>Setup Node.js App</strong> di cPanel (Node 20.x / 22.x) dan pastikan folder <code className="font-mono">dist/</code> hasil <code className="font-mono">npm run build</code> ikut terunggah.</li>
                  <li>Atur Application Startup File ke <code className="font-mono font-bold">server.js</code>.</li>
                  <li>Klik <strong>Run NPM Install</strong> lalu <strong>Start App</strong> (atau Restart App).</li>
                  <li>Pesan masuk &amp; Meta AI langsung berjalan otomatis via koneksi WebSocket Baileys.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SUBTAB 2: MULTI-SMTP GMAIL ROTATION ---------------- */}
      {activeSubTab === 'smtp' && (
        <div className="space-y-6">
          {!masterUnlocked && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start space-x-2.5 text-xs text-amber-900 dark:text-amber-200">
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block">Panel Master Terkunci</span>
                  <span className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                    Masukkan PIN Master Superadmin untuk menambah, mengedit, mengaktifkan/menonaktifkan, atau menghapus akun SMTP.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMasterPinError('');
                  setPinModalOpen(true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 shrink-0 shadow-xs"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Buka Kunci PIN Master</span>
              </button>
            </div>
          )}

          {emailToast && (
            <div className={`p-3 rounded-xl text-xs font-bold border flex items-center justify-between gap-2 ${
              emailToast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-400'
            }`}>
              <div className="flex items-center space-x-2">
                {emailToast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
                <span>{emailToast.text}</span>
              </div>
              <button type="button" onClick={() => setEmailToast(null)} className="text-current opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Add SMTP Account Form */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Tambah Akun SMTP Gmail / Domain untuk Rotasi
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Jika Akun Email A gagal mengirim kode verifikasi, sistem secara otomatis melakukan rotasi failover ke Akun Email B, C, dst.
                </p>
              </div>
              {masterUnlocked && (
                <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0">
                  <Unlock className="w-3 h-3" />
                  <span>Master Terbuka</span>
                </span>
              )}
            </div>

            <form onSubmit={handleAddSmtp} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Label / Nama Akun</label>
                  <input
                    type="text"
                    value={newSmtpName}
                    onChange={e => setNewSmtpName(e.target.value)}
                    placeholder="Contoh: Gmail Utama Bisnis"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">SMTP Host</label>
                  <input
                    type="text"
                    required
                    value={newSmtpHost}
                    onChange={e => setNewSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Port SMTP</label>
                  <select
                    value={newSmtpPort}
                    onChange={e => {
                      const p = Number(e.target.value);
                      setNewSmtpPort(p);
                      setNewSmtpSecure(p === 465);
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value={587}>587 (TLS / STARTTLS - Rekomendasi)</option>
                    <option value={465}>465 (SSL Secure)</option>
                    <option value={25}>25 (Non-SSL)</option>
                    <option value={2525}>2525 (Alt TLS)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Email Pengirim (User)</label>
                  <input
                    type="email"
                    required
                    value={newSmtpUser}
                    onChange={e => setNewSmtpUser(e.target.value)}
                    placeholder="bisnisanda@gmail.com"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Nama Pengirim (Sender Name)</label>
                  <input
                    type="text"
                    value={newSmtpSenderName}
                    onChange={e => setNewSmtpSenderName(e.target.value)}
                    placeholder={config?.app_name || 'Japriin'}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">App Password / Password SMTP</label>
                  <input
                    type="password"
                    required
                    value={newSmtpPass}
                    onChange={e => setNewSmtpPass(e.target.value)}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  💡 Untuk Gmail, gunakan 16 digit <strong>Google App Password</strong> (spasi otomatis dibersihkan oleh sistem).
                </span>
                <button
                  type="submit"
                  disabled={isAddingSmtp}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-sm transition-all flex items-center justify-center space-x-1.5 min-h-[38px] disabled:opacity-50 shrink-0"
                >
                  {isAddingSmtp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{isAddingSmtp ? 'Menambahkan...' : 'Tambahkan ke Rotasi'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* List of Active SMTP Accounts */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Daftar Akun SMTP Dalam Rotasi Failover ({smtpList.length})
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Prioritas: Urutan atas ke bawah secara otomatis
              </span>
            </div>

            {smtpList.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 dark:text-slate-400 space-y-2">
                <Mail className="w-8 h-8 text-slate-400 mx-auto opacity-40" />
                <p>Belum ada akun SMTP yang ditambahkan.</p>
                <p className="text-[11px]">Tambahkan akun di atas agar pendaftaran dapat mengirimkan email kode OTP secara mandiri.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Nama &amp; Email</th>
                      <th className="p-3">Host &amp; Port</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Sukses / Gagal</th>
                      <th className="p-3">Terakhir Dipakai</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {smtpList.map(item => (
                      <React.Fragment key={item.id}>
                        <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-3">
                            <span className="font-bold text-slate-900 dark:text-white block">{item.name}</span>
                            <span className="text-[11px] text-slate-500 font-mono block">{item.user}</span>
                            {item.sender_name && (
                              <span className="text-[10px] text-slate-400 block">Pengirim: {item.sender_name}</span>
                            )}
                            {item.needs_password_reset && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSmtp({
                                    id: item.id,
                                    name: item.name || '',
                                    host: item.host || 'smtp.gmail.com',
                                    port: Number(item.port) || 587,
                                    secure: Boolean(item.secure),
                                    user: item.user || '',
                                    sender_name: item.sender_name || '',
                                    pass: '',
                                    is_active: item.is_active !== false
                                  });
                                  setEmailToast(null);
                                }}
                                className="inline-block mt-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 rounded text-[10px] font-bold"
                              >
                                ⚠️ App Password Perlu Diperbarui (Klik untuk Atur)
                              </button>
                            )}
                            {item.last_error && (
                              <span className="text-[10px] text-rose-500 block mt-0.5 max-w-xs truncate" title={item.last_error}>
                                ⚠️ {item.last_error}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {item.host}:{item.port}
                            <span className="block text-[10px] text-slate-400">{item.secure ? 'SSL' : 'STARTTLS'}</span>
                          </td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => handleToggleSmtp(item.id)}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                                item.is_active !== false
                                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {item.is_active !== false ? 'Aktif' : 'Non-Aktif'}
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold rounded text-[10px]">
                                ✓ {item.success_count || 0} Sukses
                              </span>
                              {item.error_count > 0 && (
                                <span className="px-2 py-0.5 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold rounded text-[10px]">
                                  ✗ {item.error_count} Gagal
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-[11px] text-slate-500">
                            {item.last_used_at ? new Date(item.last_used_at).toLocaleTimeString('id-ID') : 'Belum pernah'}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingSmtp?.id === item.id) {
                                    setEditingSmtp(null);
                                  } else {
                                    setEditingSmtp({
                                      id: item.id,
                                      name: item.name || '',
                                      host: item.host || 'smtp.gmail.com',
                                      port: Number(item.port) || 587,
                                      secure: Boolean(item.secure),
                                      user: item.user || '',
                                      sender_name: item.sender_name || '',
                                      pass: '',
                                      is_active: item.is_active !== false
                                    });
                                    setEmailToast(null);
                                  }
                                }}
                                className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-lg text-[11px] font-bold transition-colors flex items-center space-x-1"
                                title="Edit Akun & Password SMTP"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTestSingleSmtp(item.id)}
                                disabled={testingSmtpId === item.id}
                                className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 rounded-lg text-[11px] font-bold transition-colors flex items-center space-x-1"
                                title="Tes Koneksi Server SMTP Ini"
                              >
                                {testingSmtpId === item.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                <span>Tes</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmSmtp({
                                    id: item.id,
                                    label: `${item.name || item.user} (${item.user})`
                                  })
                                }
                                className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                                title="Hapus Akun SMTP"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {editingSmtp && editingSmtp.id === item.id && (
                          <tr className="bg-slate-50/90 dark:bg-slate-950/70">
                            <td colSpan={6} className="p-4">
                              <form onSubmit={handleSaveEditSmtp} className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                                    <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Edit Konfigurasi Akun SMTP</span>
                                  </span>
                                  <label className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editingSmtp.is_active}
                                      onChange={e => setEditingSmtp(prev => (prev ? { ...prev, is_active: e.target.checked } : null))}
                                      className="rounded text-emerald-600"
                                    />
                                    <span>Aktif di Rotasi</span>
                                  </label>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Label / Nama Akun</label>
                                    <input
                                      type="text"
                                      required
                                      value={editingSmtp.name}
                                      onChange={e => setEditingSmtp(prev => (prev ? { ...prev, name: e.target.value } : null))}
                                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">SMTP Host</label>
                                    <input
                                      type="text"
                                      required
                                      value={editingSmtp.host}
                                      onChange={e => setEditingSmtp(prev => (prev ? { ...prev, host: e.target.value } : null))}
                                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Port SMTP</label>
                                    <select
                                      value={editingSmtp.port}
                                      onChange={e => {
                                        const p = Number(e.target.value);
                                        setEditingSmtp(prev => (prev ? { ...prev, port: p, secure: p === 465 } : null));
                                      }}
                                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                    >
                                      <option value={587}>587 (TLS / STARTTLS)</option>
                                      <option value={465}>465 (SSL Secure)</option>
                                      <option value={25}>25 (Non-SSL)</option>
                                      <option value={2525}>2525 (Alt TLS)</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Email Pengirim (User)</label>
                                    <input
                                      type="email"
                                      required
                                      value={editingSmtp.user}
                                      onChange={e => setEditingSmtp(prev => (prev ? { ...prev, user: e.target.value } : null))}
                                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Nama Pengirim (Sender Name)</label>
                                    <input
                                      type="text"
                                      value={editingSmtp.sender_name}
                                      onChange={e => setEditingSmtp(prev => (prev ? { ...prev, sender_name: e.target.value } : null))}
                                      placeholder={config?.app_name || 'Japriin'}
                                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                                      App Password Baru <span className="font-normal text-slate-400">(opsional)</span>
                                    </label>
                                    <input
                                      type="password"
                                      value={editingSmtp.pass}
                                      onChange={e => setEditingSmtp(prev => (prev ? { ...prev, pass: e.target.value } : null))}
                                      placeholder={item.pass_masked ? `Tersimpan (${item.pass_masked}) - kosongkan jika tetap` : 'Masukkan App Password 16 digit'}
                                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-end space-x-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingSmtp(null)}
                                    className="px-3.5 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                                  >
                                    Batal
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={isSavingEditSmtp}
                                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black disabled:opacity-50"
                                  >
                                    {isSavingEditSmtp ? 'Menyimpan...' : 'Simpan Perubahan'}
                                  </button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Test Send Email Section */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3">
              <input
                type="email"
                value={testEmailRecipient}
                onChange={e => setTestEmailRecipient(e.target.value)}
                placeholder="Masukkan email untuk tes kirim (contoh: tujuan@gmail.com)"
                className="w-full sm:flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
              <button
                onClick={handleTestEmail}
                disabled={isSendingTestEmail || !testEmailRecipient}
                className="w-full sm:w-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingTestEmail ? 'Mengirim Tes...' : 'Kirim Email Uji Coba'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SUBTAB 3: META AI WHATSAPP (BAILEYS) ---------------- */}
      {activeSubTab === 'gemini' && (
        <div className="space-y-6">
          {geminiToast && (
            <div className={`p-3 rounded-xl text-xs font-bold border flex items-center space-x-2 ${
              geminiToast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-400'
            }`}>
              {geminiToast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
              <span>{geminiToast.text}</span>
            </div>
          )}

          {/* Meta AI Connected Sessions Status */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Mesin Meta AI Native via WhatsApp Baileys (Tanpa API Key)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Semua pertanyaan pelanggan yang masuk diteruskan langsung ke chat <strong>Meta AI</strong> di dalam sesi WhatsApp masing-masing tenant yang terhubung.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestMetaAi}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] rounded-xl transition-colors flex items-center space-x-1.5 shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Cek &amp; Verifikasi Meta AI</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 block">Status Sesi Admin</span>
                <strong className={`text-sm font-black ${
                  metaAiStatus.connected && metaAiStatus.verified
                    ? 'text-emerald-600'
                    : 'text-amber-600'
                }`}>
                  {metaAiStatus.connected && metaAiStatus.verified
                    ? `Terverifikasi (${metaAiStatus.phone_number || 'Terhubung'})`
                    : metaAiStatus.connected
                      ? `Perlu Verifikasi Chat Awal (${metaAiStatus.phone_number || 'WA Terhubung'})`
                      : 'Belum Terhubung'}
                </strong>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 block">Total Sesi WhatsApp Aktif</span>
                <strong className="text-sm font-black text-slate-900 dark:text-white">
                  {metaAiStatus.connected_sessions.length} Perangkat
                </strong>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 block">Target JID Meta AI</span>
                <code className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {metaAiStatus.meta_ai_jid}
                </code>
              </div>
            </div>

            {metaAiStatus.connected_sessions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Session ID</th>
                      <th className="p-3">Tenant User ID</th>
                      <th className="p-3">Nomor WhatsApp</th>
                      <th className="p-3">Status Meta AI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {metaAiStatus.connected_sessions.map(s => (
                      <tr key={s.sessionId}>
                        <td className="p-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">{s.sessionId}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-500">{s.userId}</td>
                        <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">{s.phoneNumber || '-'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-[10px] font-bold">
                            Sesi Terhubung
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AI Auto-Reply Behavior Settings */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Konfigurasi Perilaku Meta AI &amp; Pesan Balasan Otomatis
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Atur sakelar utama, instruksi konteks persona CS untuk Meta AI, dan pesan fallback offline.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={e => {
                    const next = e.target.checked;
                    if (next && (!metaAiStatus.connected || !metaAiStatus.verified)) {
                      setIsMetaAiVerifyModalOpen(true);
                      return;
                    }
                    setAiEnabled(next);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ml-2 text-xs font-black text-slate-800 dark:text-slate-200">
                  {aiEnabled ? 'Meta AI Aktif' : 'Meta AI Non-Aktif'}
                </span>
              </label>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
              <label className="flex items-start space-x-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiFallbackNoRule}
                  onChange={e => setAiFallbackNoRule(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 mt-0.5"
                />
                <span>Aktifkan pemrosesan pesan masuk otomatis langsung melalui Meta AI WhatsApp</span>
              </label>
            </div>

            {/* System Prompt Persona */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Instruksi Sistem Meta AI (Persona &amp; Gaya Bahasa CS Bisnis)
              </label>
              <textarea
                rows={3}
                value={aiSystemPrompt}
                onChange={e => setAiSystemPrompt(e.target.value)}
                placeholder="Contoh: Anda adalah CS toko online yang ramah, sopan, ringkas, dan solutif. Sapa nama pelanggan dan jawab dalam Bahasa Indonesia natural..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 leading-relaxed font-sans"
              />
            </div>

            {/* Offline / Unavailable Custom Message Fallback */}
            <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl space-y-2">
              <label className="text-xs font-black text-amber-900 dark:text-amber-200 block">
                Pesan Kustom Jika Meta AI Non-Aktif / WhatsApp Terputus / Kuota Habis
              </label>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400">
                Pesan ini otomatis dikirim jika fitur AI dimatikan, sesi WhatsApp Meta AI sedang offline, atau kuota balasan habis. Gunakan tag <code>{'{nama}'}</code> untuk menyapa pelanggan.
              </p>
              <textarea
                rows={2}
                value={aiOfflineMessage}
                onChange={e => setAiOfflineMessage(e.target.value)}
                placeholder="Contoh: Halo {nama}, terima kasih telah menghubungi kami. Maaf saat ini petugas kami sedang offline. Kami akan membalas pesan Anda sesegera mungkin."
                className="w-full bg-white dark:bg-slate-900 border border-amber-300/70 dark:border-amber-700/60 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSaveAiConfig}
                disabled={isSavingAiConfig}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                {isSavingAiConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Simpan Konfigurasi Meta AI &amp; Pesan Offline</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Master PIN Unlock Modal inside ConfigPanel */}
      {pinModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative space-y-4">
            <button
              type="button"
              onClick={() => setPinModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-3 bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-200 dark:border-amber-800">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Verifikasi PIN Master Superadmin</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {masterPinConfigured
                    ? 'Masukkan PIN Master Superadmin untuk mengaktifkan perubahan konfigurasi sensitif.'
                    : 'PIN Master belum diatur di server (SUPERADMIN_MASTER_PIN) maupun profil Superadmin.'}
                </p>
              </div>
            </div>

            {masterPinError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300">
                {masterPinError}
              </div>
            )}

            <form onSubmit={handleUnlockMasterPin} className="space-y-3">
              <input
                type="password"
                required
                autoFocus
                value={masterPinInput}
                onChange={e => setMasterPinInput(e.target.value)}
                placeholder="Masukkan PIN Master Superadmin..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPinModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUnlockingMaster || !masterPinInput.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black disabled:opacity-50"
                >
                  {isUnlockingMaster ? 'Memverifikasi...' : 'Buka Kunci'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete SMTP Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteConfirmSmtp)}
        title="Hapus Akun SMTP?"
        message={`Anda yakin ingin menghapus akun SMTP ${deleteConfirmSmtp?.label || ''}? Akun ini akan dihapus permanen dari rotasi failover.`}
        confirmText="Ya, Hapus Akun"
        cancelText="Batal"
        type="danger"
        isLoading={isDeletingSmtp}
        onConfirm={confirmDeleteSmtp}
        onCancel={() => !isDeletingSmtp && setDeleteConfirmSmtp(null)}
      />

      {/* Meta AI Verification & Initial Chat Trigger Modal */}
      <MetaAiVerifyModal
        isOpen={isMetaAiVerifyModalOpen}
        onClose={() => setIsMetaAiVerifyModalOpen(false)}
        sessionId={metaAiStatus.session_id}
        phoneNumber={metaAiStatus.phone_number}
        autoEnableOnSuccess={true}
        onVerified={(payload) => {
          setMetaAiStatus(prev => ({
            ...prev,
            connected: true,
            verified: true,
            phone_number: payload.phone_number || prev.phone_number,
            last_error: null
          }));
          setAiEnabled(payload.ai_enabled !== false);
          setGeminiToast({ type: 'success', text: '✓ Meta AI berhasil diverifikasi dan siap membalas otomatis!' });
          void fetchMetaAiStatus();
          void fetchGatewayConfig();
          setTimeout(() => setGeminiToast(null), 4000);
        }}
      />
    </div>
  );
};
