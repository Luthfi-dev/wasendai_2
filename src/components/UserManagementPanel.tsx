import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import {
  Users,
  UserPlus,
  Shield,
  UserCheck,
  Key,
  Mail,
  CheckCircle2,
  Clock,
  Check,
  X,
  CreditCard,
  Sparkles,
  Smartphone,
  Send,
  ShieldAlert,
  QrCode,
  Upload,
  Trash2,
  Eye,
  FileCheck,
  AlertTriangle,
  Building,
  RefreshCw,
  Copy
} from 'lucide-react';
import { UserAccount, QrisConfig } from '../types/whatsapp';
import { ConfirmModal } from './ConfirmModal';
import { PaginationControls } from './PaginationControls';

export const UserManagementPanel: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'qris' | 'receipts'>('users');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [qrisConfig, setQrisConfig] = useState<QrisConfig>({
    image_url: '',
    account_name: '',
    bank_name: 'QRIS ALL PAYMENT',
    account_number: '',
    instructions: 'Scan kode QRIS di atas menggunakan aplikasi m-Banking atau E-Wallet, lalu upload bukti transfer untuk verifikasi.'
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPlan, setNewPlan] = useState<'free' | 'starter' | 'business' | 'pro'>('free');
  const [toastMsg, setToastMsg] = useState('');
  const [isSendingWaOtp, setIsSendingWaOtp] = useState<string | null>(null);
  const [isSavingQris, setIsSavingQris] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [receiptsPage, setReceiptsPage] = useState(1);
  const itemsPerPage = 6;
  const pendingPerPage = 4;
  const receiptsPerPage = 6;

  // Confirm Modal state
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'success';
    confirmText: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'danger',
    confirmText: 'Lanjutkan',
    onConfirm: () => {}
  });

  // Selected receipt preview modal
  const [viewingReceiptUser, setViewingReceiptUser] = useState<UserAccount | null>(null);

  const fetchUsers = () => {
    apiFetch('/api/users')
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data) {
          setUsers(res.data);
        }
      })
      .catch(() => {});
  };

  const fetchQris = () => {
    apiFetch('/api/qris')
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data) {
          setQrisConfig(res.data);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchUsers();
    fetchQris();
  }, []);

  const handleSaveQris = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingQris(true);
    try {
      const res = await apiFetch('/api/qris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(qrisConfig)
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg('✓ Konfigurasi QRIS & Rekening Pembayaran Berhasil Disimpan!');
        setTimeout(() => setToastMsg(''), 4000);
      }
    } catch (e) {
      setToastMsg('Gagal menyimpan konfigurasi QRIS.');
    } finally {
      setIsSavingQris(false);
    }
  };

  const handleApprove = async (userId: string, name: string) => {
    try {
      const res = await apiFetch(`/api/users/${userId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg(`✅ Pendaftaran langganan ${name} BERHASIL DI-ACC & DIAKTIFKAN!`);
        fetchUsers();
        setTimeout(() => setToastMsg(''), 4000);
      } else {
        setToastMsg(`❌ ${data?.error || 'Gagal menyetujui/mengaktifkan pengguna.'}`);
        setTimeout(() => setToastMsg(''), 5000);
      }
    } catch (err) {
      console.error('Failed to approve user:', err);
      setToastMsg('❌ Gagal menghubungi server saat memproses persetujuan.');
      setTimeout(() => setToastMsg(''), 4000);
    }
  };

  const handleRejectPrompt = (userId: string, name: string) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Tolak Permohonan Langganan?',
      message: `Apakah Anda yakin ingin menolak permohonan langganan dari "${name}"? Pengguna akan tetap berada di status ditolak.`,
      type: 'danger',
      confirmText: 'Ya, Tolak Permohonan',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/users/${userId}/reject`, { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            setToastMsg(`❌ Permohonan langganan ${name} telah ditolak.`);
            fetchUsers();
            setTimeout(() => setToastMsg(''), 4000);
          }
        } catch (err) {
          console.error('Failed to reject user:', err);
        } finally {
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleDeleteUserPrompt = (userId: string, username: string) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Hapus Pengguna?',
      message: `Tindakan ini akan menghapus akun "${username}" secara permanen dari sistem beserta seluruh aturan dan aksesnya. Lanjutkan?`,
      type: 'danger',
      confirmText: 'Hapus Permanen',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            setToastMsg(`✓ Akun pengguna ${username} berhasil dihapus.`);
            fetchUsers();
            setTimeout(() => setToastMsg(''), 4000);
          } else {
            setToastMsg(`❌ ${data.error || 'Gagal menghapus pengguna'}`);
          }
        } catch (err) {
          setToastMsg('Gagal menghubungi server.');
        } finally {
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // Manual Verify Email / WA
  const handleManualVerify = async (userId: string, type: 'email' | 'wa', currentVal: boolean) => {
    try {
      const body = type === 'email' ? { email_verified: !currentVal } : { wa_verified: !currentVal };
      const res = await apiFetch(`/api/users/${userId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg(`✓ Status verifikasi ${type.toUpperCase()} pengguna berhasil diubah!`);
        fetchUsers();
        setTimeout(() => setToastMsg(''), 3000);
      }
    } catch (e) {}
  };

  // Send WA OTP directly via active WhatsApp session
  const handleSendWaOtp = async (userId: string) => {
    setIsSendingWaOtp(userId);
    try {
      const res = await apiFetch(`/api/users/${userId}/send-wa-otp`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setToastMsg(`✓ ${data.message}`);
        fetchUsers();
        setTimeout(() => setToastMsg(''), 4000);
      } else {
        setToastMsg(`❌ ${data.error || 'Gagal mengirim WA OTP'}`);
      }
    } catch (e) {
      setToastMsg('Gagal menghubungi server.');
    } finally {
      setIsSendingWaOtp(null);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newName) return;

    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          name: newName,
          password: newPassword,
          role: newRole,
          email: newEmail || `${newUsername}@japriin.com`,
          phone: newPhone,
          plan_id: newPlan
        })
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg('🎉 Pengguna baru berhasil ditambahkan!');
        setShowAddModal(false);
        setNewUsername('');
        setNewName('');
        setNewPassword('');
        setNewEmail('');
        setNewPhone('');
        fetchUsers();
        setTimeout(() => setToastMsg(''), 3000);
      } else {
        setToastMsg(`❌ ${data.error || 'Gagal menambahkan pengguna'}`);
        setTimeout(() => setToastMsg(''), 4000);
      }
    } catch (err) {
      console.error('Failed to add user:', err);
      setToastMsg('Gagal menghubungi server.');
    }
  };

  const pendingUsers = users.filter(u => u.plan_status === 'pending_approval');
  const receiptsUsers = users.filter(u => u.payment_receipt_url || u.receipt_url || u.receipt_base64 || u.ai_verified !== undefined);

  // Pagination calculation (clamped safely)
  const totalPages = Math.ceil(users.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedUsers = users.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage);

  const totalPendingPages = Math.ceil(pendingUsers.length / pendingPerPage) || 1;
  const safePendingPage = Math.min(pendingPage, totalPendingPages);
  const paginatedPendingUsers = pendingUsers.slice((safePendingPage - 1) * pendingPerPage, safePendingPage * pendingPerPage);

  const totalReceiptsPages = Math.ceil(receiptsUsers.length / receiptsPerPage) || 1;
  const safeReceiptsPage = Math.min(receiptsPage, totalReceiptsPages);
  const paginatedReceiptsUsers = receiptsUsers.slice((safeReceiptsPage - 1) * receiptsPerPage, safeReceiptsPage * receiptsPerPage);

  return (
    <div className="space-y-6 transition-colors duration-200">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-3xl shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-200 dark:border-emerald-500/20">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">Superadmin: Kelola Pengguna &amp; Pembayaran QRIS</h3>
              {pendingUsers.length > 0 && (
                <span className="px-2.5 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-black rounded-full border border-amber-200 dark:border-amber-500/30 animate-pulse">
                  {pendingUsers.length} Menunggu ACC
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Atur QRIS pembayaran, audit bukti transfer manual, dan kelola akun pengguna</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center space-x-2 min-h-[40px]"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah Pengguna</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('users')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
            activeSubTab === 'users'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Daftar Pengguna ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('receipts')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 relative ${
            activeSubTab === 'receipts'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Audit Bukti Transfer ({receiptsUsers.length})</span>
          {pendingUsers.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('qris')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
            activeSubTab === 'qris'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>Pengaturan QRIS &amp; Rekening</span>
        </button>
      </div>

      {toastMsg && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-400 rounded-2xl text-xs font-bold flex items-center space-x-2 shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* SUBTAB 1: USERS LIST & PAGINATION */}
      {activeSubTab === 'users' && (
        <div className="space-y-6">
          {/* PENDING APPROVALS CALLOUT */}
          {pendingUsers.length > 0 && (
            <div className="bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 rounded-3xl p-5 shadow-xs space-y-3">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-spin" />
                <h4 className="font-black text-amber-900 dark:text-amber-300 text-sm">
                  Permohonan Langganan Menunggu ACC ({pendingUsers.length})
                </h4>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Pendaftar baru atau pengguna yang mengajukan upgrade paket. Anda dapat melihat bukti transfer yang di-scan AI lalu klik ACC:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {paginatedPendingUsers.map(u => (
                  <div key={u.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col justify-between gap-3 shadow-xs">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="font-black text-slate-900 dark:text-white text-xs">{u.name} (@{u.username})</span>
                        <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-black rounded-full border border-emerald-200 dark:border-emerald-500/20 uppercase">
                          Paket {u.plan_id}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        <span>Email: {u.email}</span>
                        <span>•</span>
                        <span>WA: {u.phone || '-'}</span>
                      </div>

                      {u.ai_verification_notes && (
                        <div className="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start space-x-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="block">Hasil Pemeriksaan Struk:</strong>
                            <span>{u.ai_verification_notes}</span>
                          </div>
                        </div>
                      )}

                      <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1.5 font-mono bg-amber-50 dark:bg-amber-500/10 p-2 rounded-xl border border-amber-200 dark:border-amber-500/20">
                        💳 Catatan: {u.payment_note || 'Tidak ada catatan transfer'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      {(u.payment_receipt_url || u.receipt_url || u.receipt_base64) && (
                        <button
                          onClick={() => setViewingReceiptUser(u)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center space-x-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Struk</span>
                        </button>
                      )}
                      <div className="flex items-center space-x-2 ml-auto">
                        <button
                          onClick={() => handleRejectPrompt(u.id, u.name)}
                          className="px-3 py-1.5 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs font-bold transition-all flex items-center space-x-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Tolak</span>
                        </button>
                        <button
                          onClick={() => handleApprove(u.id, u.name)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xs transition-all flex items-center space-x-1"
                        >
                          <Check className="w-4 h-4" />
                          <span>ACC &amp; Aktifkan</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <PaginationControls
                currentPage={safePendingPage}
                totalItems={pendingUsers.length}
                pageSize={pendingPerPage}
                onPageChange={setPendingPage}
                itemLabel="permohonan ACC"
              />
            </div>
          )}

          {/* User Table with Verification Status */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
            <div className="p-4.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Semua Pengguna Terdaftar ({users.length})
              </h4>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Halaman {safeCurrentPage} dari {totalPages}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Pengguna</th>
                    <th className="px-4 py-3.5">Peran &amp; Paket</th>
                    <th className="px-4 py-3.5">Verifikasi Email</th>
                    <th className="px-4 py-3.5">Verifikasi WA</th>
                    <th className="px-4 py-3.5">Status Paket</th>
                    <th className="px-4 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-800 dark:text-slate-200">
                  {paginatedUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-medium flex items-center space-x-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                        }`}>
                          {u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                          <span className="font-black text-slate-900 dark:text-white block">{u.name}</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">@{u.username}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col space-y-0.5">
                          <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold w-fit ${
                            u.role === 'admin' ? 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                          }`}>
                            {u.role === 'admin' ? 'Administrator' : 'User Operator'}
                          </span>
                          <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase">
                            Paket {u.plan_id || 'free'} ({u.max_sessions} WA)
                          </span>
                          {u.role !== 'admin' && (u.plan_id || 'free') === 'free' && (
                            <span className={`text-[10px] font-bold ${
                              u.auto_reply_enabled
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-400'
                            }`}>
                              {u.auto_reply_enabled ? 'Bot: Aktif (Penuh)' : 'Bot: Nonaktif'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            u.email_verified
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                          }`}>
                            {u.email_verified ? '✓ Terverifikasi' : 'Belum Verif'}
                          </span>
                          <button
                            onClick={() => handleManualVerify(u.id, 'email', u.email_verified)}
                            className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline"
                          >
                            Ubah
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-500 block truncate max-w-[140px]">{u.email}</span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            u.wa_verified
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                          }`}>
                            {u.wa_verified ? '✓ Terverifikasi' : 'Belum Verif'}
                          </span>
                          {u.phone && (
                            <button
                              onClick={() => handleSendWaOtp(u.id)}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-emerald-600"
                              title="Kirim OTP via WA"
                            >
                              <Send className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 block">{u.phone || 'No WA (-) '}</span>
                      </td>

                      <td className="px-4 py-3">
                        {!u.email_verified && !u.is_active ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                            <Clock className="w-3 h-3 text-amber-600 animate-spin" />
                            <span>Pending (Verif Email)</span>
                          </span>
                        ) : u.plan_status === 'pending_approval' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                            <Clock className="w-3 h-3 text-amber-600 animate-spin" />
                            <span>Menunggu ACC</span>
                          </span>
                        ) : u.plan_status === 'rejected' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
                            <X className="w-3 h-3 text-rose-600" />
                            <span>Ditolak</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Aktif</span>
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {u.plan_status === 'pending_approval' ? (
                            <button
                              onClick={() => handleApprove(u.id, u.name)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[11px] font-black shadow-xs"
                            >
                              ACC
                            </button>
                          ) : (
                            <button
                              onClick={() => handleApprove(u.id, u.name)}
                              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-bold border border-slate-200 dark:border-slate-700"
                            >
                              Aktifkan
                            </button>
                          )}

                          {u.username !== 'superadmin' && u.username !== 'admin' && (
                            <button
                              onClick={() => handleDeleteUserPrompt(u.id, u.username)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                              title="Hapus Akun Pengguna"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-4 pb-4 bg-slate-50 dark:bg-slate-950">
                <PaginationControls
                  currentPage={safeCurrentPage}
                  totalItems={users.length}
                  pageSize={itemsPerPage}
                  onPageChange={setCurrentPage}
                  itemLabel="pengguna"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: AUDIT BUKTI TRANSFER AI */}
      {activeSubTab === 'receipts' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
            <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center space-x-2 mb-2">
              <FileCheck className="w-4 h-4 text-emerald-500" />
              <span>Audit Bukti Transfer &amp; ACC Manual Superadmin</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Setiap unggahan struk diperiksa integritas format gambarnya secara otomatis di server (fail-closed) sebelum menunggu tinjauan dan ACC resmi oleh Superadmin.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {receiptsUsers.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400 text-xs">
                  Belum ada unggahan bukti transfer pembayaran.
                </div>
              ) : (
                paginatedReceiptsUsers.map(u => (
                  <div key={u.id} className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col justify-between space-y-3 shadow-xs">
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="font-black text-slate-900 dark:text-white text-xs">{u.name}</span>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {u.plan_id}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 block font-mono mt-0.5">@{u.username}</span>

                      {/* AI Result Card */}
                      <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Hasil AI:</span>
                          <span className={`font-black ${u.ai_verified ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {u.ai_verified ? '✓ Valid (Asli)' : 'Perlu Tinjauan'}
                          </span>
                        </div>
                        {u.ai_verification_notes && (
                          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight pt-1">
                            {u.ai_verification_notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                      <button
                        onClick={() => setViewingReceiptUser(u)}
                        className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Buka Struk</span>
                      </button>

                      {u.plan_status === 'pending_approval' ? (
                        <button
                          onClick={() => handleApprove(u.id, u.name)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xs flex items-center space-x-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>ACC</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          ✓ Sudah Aktif
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <PaginationControls
              currentPage={safeReceiptsPage}
              totalItems={receiptsUsers.length}
              pageSize={receiptsPerPage}
              onPageChange={setReceiptsPage}
              itemLabel="bukti transfer"
              className="mt-4"
            />
          </div>
        </div>
      )}

      {/* SUBTAB 3: QRIS & BANK SETTINGS */}
      {activeSubTab === 'qris' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-6">
          <div>
            <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center space-x-2">
              <QrCode className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Pengaturan QRIS &amp; Rekening Pembayaran Resmi</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Gambar barcode QRIS dan nomor rekening ini akan muncul langsung di layar pop-up saat pengguna melakukan pembayaran atau upgrade paket Pro.
            </p>
          </div>

          <form onSubmit={handleSaveQris} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                    URL Gambar Barcode QRIS / Upload
                  </label>
                  <input
                    type="url"
                    required
                    value={qrisConfig.image_url}
                    onChange={e => setQrisConfig({ ...qrisConfig, image_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Bisa gunakan link gambar QRIS statis atau dynamic QR generator
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                      Nama Bank / E-Wallet
                    </label>
                    <input
                      type="text"
                      required
                      value={qrisConfig.bank_name}
                      onChange={e => setQrisConfig({ ...qrisConfig, bank_name: e.target.value })}
                      placeholder="BCA / QRIS ALL PAYMENT"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                      Nomor Rekening / HP
                    </label>
                    <input
                      type="text"
                      required
                      value={qrisConfig.account_number}
                      onChange={e => setQrisConfig({ ...qrisConfig, account_number: e.target.value })}
                      placeholder="7829104820"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                    Atas Nama Pemilik Rekening (NMID)
                  </label>
                  <input
                    type="text"
                    required
                    value={qrisConfig.account_name}
                    onChange={e => setQrisConfig({ ...qrisConfig, account_name: e.target.value })}
                    placeholder="PT JAPRIIN MEDIA TEKNOLOGI"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                    Petunjuk Pembayaran untuk Pengguna
                  </label>
                  <textarea
                    rows={3}
                    value={qrisConfig.instructions}
                    onChange={e => setQrisConfig({ ...qrisConfig, instructions: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* QRIS Live Preview Box */}
              <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <span className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  Pratinjau QRIS di Layar Pembeli:
                </span>
                <div className="w-48 h-48 mx-auto bg-white p-2 rounded-2xl shadow-md border border-slate-200 flex items-center justify-center">
                  <img
                    src={qrisConfig.image_url}
                    alt="QRIS Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h5 className="font-black text-slate-900 dark:text-white text-xs">{qrisConfig.account_name}</h5>
                  <p className="text-[11px] font-mono text-slate-500">{qrisConfig.bank_name} · {qrisConfig.account_number}</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={isSavingQris}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center space-x-2 min-h-[42px]"
              >
                {isSavingQris && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Simpan Pengaturan QRIS</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RECEIPT PREVIEW MODAL */}
      {viewingReceiptUser && (
        <div
          onClick={() => setViewingReceiptUser(null)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl relative"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-900">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center space-x-2 min-w-0">
                <FileCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="truncate">Bukti Transfer: {viewingReceiptUser.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setViewingReceiptUser(null)}
                aria-label="Tutup"
                className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
              <div className="w-full max-h-72 bg-slate-100 dark:bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200 dark:border-slate-800 p-2">
                {(viewingReceiptUser.payment_receipt_url || viewingReceiptUser.receipt_url || viewingReceiptUser.receipt_base64) ? (
                  <img
                    src={viewingReceiptUser.payment_receipt_url || viewingReceiptUser.receipt_url || viewingReceiptUser.receipt_base64}
                    alt="Bukti Transfer"
                    className="max-h-64 object-contain rounded-xl"
                  />
                ) : (
                  <div className="py-10 text-xs text-slate-500 dark:text-slate-400">
                    Gambar bukti transfer tidak tersedia.
                  </div>
                )}
              </div>

              {viewingReceiptUser.ai_verification_notes && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                  <strong className="flex items-center space-x-1.5 font-black">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Hasil Verifikasi AI:</span>
                  </strong>
                  <p>{viewingReceiptUser.ai_verification_notes}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setViewingReceiptUser(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
              >
                Tutup
              </button>
              {viewingReceiptUser.plan_status === 'pending_approval' && (
                <button
                  type="button"
                  onClick={() => {
                    handleApprove(viewingReceiptUser.id, viewingReceiptUser.name);
                    setViewingReceiptUser(null);
                  }}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md"
                >
                  ACC &amp; Buka Fitur Pro
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div
          onClick={() => setShowAddModal(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl text-slate-900 dark:text-slate-100 relative"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-900">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Tambah Pengguna Baru</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Tutup"
                className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Contoh: Ahmad Subagyo"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Username Login</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  placeholder="Contoh: ahmad"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Peran Akses</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as 'admin' | 'user')}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="user">User Operator</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Pilihan Paket</label>
                  <select
                    value={newPlan}
                    onChange={e => setNewPlan(e.target.value as any)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="free">Gratis (100 Pesan/Hari - Rp 0)</option>
                    <option value="starter">Starter (1 WA - 500/Hari)</option>
                    <option value="business">Business (3 WA - 2.500/Hari)</option>
                    <option value="pro">Pro (10 WA - 10.000/Hari)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="ahmad@gmail.com"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">No. WhatsApp</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="08123456789"
                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Password Awal (min. 8 karakter)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-xs"
                >
                  Simpan Pengguna
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        type={confirmModalState.type}
        confirmText={confirmModalState.confirmText}
        onConfirm={confirmModalState.onConfirm}
        onCancel={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
