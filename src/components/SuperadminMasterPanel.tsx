import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import {
  ShieldAlert,
  Lock,
  Unlock,
  Key,
  Sliders,
  Settings,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  QrCode,
  Upload,
  RefreshCw,
  Eye,
  EyeOff,
  Building,
  Smartphone,
  Check,
  X,
  Layers,
  Flame,
  Globe,
  Mail,
  Send,
  Server,
  Activity,
  Info,
  Bell,
  ArrowRightLeft,
  Power,
  Wifi,
  WifiOff,
  Radio,
  KeyRound,
  ShieldCheck
} from 'lucide-react';
import {
  SubscriptionPlan,
  AppWhitelabelConfig,
  QrisConfig,
  SmtpAccount,
  GlobalSlotStatus,
  AppNodeConfig,
  AppNodeRuntimeStatus,
  WhatsAppSession,
  WhatsAppSessionConflictDetail,
  ActiveSocketRecord,
  KillTargetIpRule,
  TelegramConfigItem
} from '../types/whatsapp';
import { ConfirmModal } from './ConfirmModal';
import { PaginationControls } from './PaginationControls';
import { DEFAULT_PUBLIC_LOGO_URL, resolveLogoUrl, handleLogoImgError } from '../lib/branding';

interface ClusterSessionItem extends WhatsAppSession {
  runtime_status: 'connected' | 'connecting' | 'disconnected';
  has_registered_creds: boolean;
  conflict_paused: boolean;
  conflict_detail?: WhatsAppSessionConflictDetail;
  disconnect_code?: number;
  disconnect_reason?: string;
  owner_username?: string;
  owner_name?: string;
  owner_email?: string;
  monitor_health: 'connected' | 'conflict' | 'error' | 'delegating' | 'disconnected';
}

interface ClusterUserItem {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  assigned_app_id?: string;
}

interface ClusterMonitorPayload {
  current_app_id: string;
  multi_node_enabled: boolean;
  admin_notify_phone: string;
  telegram_configs?: TelegramConfigItem[];
  telegram_configured?: boolean;
  inter_app_ping?: {
    enabled: boolean;
    ws_enabled?: boolean;
    ws_outbound_open?: number;
    ws_inbound_open?: number;
    interval_ms: number;
    last_round_at?: string;
    last_inbound_ping_at?: string;
    last_inbound_ping_from?: string;
    local_active_connections: number;
    peers: Array<{
      appId: string;
      origin: string;
      peerConnections: number;
      lastOk: boolean;
      lastPingAt: string;
      lastSuccessAt?: string;
      consecutiveFailures: number;
      lastLatencyMs?: number;
      lastError?: string;
      transport?: 'ws' | 'http';
      wsState?: 'open' | 'connecting' | 'closed';
    }>;
  };
  self_socket?: ActiveSocketRecord;
  active_sockets?: ActiveSocketRecord[];
  kill_target_ips?: KillTargetIpRule[];
  nodes: AppNodeRuntimeStatus[];
  sessions: ClusterSessionItem[];
  users?: ClusterUserItem[];
  summary: {
    total_nodes: number;
    online_nodes: number;
    total_sockets?: number;
    online_sockets?: number;
    total_capacity: number;
    used_capacity: number;
    connected_count: number;
    conflict_count: number;
    error_count: number;
    delegating_count: number;
  };
}

interface SuperadminMasterPanelProps {
  onWhitelabelUpdated?: (whitelabel: AppWhitelabelConfig) => void;
  onPlansUpdated?: (plans: SubscriptionPlan[]) => void;
  onQrisUpdated?: (qris: QrisConfig) => void;
}

export const SuperadminMasterPanel: React.FC<SuperadminMasterPanelProps> = ({
  onWhitelabelUpdated,
  onPlansUpdated,
  onQrisUpdated
}) => {
  // Master PIN Unlock State
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Active Sub-Tab
  const [activeTab, setActiveTab] = useState<'plans' | 'whitelabel' | 'smtp' | 'gemini' | 'qris' | 'cluster'>('plans');
  const [toastMsg, setToastMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    showToast('Berhasil disalin ke clipboard!');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Plans State
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [maxGlobalSessions, setMaxGlobalSessions] = useState<string>('10');
  const [slotStatus, setSlotStatus] = useState<GlobalSlotStatus | null>(null);
  const [isSavingMaxGlobal, setIsSavingMaxGlobal] = useState(false);

  // Whitelabel State
  const [whitelabel, setWhitelabel] = useState<AppWhitelabelConfig>({
    app_name: 'Japriin Pro',
    tagline: 'Whitelabel WhatsApp Gateway, REST API & Remote AI Bot',
    logo_url: DEFAULT_PUBLIC_LOGO_URL,
    company_name: 'PT Japriin Teknologi Indonesia',
    support_phone: '081234567890',
    primary_bot_phone: '081234567890',
    primary_bot_name: 'Japriin Assistant Pusat',
    footer_text: 'Dikelola secara profesional oleh Japriin.com',
    api_enabled: true
  });
  const [isSavingWhitelabel, setIsSavingWhitelabel] = useState(false);

  // Meta AI WhatsApp (Baileys) Status State
  const [metaAiSessions, setMetaAiSessions] = useState<Array<{ sessionId: string; userId: string; phoneNumber: string }>>([]);
  const [metaAiJid, setMetaAiJid] = useState('13135550002@s.whatsapp.net');
  const [isTestingMetaAi, setIsTestingMetaAi] = useState(false);
  const [metaAiTestResult, setMetaAiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [aiAuditLogs, setAiAuditLogs] = useState<Array<{
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    stage: string;
    session_id?: string;
    user_id?: string;
    customer_code?: string;
    sender_masked?: string;
    error_code?: string;
    reason: string;
    latency_ms?: number;
  }>>([]);
  const [aiAuditLogFile, setAiAuditLogFile] = useState('logs/meta-ai-audit.log');
  const [aiAuditLevelFilter, setAiAuditLevelFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO'>('ALL');
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);

  // Multi-SMTP State
  const [smtpList, setSmtpList] = useState<SmtpAccount[]>([]);
  const [newSmtpName, setNewSmtpName] = useState('');
  const [newSmtpHost, setNewSmtpHost] = useState('smtp.gmail.com');
  const [newSmtpPort, setNewSmtpPort] = useState(587);
  const [newSmtpSecure, setNewSmtpSecure] = useState(false);
  const [newSmtpUser, setNewSmtpUser] = useState('');
  const [newSmtpSenderName, setNewSmtpSenderName] = useState('');
  const [newSmtpPass, setNewSmtpPass] = useState('');
  const [isAddingSmtp, setIsAddingSmtp] = useState(false);
  const [testingSmtpId, setTestingSmtpId] = useState<string | null>(null);
  const [editingSmtp, setEditingSmtp] = useState<{
    id: string;
    name: string;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    sender_name: string;
    pass: string;
    is_active: boolean;
  } | null>(null);
  const [isSavingEditSmtp, setIsSavingEditSmtp] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [smtpErrorMsg, setSmtpErrorMsg] = useState('');

  // QRIS State
  const [qrisConfig, setQrisConfig] = useState<QrisConfig>({
    image_url: '',
    account_name: 'PT JAPRIIN MEDIA TEKNOLOGI',
    bank_name: 'QRIS ALL PAYMENT & BCA',
    account_number: '123-456-7890',
    instructions: 'Scan QRIS atau transfer BCA lalu upload bukti transfer.'
  });
  const [isSavingQris, setIsSavingQris] = useState(false);

  // Multi-Hosting APP_ID Cluster & Monitor State
  const [clusterData, setClusterData] = useState<ClusterMonitorPayload | null>(null);
  const [isLoadingCluster, setIsLoadingCluster] = useState(false);
  const [adminNotifyPhoneInput, setAdminNotifyPhoneInput] = useState('');
  const [isSavingClusterConfig, setIsSavingClusterConfig] = useState(false);
  const [nodeAppIdInput, setNodeAppIdInput] = useState('');
  const [nodeNameInput, setNodeNameInput] = useState('');
  const [nodeMaxConnInput, setNodeMaxConnInput] = useState('10');
  const [nodeIsActiveInput, setNodeIsActiveInput] = useState(true);
  const [editingNodeAppId, setEditingNodeAppId] = useState<string | null>(null);
  const [clusterFilter, setClusterFilter] = useState<'all' | 'connected' | 'conflict' | 'error' | 'delegating'>('all');
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<ClusterSessionItem | null>(null);
  const [selectedAppDetail, setSelectedAppDetail] = useState<{
    appId: string;
    title?: string;
    instanceId?: string;
  } | null>(null);
  const [appModalMoveTargets, setAppModalMoveTargets] = useState<Record<string, string>>({});
  const [isDisconnectingSocketId, setIsDisconnectingSocketId] = useState<string | null>(null);
  const [reassignTargetAppId, setReassignTargetAppId] = useState('');
  const [applyReassignToUser, setApplyReassignToUser] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [isRunningClusterTick, setIsRunningClusterTick] = useState(false);
  const [killTargetIpInput, setKillTargetIpInput] = useState('');
  const [killTargetReasonInput, setKillTargetReasonInput] = useState('');
  const [isSavingKillIp, setIsSavingKillIp] = useState(false);
  const [pairAssignPhone, setPairAssignPhone] = useState('');
  const [pairAssignAppId, setPairAssignAppId] = useState('');
  const [pairAssignMethod, setPairAssignMethod] = useState<'pairing_code' | 'qr_code'>('pairing_code');
  const [isAssigningPairing, setIsAssigningPairing] = useState(false);
  const [pairAssignResult, setPairAssignResult] = useState<{ message: string; pairing_code?: string } | null>(null);
  const [userAppTargets, setUserAppTargets] = useState<Record<string, string>>({});
  const [savingUserAppId, setSavingUserAppId] = useState<string | null>(null);
  const [userSearchFilter, setUserSearchFilter] = useState('');
  const [testingDetailHealth, setTestingDetailHealth] = useState(false);
  const [reconnectingDetailSession, setReconnectingDetailSession] = useState(false);
  const [detailHealthMessage, setDetailHealthMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Telegram Bot Key & Chat ID Management (DB)
  const [tgNameInput, setTgNameInput] = useState('');
  const [tgBotTokenInput, setTgBotTokenInput] = useState('');
  const [tgChatIdInput, setTgChatIdInput] = useState('');
  const [tgIsActiveInput, setTgIsActiveInput] = useState(true);
  const [editingTgId, setEditingTgId] = useState<string | null>(null);
  const [isSavingTg, setIsSavingTg] = useState(false);
  const [testingTgId, setTestingTgId] = useState<string | null>(null);

  // Sub-menus & Pagination States
  const [clusterSubTab, setClusterSubTab] = useState<
    'ringkasan' | 'nodes' | 'sessions' | 'users' | 'security' | 'alerts'
  >('ringkasan');
  const [geminiSubTab, setGeminiSubTab] = useState<'sessions' | 'audit'>('sessions');
  const [plansPage, setPlansPage] = useState(1);
  const [smtpPage, setSmtpPage] = useState(1);
  const [metaAiSessionsPage, setMetaAiSessionsPage] = useState(1);
  const [aiAuditLogsPage, setAiAuditLogsPage] = useState(1);
  const [clusterPeersPage, setClusterPeersPage] = useState(1);
  const [clusterNodesPage, setClusterNodesPage] = useState(1);
  const [clusterSessionsPage, setClusterSessionsPage] = useState(1);
  const [clusterUsersPage, setClusterUsersPage] = useState(1);
  const [clusterSocketsPage, setClusterSocketsPage] = useState(1);
  const [clusterKillIpsPage, setClusterKillIpsPage] = useState(1);
  const [clusterTelegramPage, setClusterTelegramPage] = useState(1);

  useEffect(() => {
    setClusterSessionsPage(1);
  }, [clusterFilter]);

  useEffect(() => {
    setClusterUsersPage(1);
  }, [userSearchFilter]);

  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const fetchData = async (unlockedOverride?: boolean) => {
    try {
      const [pRes, wRes, qRes] = await Promise.all([
        apiFetch('/api/plans').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/whitelabel').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/qris').then(r => r.json()).catch(() => ({ success: false }))
      ]);

      if (pRes.success) {
        setPlans(pRes.data);
        if (typeof pRes.max_global_sessions === 'number' && Number.isFinite(pRes.max_global_sessions)) {
          setMaxGlobalSessions(String(pRes.max_global_sessions));
        }
        if (pRes.slot_status) {
          setSlotStatus(pRes.slot_status);
        }
      }
      if (wRes.success) setWhitelabel(wRes.data);
      if (qRes.success) setQrisConfig(qRes.data);

      const shouldFetchProtected = unlockedOverride !== undefined ? unlockedOverride : isUnlocked;
      if (shouldFetchProtected) {
        const [aiRes, sRes, auditRes, clusterRes] = await Promise.all([
          apiFetch('/api/ai/status').then(r => r.json()).catch(() => ({ success: false })),
          apiFetch('/api/smtp').then(r => r.json()).catch(() => ({ success: false })),
          apiFetch(`/api/admin/ai-audit-logs?limit=50&level=${aiAuditLevelFilter}`).then(r => r.json()).catch(() => ({ success: false })),
          apiFetch('/api/superadmin/cluster-monitor').then(r => r.json()).catch(() => ({ success: false }))
        ]);
        if (aiRes.success) {
          setMetaAiSessions(Array.isArray(aiRes.connected_sessions) ? aiRes.connected_sessions : []);
          if (aiRes.meta_ai_jid) setMetaAiJid(aiRes.meta_ai_jid);
        }
        if (sRes.success && sRes.data) setSmtpList(sRes.data);
        if (auditRes.success) {
          setAiAuditLogs(Array.isArray(auditRes.data) ? auditRes.data : []);
          if (auditRes.log_file) setAiAuditLogFile(auditRes.log_file);
        }
        if (clusterRes.success && clusterRes.data) {
          setClusterData(clusterRes.data);
          setAdminNotifyPhoneInput(clusterRes.data.admin_notify_phone || '');
        }
      }
    } catch {}
  };

  const fetchClusterMonitor = async () => {
    setIsLoadingCluster(true);
    try {
      const res = await apiFetch('/api/superadmin/cluster-monitor');
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setClusterData(data.data);
        setAdminNotifyPhoneInput(data.data.admin_notify_phone || '');
        if (selectedSessionDetail) {
          const refreshed = (data.data.sessions as ClusterSessionItem[]).find(s => s.id === selectedSessionDetail.id);
          if (refreshed) setSelectedSessionDetail(refreshed);
        }
      }
    } catch {} finally {
      setIsLoadingCluster(false);
    }
  };

  const handleSaveClusterNotifyPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingClusterConfig(true);
    try {
      const res = await apiFetch('/api/superadmin/cluster-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notify_phone: adminNotifyPhoneInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.data) {
          setClusterData(data.data);
          setAdminNotifyPhoneInput(data.data.admin_notify_phone || '');
        }
        showToast('✓ Nomor WhatsApp Admin Aplikasi untuk notifikasi cluster berhasil disimpan!');
      } else {
        showToast(`⚠️ ${data.error || 'Gagal menyimpan nomor admin aplikasi.'}`);
      }
    } catch {
      showToast('⚠️ Terjadi kesalahan saat menyimpan nomor admin aplikasi.');
    } finally {
      setIsSavingClusterConfig(false);
    }
  };

  const handleSaveClusterNode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = nodeAppIdInput.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const maxConn = Math.floor(Number(nodeMaxConnInput));
    if (!cleanId) {
      showToast('⚠️ APP_ID tidak boleh kosong (contoh: app01, app02).');
      return;
    }
    if (!Number.isFinite(maxConn) || maxConn < 1 || maxConn > 10000) {
      showToast('⚠️ Batas koneksi harus antara 1 sampai 10.000.');
      return;
    }

    const existingNodes: AppNodeConfig[] = (clusterData?.nodes || []).map(n => ({
      app_id: n.app_id,
      name: n.name || n.app_id,
      max_connections: n.max_connections,
      is_active: n.is_active !== false
    }));

    const nextNode: AppNodeConfig = {
      app_id: cleanId,
      name: nodeNameInput.trim() || `Node ${cleanId}`,
      max_connections: maxConn,
      is_active: nodeIsActiveInput
    };

    const updatedNodes = existingNodes.some(n => n.app_id === cleanId)
      ? existingNodes.map(n => (n.app_id === cleanId ? nextNode : n))
      : [...existingNodes, nextNode];

    setIsSavingClusterConfig(true);
    try {
      const res = await apiFetch('/api/superadmin/cluster-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_nodes: updatedNodes })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.data) setClusterData(data.data);
        setNodeAppIdInput('');
        setNodeNameInput('');
        setNodeMaxConnInput('10');
        setNodeIsActiveInput(true);
        setEditingNodeAppId(null);
        showToast(`✓ Konfigurasi node ${cleanId} berhasil disimpan!`);
      } else {
        showToast(`⚠️ ${data.error || 'Gagal menyimpan node.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setIsSavingClusterConfig(false);
    }
  };

  const handleToggleClusterNodeActive = async (node: AppNodeRuntimeStatus) => {
    const existingNodes: AppNodeConfig[] = (clusterData?.nodes || []).map(n => ({
      app_id: n.app_id,
      name: n.name || n.app_id,
      max_connections: n.max_connections,
      is_active: n.app_id === node.app_id ? !node.is_active : n.is_active !== false
    }));
    setIsSavingClusterConfig(true);
    try {
      const res = await apiFetch('/api/superadmin/cluster-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_nodes: existingNodes })
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setClusterData(data.data);
        showToast(`✓ Status node ${node.app_id} diubah menjadi ${!node.is_active ? 'Aktif' : 'Nonaktif'}.`);
      }
    } catch {} finally {
      setIsSavingClusterConfig(false);
    }
  };

  const handleDeleteClusterNode = (appId: string) => {
    setConfirmModal({
      isOpen: true,
      title: `Hapus Node ${appId}?`,
      message: `Node ${appId} akan dihapus dari daftar kapasitas cluster. Koneksi yang masih terpasang pada node ini dapat dialihkan ke node aktif lain.`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await apiFetch(`/api/superadmin/nodes/${encodeURIComponent(appId)}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok && data.success) {
            if (data.data) setClusterData(data.data);
            showToast(`✓ Node ${appId} berhasil dihapus.`);
          } else {
            showToast(`⚠️ ${data.error || 'Gagal menghapus node.'}`);
          }
        } catch {
          showToast('⚠️ Gagal menghubungi server.');
        }
      }
    });
  };

  const handleRunClusterTick = async () => {
    setIsRunningClusterTick(true);
    try {
      const res = await apiFetch('/api/superadmin/cluster-tick', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.data) setClusterData(data.data);
        const t = data.tick || {};
        showToast(
          data.message ||
            `✓ Siklus node dijalankan (${t.appId || clusterData?.current_app_id || 'node'}): dicek ${t.checked || 0}, dibangun ${t.built || 0}, delegasi ${t.delegated || 0}, error ${t.errors || 0}.`
        );
      } else {
        showToast(`⚠️ ${data.error || 'Gagal menjalankan tugas node.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menjalankan tugas node.');
    } finally {
      setIsRunningClusterTick(false);
    }
  };

  const availableAppIds = Array.from(
    new Set(
      [
        clusterData?.current_app_id || '',
        ...(clusterData?.nodes || []).map(n => n.app_id),
        ...(clusterData?.active_sockets || []).map(s => s.app_id || '')
      ]
        .map(v => String(v || '').trim().toLowerCase())
        .filter(v => v && v !== 'undefined')
    )
  );

  const handleMoveSessionToApp = async (
    sessionId: string,
    targetAppId: string,
    applyToUser = false
  ) => {
    const cleanApp = targetAppId.trim().toLowerCase();
    if (!cleanApp || cleanApp === 'undefined') {
      showToast('⚠️ Pilih atau ketik APP_ID tujuan yang valid (contoh: 01, 02, app02).');
      return;
    }
    setIsReassigning(true);
    try {
      const res = await apiFetch(`/api/superadmin/sessions/${encodeURIComponent(sessionId)}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_app_id: cleanApp,
          apply_to_user: applyToUser
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✓ ${data.message || `Sesi dialihkan ke APP_ID ${cleanApp}.`}`);
        if (data.data) setClusterData(data.data);
        await fetchClusterMonitor();
      } else {
        showToast(`⚠️ ${data.error || 'Gagal mengalihkan sesi ke APP_ID tujuan.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setIsReassigning(false);
    }
  };

  const handleReassignSession = async () => {
    if (!selectedSessionDetail) return;
    await handleMoveSessionToApp(selectedSessionDetail.id, reassignTargetAppId, applyReassignToUser);
  };

  const handleDisconnectSessionSocket = async (sessionId: string) => {
    setIsDisconnectingSocketId(sessionId);
    try {
      const res = await apiFetch(`/api/superadmin/sessions/${encodeURIComponent(sessionId)}/disconnect-socket`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✓ ${data.message || 'WhatsApp diputuskan dari socket.'}`);
        if (data.data) setClusterData(data.data);
        await fetchClusterMonitor();
      } else {
        showToast(`⚠️ ${data.error || 'Gagal memutuskan WhatsApp dari socket.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setIsDisconnectingSocketId(null);
    }
  };

  const handleAssignUserToApp = async (userId: string, targetAppId: string) => {
    const cleanApp = targetAppId.trim().toLowerCase();
    if (cleanApp === 'undefined') {
      showToast('⚠️ APP_ID tidak boleh bernilai "undefined".');
      return;
    }
    setSavingUserAppId(userId);
    try {
      const res = await apiFetch(`/api/superadmin/users/${encodeURIComponent(userId)}/assign-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_app_id: cleanApp })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✓ ${data.message || 'APP_ID akun berhasil diperbarui.'}`);
        if (data.data) setClusterData(data.data);
      } else {
        showToast(`⚠️ ${data.error || 'Gagal menetapkan APP_ID akun.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setSavingUserAppId(null);
    }
  };

  const handleAddKillTargetIp = async (ipOverride?: string, reasonOverride?: string) => {
    const cleanIp = (ipOverride ?? killTargetIpInput).trim();
    const cleanReason = (reasonOverride ?? killTargetReasonInput).trim();
    if (!cleanIp) {
      showToast('⚠️ Masukkan alamat IP target yang akan dimatikan.');
      return;
    }
    setIsSavingKillIp(true);
    try {
      const res = await apiFetch('/api/superadmin/socket-kill-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: cleanIp, reason: cleanReason || undefined })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.data) setClusterData(data.data);
        if (!ipOverride) {
          setKillTargetIpInput('');
          setKillTargetReasonInput('');
        }
        showToast(`✓ ${data.message || `IP ${cleanIp} masuk daftar shutdown.`}`);
      } else {
        showToast(`⚠️ ${data.error || 'Gagal menambahkan IP target shutdown.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setIsSavingKillIp(false);
    }
  };

  const handleUnkillTargetIp = async (ip: string) => {
    setIsSavingKillIp(true);
    try {
      const res = await apiFetch('/api/superadmin/socket-unkill-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.data) setClusterData(data.data);
        showToast(`✓ ${data.message || `IP ${ip} berhasil di-unkill.`}`);
      } else {
        showToast(`⚠️ ${data.error || 'Gagal melakukan Unkill IP.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setIsSavingKillIp(false);
    }
  };

  const handleSaveTelegramConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tgChatIdInput.trim()) {
      showToast('⚠️ ID Chat Telegram wajib diisi.');
      return;
    }
    if (!editingTgId && !tgBotTokenInput.trim()) {
      showToast('⚠️ Key / Bot Token Telegram wajib diisi.');
      return;
    }
    setIsSavingTg(true);
    try {
      const res = await apiFetch('/api/superadmin/telegram-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTgId || undefined,
          name: tgNameInput.trim() || 'Telegram Alert',
          bot_token: tgBotTokenInput.trim(),
          chat_id: tgChatIdInput.trim(),
          is_active: tgIsActiveInput
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setClusterData(prev =>
          prev
            ? {
                ...prev,
                telegram_configs: data.telegram_configs,
                telegram_configured: Boolean(data.telegram_configured)
              }
            : prev
        );
        setEditingTgId(null);
        setTgNameInput('');
        setTgBotTokenInput('');
        setTgChatIdInput('');
        setTgIsActiveInput(true);
        showToast(`✓ ${data.message || 'Konfigurasi Telegram berhasil disimpan ke database!'}`);
      } else {
        showToast(`⚠️ ${data.error || 'Gagal menyimpan konfigurasi Telegram.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setIsSavingTg(false);
    }
  };

  const handleToggleTelegramActive = async (item: TelegramConfigItem) => {
    setIsSavingTg(true);
    try {
      const res = await apiFetch('/api/superadmin/telegram-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          name: item.name,
          bot_token: '****',
          chat_id: item.chat_id,
          is_active: !item.is_active
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setClusterData(prev =>
          prev
            ? {
                ...prev,
                telegram_configs: data.telegram_configs,
                telegram_configured: Boolean(data.telegram_configured)
              }
            : prev
        );
        showToast(`✓ Notifikasi Telegram "${item.name}" ${!item.is_active ? 'diaktifkan' : 'dijeda'}.`);
      } else {
        showToast(`⚠️ ${data.error || 'Gagal mengubah status Telegram.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setIsSavingTg(false);
    }
  };

  const handleDeleteTelegramConfig = async (id: string) => {
    setIsSavingTg(true);
    try {
      const res = await apiFetch(`/api/superadmin/telegram-configs/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setClusterData(prev =>
          prev
            ? {
                ...prev,
                telegram_configs: data.telegram_configs,
                telegram_configured: Boolean(data.telegram_configured)
              }
            : prev
        );
        if (editingTgId === id) {
          setEditingTgId(null);
          setTgNameInput('');
          setTgBotTokenInput('');
          setTgChatIdInput('');
        }
        showToast(`✓ ${data.message || 'Konfigurasi Telegram dihapus.'}`);
      } else {
        showToast(`⚠️ ${data.error || 'Gagal menghapus konfigurasi Telegram.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setIsSavingTg(false);
    }
  };

  const handleTestTelegramConfig = async (opts: { id?: string; bot_token?: string; chat_id?: string; name?: string }) => {
    const testKey = opts.id || 'draft';
    setTestingTgId(testKey);
    try {
      const res = await apiFetch('/api/superadmin/telegram-configs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✓ ${data.message || 'Tes pesan Telegram berhasil dikirim!'}`);
      } else {
        showToast(`⚠️ ${data.error || 'Gagal mengirim tes pesan Telegram.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setTestingTgId(null);
    }
  };

  const handleAssignPairingTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanApp = pairAssignAppId.trim().toLowerCase();
    if (!cleanApp || cleanApp === 'undefined') {
      showToast('⚠️ Target APP_ID wajib diisi (contoh: 01, 02, app02).');
      return;
    }
    if (pairAssignMethod === 'pairing_code' && !pairAssignPhone.trim()) {
      showToast('⚠️ Nomor WhatsApp wajib diisi untuk Pairing Code.');
      return;
    }
    setIsAssigningPairing(true);
    setPairAssignResult(null);
    try {
      const res = await apiFetch('/api/superadmin/pairing/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: pairAssignPhone.trim() || undefined,
          target_app_id: cleanApp,
          auth_method: pairAssignMethod
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.data) setClusterData(data.data);
        setPairAssignResult({
          message: data.message || `Pairing ditugaskan ke APP_ID ${data.assigned_app_id}.`,
          pairing_code: data.pairing_code
        });
        showToast(`✓ ${data.message || 'Penugasan pairing ke APP_ID berhasil!'}`);
      } else {
        showToast(`⚠️ ${data.error || 'Gagal menugaskan pairing ke APP_ID.'}`);
      }
    } catch {
      showToast('⚠️ Gagal menghubungi server.');
    } finally {
      setIsAssigningPairing(false);
    }
  };

  const handleTestDetailSessionHealth = async (sess: ClusterSessionItem) => {
    setTestingDetailHealth(true);
    setDetailHealthMessage(null);
    try {
      const res = await apiFetch(`/api/sessions/${encodeURIComponent(sess.id)}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_chat_probe: true })
      });
      const data = await res.json();
      setDetailHealthMessage({
        ok: Boolean(data.ok),
        text: data.message || data.error || 'Pengecekan selesai.'
      });
      if (data.ok) {
        await fetchClusterMonitor();
      }
    } catch {
      setDetailHealthMessage({
        ok: false,
        text: 'Gagal menghubungi server untuk uji kirim WhatsApp.'
      });
    } finally {
      setTestingDetailHealth(false);
    }
  };

  const handleReconnectDetailSession = async (sess: ClusterSessionItem) => {
    setReconnectingDetailSession(true);
    setDetailHealthMessage(null);
    try {
      const res = await apiFetch(`/api/sessions/${encodeURIComponent(sess.id)}/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      const connected = Boolean(data?.connected);
      setDetailHealthMessage({
        ok: connected,
        text: data?.message || data?.error || (connected ? 'Socket WhatsApp tersambung kembali.' : 'Sedang menyambungkan ulang...')
      });
      await fetchClusterMonitor();
    } catch {
      setDetailHealthMessage({
        ok: false,
        text: 'Gagal menghubungi server untuk menyambungkan ulang socket WhatsApp.'
      });
    } finally {
      setReconnectingDetailSession(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedSessionDetail(null);
        setSelectedAppDetail(null);
        setShowPlanModal(false);
        setEditingPlan(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleRefreshAiAuditLogs = async (nextLevel: 'ALL' | 'ERROR' | 'WARN' | 'INFO' = aiAuditLevelFilter) => {
    setAiAuditLevelFilter(nextLevel);
    setAiAuditLogsPage(1);
    setIsLoadingAuditLogs(true);
    try {
      const res = await apiFetch(`/api/admin/ai-audit-logs?limit=50&level=${nextLevel}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setAiAuditLogs(Array.isArray(data.data) ? data.data : []);
        if (data.log_file) setAiAuditLogFile(data.log_file);
      }
    } catch {} finally {
      setIsLoadingAuditLogs(false);
    }
  };

  useEffect(() => {
    apiFetch('/api/auth/master-status')
      .then(r => r.json())
      .then(st => {
        const unlocked = Boolean(st?.success && st?.unlocked);
        setIsUnlocked(unlocked);
        fetchData(unlocked);
      })
      .catch(() => {
        fetchData(false);
      });
  }, []);

  const handleUnlockMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingPin(true);
    setPinError('');

    try {
      const res = await apiFetch('/api/auth/master-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput })
      });
      const data = await res.json();
      if (data.success) {
        setIsUnlocked(true);
        setPinInput('');
        fetchData(true);
      } else {
        setPinError(data.error || 'PIN Master Superadmin Salah!');
      }
    } catch (err) {
      setPinError('Gagal memverifikasi PIN.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const handleSaveMaxGlobalSessions = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericMax = Math.floor(Number(maxGlobalSessions));
    if (!Number.isFinite(numericMax) || numericMax < 1 || numericMax > 10000) {
      showToast('❌ Batas kapasitas harus bilangan bulat antara 1 hingga 10.000 sesi WA.');
      return;
    }
    setIsSavingMaxGlobal(true);
    try {
      const res = await apiFetch('/api/superadmin/max-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_global_sessions: numericMax })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMaxGlobalSessions(String(data.max_global_sessions));
        if (data.slot_status) setSlotStatus(data.slot_status);
        showToast(data.message || `✓ Batas maksimal nomor WhatsApp global diubah menjadi ${data.max_global_sessions} sesi!`);
      } else {
        showToast(`❌ ${data.error || 'Gagal menyimpan kapasitas maksimal sesi WhatsApp.'}`);
      }
    } catch {
      showToast('❌ Gagal menghubungi server.');
    } finally {
      setIsSavingMaxGlobal(false);
    }
  };

  // Plan Save Handler
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setIsSavingPlan(true);

    try {
      const isNew = !plans.some(p => p.id === editingPlan.id);
      const url = isNew ? '/api/plans' : `/api/plans/${editingPlan.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPlan)
      });
      const data = await res.json();
      if (data.success) {
        showToast('✓ Paket langganan berhasil disimpan & langsung aktif!');
        setShowPlanModal(false);
        setEditingPlan(null);
        await fetchData();
        const freshPlans = await apiFetch('/api/plans').then(r => r.json()).catch(() => null);
        if (freshPlans?.success && freshPlans.data) {
          onPlansUpdated?.(freshPlans.data);
          window.dispatchEvent(new CustomEvent('plans-updated', { detail: freshPlans.data }));
        }
      }
    } catch (err) {
      showToast('Gagal menyimpan paket.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  // Logo Upload Handler (auto-resize & compress so custom logos always fit safely under backend 500KB limit)
  const handleLogoImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Pilih file gambar yang valid (PNG, JPG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 512;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setWhitelabel(prev => ({ ...prev, logo_url: rawDataUrl }));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const preferPng = file.type === 'image/png' || file.type === 'image/webp';
        let compressed = canvas.toDataURL(preferPng ? 'image/png' : 'image/jpeg', 0.86);
        if (compressed.length > 420000) {
          compressed = canvas.toDataURL('image/jpeg', 0.8);
        }
        if (compressed.length > 480000) {
          showToast('Ukuran logo terlalu besar setelah dikompresi. Gunakan gambar lebih kecil.');
          return;
        }
        setWhitelabel(prev => ({ ...prev, logo_url: compressed }));
      };
      img.onerror = () => {
        showToast('File gambar tidak dapat diproses.');
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Whitelabel Save Handler
  const handleSaveWhitelabel = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingWhitelabel(true);
    try {
      const res = await apiFetch('/api/whitelabel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(whitelabel)
      });
      const data = await res.json();
      if (data.success) {
        const updatedWl = data.data || whitelabel;
        setWhitelabel(updatedWl);
        onWhitelabelUpdated?.(updatedWl);
        window.dispatchEvent(new CustomEvent('whitelabel-updated', { detail: updatedWl }));
        showToast('✓ Data Aplikasi, Nama, Footer & Nomor Gateway Utama Berhasil Disimpan & Diterapkan!');
        fetchData();
      }
    } catch (e) {
      showToast('Gagal menyimpan brand.');
    } finally {
      setIsSavingWhitelabel(false);
    }
  };

  // Meta AI Connection Test
  const handleTestMetaAiConnection = async () => {
    setIsTestingMetaAi(true);
    setMetaAiTestResult(null);
    try {
      const res = await apiFetch('/api/gemini/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      setMetaAiTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'Sesi Meta AI WhatsApp siap!' : 'WhatsApp belum terhubung.')
      });
      fetchData(true);
    } catch (e: any) {
      setMetaAiTestResult({ success: false, message: e?.message || 'Gagal menguji koneksi Meta AI.' });
    } finally {
      setIsTestingMetaAi(false);
    }
  };

  // QRIS Image Upload Handler
  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setQrisConfig(prev => ({ ...prev, image_url: base64 }));
    };
    reader.readAsDataURL(file);
  };

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
        const updatedQris = data.data || qrisConfig;
        setQrisConfig(updatedQris);
        onQrisUpdated?.(updatedQris);
        window.dispatchEvent(new CustomEvent('qris-updated', { detail: updatedQris }));
        showToast('✓ Konfigurasi QRIS & Rekening Pembayaran Berhasil Disimpan!');
      }
    } catch (e) {
      showToast('Gagal menyimpan QRIS.');
    } finally {
      setIsSavingQris(false);
    }
  };

  // If Master PIN is not yet unlocked
  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 border border-indigo-200 dark:border-indigo-800 mx-auto flex items-center justify-center">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-black text-slate-900 dark:text-white">
            Superadmin Master Lock 🔒
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Akses pengaturan paket langganan, rotasi API key, dan whitelabel brand dilindungi dengan enkripsi PIN Master tingkat tinggi.
          </p>
        </div>

        {pinError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{pinError}</span>
          </div>
        )}

        <form onSubmit={handleUnlockMaster} className="space-y-4">
          <div>
            <input
              type="password"
              required
              autoFocus
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              placeholder="Masukkan PIN Master Superadmin"
              className="w-full text-center tracking-widest text-base font-black bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isVerifyingPin}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black shadow-md transition-all flex items-center justify-center space-x-2 min-h-[44px]"
          >
            {isVerifyingPin ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
            <span>Buka Akses Master</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-2xl border border-indigo-500/30 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-black text-indigo-200">
                Pusat Kontrol Superadmin Master
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                TERVERIFIKASI
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Atur seluruh ketentuan paket, status Meta AI WhatsApp, QRIS, dan identitas Whitelabel aplikasi.
            </p>
          </div>
        </div>

        <button
          onClick={async () => {
            await apiFetch('/api/auth/master-lock', { method: 'POST' }).catch(() => {});
            setIsUnlocked(false);
          }}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all self-start sm:self-auto flex items-center space-x-1.5"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Kunci Kembali</span>
        </button>
      </div>

      {toastMsg && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs font-bold flex items-center space-x-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
            activeTab === 'plans'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Kelola Paket Langganan ({plans.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('whitelabel')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
            activeTab === 'whitelabel'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Whitelabel &amp; No. Gateway Utama</span>
        </button>

        <button
          onClick={() => setActiveTab('smtp')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
            activeTab === 'smtp'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Multi-SMTP Email ({smtpList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('gemini')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
            activeTab === 'gemini'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Meta AI WhatsApp ({metaAiSessions.length} Sesi)</span>
        </button>

        <button
          onClick={() => setActiveTab('qris')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 ${
            activeTab === 'qris'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>Upload QRIS &amp; Rekening</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('cluster');
            fetchClusterMonitor();
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center space-x-2 shrink-0 ${
            activeTab === 'cluster'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>Server &amp; Monitor Koneksi</span>
          {clusterData && (clusterData.summary.conflict_count + clusterData.summary.error_count) > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-rose-500 text-white">
              {clusterData.summary.conflict_count + clusterData.summary.error_count}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: PLANS MANAGEMENT */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800">
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                Daftar &amp; Ketentuan Paket Harga
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ubah harga, limit harian, atau fitur paket. Halaman depan dan form upgrade akan otomatis sinkron!
              </p>
            </div>

            <button
              onClick={() => {
                setEditingPlan({
                  id: `plan_${Date.now()}`,
                  name: 'Paket Kustom',
                  price: 150000,
                  period: '/ bulan',
                  max_sessions: 1,
                  daily_msg_limit: 5000,
                  monthly_msg_limit: 150000,
                  features: ['1 Nomor WhatsApp Terhubung', '5.000 Pesan / Hari', 'Tanpa Watermark'],
                  popular: false
                });
                setShowPlanModal(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xs flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Paket</span>
            </button>
          </div>

          {/* Superadmin Global WhatsApp Capacity Limit Setting */}
          <form
            onSubmit={handleSaveMaxGlobalSessions}
            className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h5 className="text-sm font-black text-slate-900 dark:text-white">
                  Kapasitas Maksimal Nomor WhatsApp Global
                </h5>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                  Semua paket dibatasi <strong>1 nomor WA per akun</strong>. Saat slot penuh, pendaftar Gratis baru ditahan, pendaftar Berbayar menggeser sesi Gratis dengan aktivitas pesan paling sedikit (prioritas 0 pesan), dan jika seluruh slot terisi Berbayar maka pendaftaran/upgrade baru ditahan sementara.
                </p>
                {slotStatus && (
                  <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] font-bold">
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      Terisi: {slotStatus.total_occupied} / {slotStatus.max_global_sessions}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                      Berbayar (Kebal Geser): {slotStatus.paid_occupied}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      Gratis: {slotStatus.free_occupied}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full ${
                        slotStatus.available_slots === 0
                          ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                          : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      Sisa Slot: {slotStatus.available_slots}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5">
                <input
                  type="number"
                  step="1"
                  min={1}
                  max={10000}
                  value={maxGlobalSessions}
                  onChange={e => setMaxGlobalSessions(e.target.value)}
                  className="w-20 bg-transparent text-sm font-black font-mono text-slate-900 dark:text-white focus:outline-none text-right pr-1.5"
                  aria-label="Kapasitas maksimal nomor WhatsApp global"
                />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Nomor</span>
              </div>
              <button
                type="submit"
                disabled={isSavingMaxGlobal || !isUnlocked}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xs disabled:opacity-50"
              >
                {isSavingMaxGlobal ? 'Menyimpan...' : isUnlocked ? 'Simpan Kapasitas' : 'Buka PIN Dulu'}
              </button>
            </div>
          </form>

          {(() => {
            const plansPageSize = 8;
            const totalPlanPages = Math.max(1, Math.ceil(plans.length / plansPageSize));
            const safePlansPage = Math.min(plansPage, totalPlanPages);
            const paginatedPlans = plans.slice(
              (safePlansPage - 1) * plansPageSize,
              safePlansPage * plansPageSize
            );
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {paginatedPlans.map(plan => (
                    <div
                      key={plan.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col justify-between relative shadow-xs"
                    >
                      {plan.popular && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-emerald-600 text-white text-[10px] font-black rounded-full uppercase">
                          Paling Laris 🔥
                        </span>
                      )}

                      <div>
                        <div className="flex items-center justify-between">
                          <h5 className="font-black text-slate-900 dark:text-white text-sm">{plan.name}</h5>
                          <span className="text-[10px] font-mono text-slate-400 uppercase">ID: {plan.id}</span>
                        </div>

                        <div className="mt-3 flex items-baseline">
                          <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                            Rp {plan.price.toLocaleString('id-ID')}
                          </span>
                          <span className="text-xs text-slate-500 ml-1">{plan.period}</span>
                        </div>

                        <div className="mt-3 p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl text-xs space-y-1">
                          <div className="font-bold text-emerald-600 flex items-center justify-between">
                            <span>⚡ Limit WA:</span>
                            <span className="tabular-nums">{plan.daily_msg_limit.toLocaleString('id-ID')} / hari</span>
                          </div>
                          <div className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center justify-between">
                            <span>🤖 Respon AI:</span>
                            <span className="tabular-nums">
                              {plan.id === 'free'
                                ? `${plan.daily_msg_limit.toLocaleString('id-ID')} / hari (Ikuti Limit WA)`
                                : `${(plan.daily_ai_limit ?? 50).toLocaleString('id-ID')} / hari`}
                            </span>
                          </div>
                          <div className="text-slate-500 text-[11px] flex items-center justify-between">
                            <span>📅 Limit AI / Bln:</span>
                            <span className="tabular-nums">
                              {plan.id === 'free'
                                ? `${(plan.monthly_msg_limit ?? 500).toLocaleString('id-ID')} / bln`
                                : `${(plan.monthly_ai_limit ?? 1500).toLocaleString('id-ID')} / bln`}
                            </span>
                          </div>
                          <div className="text-slate-500 text-[11px] flex items-center justify-between border-t border-slate-200/50 dark:border-slate-800 pt-1">
                            <span>📱 WhatsApp:</span>
                            <span className="tabular-nums">{plan.max_sessions} nomor</span>
                          </div>
                        </div>

                        <ul className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                          {plan.features.slice(0, 4).map((f, i) => (
                            <li key={i} className="flex items-center space-x-1.5">
                              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span className="truncate">{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <button
                          onClick={() => {
                            setEditingPlan({ ...plan });
                            setShowPlanModal(true);
                          }}
                          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center space-x-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit Paket</span>
                        </button>

                        {plan.id !== 'free' && (
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Hapus Paket?',
                                message: `Apakah Anda yakin ingin menghapus paket "${plan.name}"?`,
                                onConfirm: async () => {
                                  await apiFetch(`/api/plans/${plan.id}`, { method: 'DELETE' });
                                  fetchData();
                                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                }
                              });
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <PaginationControls
                  currentPage={safePlansPage}
                  totalItems={plans.length}
                  pageSize={plansPageSize}
                  onPageChange={setPlansPage}
                  itemLabel="paket"
                />
              </>
            );
          })()}
        </div>
      )}

      {/* TAB 2: WHITELABEL & APP PRIMARY NUMBER */}
      {activeTab === 'whitelabel' && (
        <form onSubmit={handleSaveWhitelabel} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-5">
          <div>
            <h4 className="text-base font-black text-slate-900 dark:text-white">
              Informasi Brand Whitelabel, Footer &amp; Nomor WhatsApp Gateway Utama
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Semua perubahan data aplikasi (Nama Aplikasi, Tagline, Perusahaan, Teks Footer, Logo, dan Nomor Gateway/CS) akan langsung diterapkan secara otomatis di halaman depan maupun di seluruh dalam aplikasi.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                Nama Aplikasi (Header, Judul &amp; Footer)
              </label>
              <input
                type="text"
                required
                value={whitelabel.app_name}
                onChange={e => setWhitelabel({ ...whitelabel, app_name: e.target.value })}
                placeholder="Contoh: Japriin"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                Nomor WhatsApp Gateway Utama Aplikasi (Kirim OTP &amp; Remote Bot)
              </label>
              <input
                type="text"
                required
                value={whitelabel.primary_bot_phone}
                onChange={e => setWhitelabel({ ...whitelabel, primary_bot_phone: e.target.value })}
                placeholder="081234567890"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono font-bold text-emerald-600"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                Nama Asisten Bot Pusat
              </label>
              <input
                type="text"
                required
                value={whitelabel.primary_bot_name}
                onChange={e => setWhitelabel({ ...whitelabel, primary_bot_name: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                Nama Perusahaan / Organisasi Resmi
              </label>
              <input
                type="text"
                value={whitelabel.company_name}
                onChange={e => setWhitelabel({ ...whitelabel, company_name: e.target.value })}
                placeholder="Contoh: PT Teknologi Indonesia"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                Nomor WhatsApp Customer Service / Bantuan (Footer &amp; Konfirmasi)
              </label>
              <input
                type="text"
                value={whitelabel.support_phone || ''}
                onChange={e => setWhitelabel({ ...whitelabel, support_phone: e.target.value })}
                placeholder="081234567890"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                Logo Aplikasi (URL Gambar atau Upload File)
              </label>
              <div className="flex items-center gap-2">
                <img
                  src={resolveLogoUrl(whitelabel.logo_url)}
                  alt="Logo Preview"
                  onError={handleLogoImgError}
                  className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <input
                  type="text"
                  value={whitelabel.logo_url}
                  onChange={e => setWhitelabel({ ...whitelabel, logo_url: e.target.value })}
                  placeholder={DEFAULT_PUBLIC_LOGO_URL}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                />
                <label className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer shrink-0 flex items-center space-x-1 border border-slate-200 dark:border-slate-700">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload</span>
                  <input type="file" accept="image/*" onChange={handleLogoImageUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                Tagline Aplikasi (Sub-judul Header &amp; Deskripsi Brand)
              </label>
              <input
                type="text"
                value={whitelabel.tagline}
                onChange={e => setWhitelabel({ ...whitelabel, tagline: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                Teks Footer Copyright (Ditampilkan di Bagian Bawah Dashboard &amp; Halaman Depan)
              </label>
              <input
                type="text"
                value={whitelabel.footer_text}
                onChange={e => setWhitelabel({ ...whitelabel, footer_text: e.target.value })}
                placeholder="Dikelola secara profesional oleh perusahaan Anda"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Live Preview of Header & Footer */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
              Pratinjau Langsung (Live Preview Header &amp; Footer Aplikasi):
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center space-x-2.5">
                <img
                  src={resolveLogoUrl(whitelabel.logo_url)}
                  alt={whitelabel.app_name}
                  onError={handleLogoImgError}
                  className="w-8 h-8 rounded-lg object-cover"
                />
                <div>
                  <div className="text-xs font-black text-slate-900 dark:text-white">{whitelabel.app_name || 'Nama Aplikasi'}</div>
                  <div className="text-[10px] text-slate-400">{whitelabel.tagline || 'Tagline Aplikasi'}</div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
                <strong className="text-slate-800 dark:text-slate-200">{whitelabel.app_name}</strong>
                {whitelabel.company_name ? ` (${whitelabel.company_name})` : ''} • {whitelabel.footer_text}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={isSavingWhitelabel}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-2"
            >
              {isSavingWhitelabel && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>Simpan &amp; Terapkan Konfigurasi Brand</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB: MULTI-SMTP EMAIL ROTATION */}
      {activeTab === 'smtp' && (
        <div className="space-y-6">
          {smtpErrorMsg && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-bold flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{smtpErrorMsg}</span>
              </div>
              <button type="button" onClick={() => setSmtpErrorMsg('')} className="opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <Mail className="w-4 h-4 text-emerald-500" />
                <span>Tambah Akun SMTP Email untuk Rotasi &amp; OTP</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Mendukung SMTP Gmail (16 digit App Password) maupun SMTP domain cPanel/VPS. Jika akun pertama gagal, sistem otomatis melakukan failover ke akun berikutnya.
              </p>
            </div>

            <form
              onSubmit={async e => {
                e.preventDefault();
                if (!newSmtpUser.trim() || !newSmtpPass.trim()) {
                  setSmtpErrorMsg('Email pengirim dan App Password wajib diisi.');
                  return;
                }
                setIsAddingSmtp(true);
                setSmtpErrorMsg('');
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
                      sender_name: newSmtpSenderName.trim() || whitelabel.app_name || 'Japriin',
                      is_active: true
                    })
                  });
                  const data = await res.json();
                  if (res.ok && data.success) {
                    showToast('✓ Akun SMTP berhasil ditambahkan ke rotasi!');
                    setNewSmtpName('');
                    setNewSmtpUser('');
                    setNewSmtpPass('');
                    setNewSmtpSenderName('');
                    if (data.data) {
                      setSmtpList(prev => [...prev, data.data]);
                    }
                    fetchData(true);
                  } else if (data?.code === 'MASTER_PIN_REQUIRED') {
                    setIsUnlocked(false);
                    setPinError(data.error || 'Sesi PIN Master berakhir. Masukkan PIN Master kembali.');
                  } else {
                    setSmtpErrorMsg(data.error || 'Gagal menambahkan akun SMTP.');
                  }
                } catch (err: any) {
                  setSmtpErrorMsg(err?.message || 'Gagal menghubungi server saat menambahkan SMTP.');
                } finally {
                  setIsAddingSmtp(false);
                }
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Label / Nama Akun</label>
                  <input
                    type="text"
                    value={newSmtpName}
                    onChange={e => setNewSmtpName(e.target.value)}
                    placeholder="Contoh: Gmail Utama"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Host SMTP</label>
                  <input
                    type="text"
                    required
                    value={newSmtpHost}
                    onChange={e => setNewSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Port SMTP</label>
                  <select
                    value={newSmtpPort}
                    onChange={e => {
                      const p = Number(e.target.value);
                      setNewSmtpPort(p);
                      setNewSmtpSecure(p === 465);
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold"
                  >
                    <option value={587}>587 (TLS / STARTTLS)</option>
                    <option value={465}>465 (SSL Secure)</option>
                    <option value={25}>25 (Non-SSL)</option>
                    <option value={2525}>2525 (Alt TLS)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Email Pengirim (User)</label>
                  <input
                    type="email"
                    required
                    value={newSmtpUser}
                    onChange={e => setNewSmtpUser(e.target.value)}
                    placeholder="emailanda@gmail.com"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Nama Pengirim (Sender Name)</label>
                  <input
                    type="text"
                    value={newSmtpSenderName}
                    onChange={e => setNewSmtpSenderName(e.target.value)}
                    placeholder={whitelabel.app_name || 'Japriin'}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">App Password / Password</label>
                  <input
                    type="password"
                    required
                    value={newSmtpPass}
                    onChange={e => setNewSmtpPass(e.target.value)}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isAddingSmtp}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xs flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isAddingSmtp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{isAddingSmtp ? 'Menambahkan...' : 'Tambahkan ke Rotasi'}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Daftar Akun SMTP Terdaftar ({smtpList.length})
            </h5>

            {smtpList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Belum ada akun SMTP. Tambahkan di atas untuk mengaktifkan pengiriman OTP Email.
              </div>
            ) : (
              (() => {
                const smtpPageSize = 5;
                const safeSmtpPage = Math.min(
                  smtpPage,
                  Math.max(1, Math.ceil(smtpList.length / smtpPageSize))
                );
                const paginatedSmtp = smtpList.slice(
                  (safeSmtpPage - 1) * smtpPageSize,
                  safeSmtpPage * smtpPageSize
                );
                return (
                  <div className="space-y-3">
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedSmtp.map(acc => (
                        <div key={acc.id} className="py-3 space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-xs text-slate-900 dark:text-white">{acc.name}</span>
                                <span className="text-[11px] font-mono text-slate-500">({acc.user})</span>
                                <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300">
                                  {acc.host}:{acc.port}
                                </span>
                                {acc.needs_password_reset && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingSmtp({
                                        id: acc.id,
                                        name: acc.name || '',
                                        host: acc.host || 'smtp.gmail.com',
                                        port: Number(acc.port) || 587,
                                        secure: Boolean(acc.secure),
                                        user: acc.user || '',
                                        sender_name: acc.sender_name || '',
                                        pass: '',
                                        is_active: acc.is_active !== false
                                      });
                                      setSmtpErrorMsg('');
                                    }}
                                    className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 rounded"
                                  >
                                    ⚠️ App Password Perlu Diperbarui (Klik untuk Edit)
                                  </button>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5 space-x-2">
                                <span className="text-emerald-600 font-bold">✓ {acc.success_count || 0} Sukses</span>
                                <span>•</span>
                                <span className={acc.error_count ? 'text-rose-500 font-bold' : ''}>✗ {acc.error_count || 0} Gagal</span>
                                {acc.sender_name && <span>• Pengirim: {acc.sender_name}</span>}
                                {acc.last_error && <span className="text-rose-500">• {acc.last_error}</span>}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingSmtp?.id === acc.id) {
                                    setEditingSmtp(null);
                                  } else {
                                    setEditingSmtp({
                                      id: acc.id,
                                      name: acc.name || '',
                                      host: acc.host || 'smtp.gmail.com',
                                      port: Number(acc.port) || 587,
                                      secure: Boolean(acc.secure),
                                      user: acc.user || '',
                                      sender_name: acc.sender_name || '',
                                      pass: '',
                                      is_active: acc.is_active !== false
                                    });
                                    setSmtpErrorMsg('');
                                  }
                                }}
                                className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold flex items-center space-x-1"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                onClick={async () => {
                                  setTestingSmtpId(acc.id);
                                  setSmtpErrorMsg('');
                                  try {
                                    const r = await apiFetch('/api/smtp/test', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ account_id: acc.id, recipient_email: testEmailRecipient.trim() || undefined })
                                    }).then(res => res.json());
                                    if (r.success) showToast(`✓ ${r.message}`);
                                    else setSmtpErrorMsg(r.error || r.message || 'Tes koneksi SMTP gagal.');
                                    fetchData(true);
                                  } catch (e: any) {
                                    setSmtpErrorMsg(e?.message || 'Gagal menguji koneksi SMTP.');
                                  } finally {
                                    setTestingSmtpId(null);
                                  }
                                }}
                                disabled={testingSmtpId === acc.id}
                                className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 rounded-xl text-xs font-bold flex items-center space-x-1"
                              >
                                {testingSmtpId === acc.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                <span>Tes Koneksi</span>
                              </button>

                              <button
                                type="button"
                                onClick={async () => {
                                  setSmtpErrorMsg('');
                                  try {
                                    const res = await apiFetch(`/api/smtp/${acc.id}/toggle`, { method: 'PUT' });
                                    const data = await res.json();
                                    if (res.ok && data.success) {
                                      if (data.data) {
                                        setSmtpList(prev => prev.map(s => (s.id === acc.id ? data.data : s)));
                                      }
                                      showToast(`✓ ${data.message || 'Status akun SMTP diperbarui.'}`);
                                      fetchData(true);
                                    } else if (data?.code === 'MASTER_PIN_REQUIRED') {
                                      setIsUnlocked(false);
                                      setPinError(data.error || 'Sesi PIN Master berakhir. Masukkan PIN Master kembali.');
                                    } else {
                                      setSmtpErrorMsg(data.error || 'Gagal mengubah status akun SMTP.');
                                    }
                                  } catch (e: any) {
                                    setSmtpErrorMsg(e?.message || 'Gagal menghubungi server.');
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                                  acc.is_active !== false
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}
                              >
                                {acc.is_active !== false ? 'Aktif' : 'Non-Aktif'}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmModal({
                                    isOpen: true,
                                    title: 'Hapus Akun SMTP?',
                                    message: `Anda yakin ingin menghapus akun SMTP "${acc.name}" (${acc.user}) dari sistem rotasi email?`,
                                    onConfirm: async () => {
                                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                                      setSmtpErrorMsg('');
                                      try {
                                        const res = await apiFetch(`/api/smtp/${acc.id}`, { method: 'DELETE' });
                                        const data = await res.json();
                                        if (res.ok && data.success) {
                                          if (editingSmtp?.id === acc.id) setEditingSmtp(null);
                                          setSmtpList(prev => prev.filter(s => s.id !== acc.id));
                                          showToast('✓ Akun SMTP berhasil dihapus.');
                                          fetchData(true);
                                        } else if (data?.code === 'MASTER_PIN_REQUIRED') {
                                          setIsUnlocked(false);
                                          setPinError(data.error || 'Sesi PIN Master berakhir. Masukkan PIN Master kembali.');
                                        } else {
                                          setSmtpErrorMsg(data.error || 'Gagal menghapus akun SMTP.');
                                        }
                                      } catch (e: any) {
                                        setSmtpErrorMsg(e?.message || 'Gagal menghubungi server saat menghapus akun SMTP.');
                                      }
                                    }
                                  });
                                }}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl"
                                title="Hapus Akun SMTP"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {editingSmtp && editingSmtp.id === acc.id && (
                            <form
                              onSubmit={async e => {
                                e.preventDefault();
                                if (!editingSmtp.name.trim() || !editingSmtp.host.trim() || !editingSmtp.user.trim()) {
                                  setSmtpErrorMsg('Nama akun, Host SMTP, dan Email pengirim wajib diisi.');
                                  return;
                                }
                                setIsSavingEditSmtp(true);
                                setSmtpErrorMsg('');
                                try {
                                  const portNum = Number(editingSmtp.port) || 587;
                                  const payload: Record<string, any> = {
                                    name: editingSmtp.name.trim(),
                                    host: editingSmtp.host.trim(),
                                    port: portNum,
                                    secure: portNum === 465 ? true : portNum === 587 ? false : editingSmtp.secure,
                                    user: editingSmtp.user.trim(),
                                    sender_name: editingSmtp.sender_name.trim() || whitelabel.app_name || 'Japriin',
                                    is_active: editingSmtp.is_active
                                  };
                                  if (editingSmtp.pass.trim()) {
                                    payload.pass = editingSmtp.pass.trim();
                                  }

                                  const res = await apiFetch(`/api/smtp/${acc.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload)
                                  });
                                  const r = await res.json();
                                  if (res.ok && r.success) {
                                    showToast(`✓ Konfigurasi SMTP ${editingSmtp.user} berhasil diperbarui!`);
                                    setEditingSmtp(null);
                                    if (r.data) {
                                      setSmtpList(prev => prev.map(s => (s.id === acc.id ? r.data : s)));
                                    }
                                    fetchData(true);
                                  } else if (r?.code === 'MASTER_PIN_REQUIRED') {
                                    setIsUnlocked(false);
                                    setPinError(r.error || 'Sesi PIN Master berakhir. Masukkan PIN Master kembali.');
                                  } else {
                                    setSmtpErrorMsg(r.error || 'Gagal memperbarui akun SMTP.');
                                  }
                                } catch (err: any) {
                                  setSmtpErrorMsg(err?.message || 'Gagal menghubungi server.');
                                } finally {
                                  setIsSavingEditSmtp(false);
                                }
                              }}
                              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-slate-800 dark:text-white flex items-center space-x-1.5">
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
                                  <span>Aktif dalam Rotasi</span>
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
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Host SMTP</label>
                                  <input
                                    type="text"
                                    required
                                    value={editingSmtp.host}
                                    onChange={e => setEditingSmtp(prev => (prev ? { ...prev, host: e.target.value } : null))}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono"
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
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-bold"
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
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">Nama Pengirim (Sender Name)</label>
                                  <input
                                    type="text"
                                    value={editingSmtp.sender_name}
                                    onChange={e => setEditingSmtp(prev => (prev ? { ...prev, sender_name: e.target.value } : null))}
                                    placeholder={whitelabel.app_name || 'Japriin'}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs"
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
                                    placeholder={acc.pass_masked ? `Tersimpan (${acc.pass_masked}) - kosongkan jika tetap` : 'Masukkan App Password baru'}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-end space-x-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingSmtp(null)}
                                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold"
                                >
                                  Batal
                                </button>
                                <button
                                  type="submit"
                                  disabled={isSavingEditSmtp}
                                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black disabled:opacity-50"
                                >
                                  {isSavingEditSmtp ? 'Menyimpan...' : 'Simpan Perubahan'}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                    <PaginationControls
                      currentPage={safeSmtpPage}
                      totalItems={smtpList.length}
                      pageSize={smtpPageSize}
                      onPageChange={setSmtpPage}
                      itemLabel="akun SMTP"
                    />
                  </div>
                );
              })()
            )}

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3">
              <input
                type="email"
                value={testEmailRecipient}
                onChange={e => setTestEmailRecipient(e.target.value)}
                placeholder="Masukkan email tujuan untuk tes kirim (contoh: tujuan@gmail.com)"
                className="w-full sm:flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs"
              />
              <button
                type="button"
                disabled={isSendingTestEmail || !testEmailRecipient.trim()}
                onClick={async () => {
                  setIsSendingTestEmail(true);
                  setSmtpErrorMsg('');
                  try {
                    const r = await apiFetch('/api/smtp/test', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ recipient_email: testEmailRecipient.trim() })
                    }).then(res => res.json());
                    if (r.success) showToast(`✓ ${r.message}`);
                    else setSmtpErrorMsg(r.error || r.message || 'Gagal mengirim email uji coba.');
                    fetchData();
                  } catch (e: any) {
                    setSmtpErrorMsg(e?.message || 'Gagal mengirim email uji coba.');
                  } finally {
                    setIsSendingTestEmail(false);
                  }
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingTestEmail ? 'Mengirim...' : 'Kirim Email Uji Coba'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: META AI WHATSAPP (BAILEYS) */}
      {activeTab === 'gemini' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <span>Arsitektur Meta AI WhatsApp (Tanpa API Key Eksternal)</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Aplikasi tidak memakai Gemini API Key eksternal. Setiap pesan pelanggan dikirim ke chat <strong>Meta AI</strong> (<code className="font-mono">{metaAiJid}</code>) di sesi WhatsApp Baileys masing-masing tenant lalu balasannya diteruskan kembali ke pelanggan.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestMetaAiConnection}
                disabled={isTestingMetaAi}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xs flex items-center space-x-1.5 shrink-0 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingMetaAi ? 'animate-spin' : ''}`} />
                <span>Cek Status Meta AI</span>
              </button>
            </div>

            {metaAiTestResult && (
              <div className={`p-3 rounded-2xl text-xs font-bold border ${
                metaAiTestResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
              }`}>
                {metaAiTestResult.message}
              </div>
            )}
          </div>

          {/* Sub-Menu Meta AI */}
          <div className="flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-fit overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setGeminiSubTab('sessions')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap shrink-0 transition-colors ${
                geminiSubTab === 'sessions'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Sesi Meta AI Siap ({metaAiSessions.length})
            </button>
            <button
              type="button"
              onClick={() => setGeminiSubTab('audit')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap shrink-0 transition-colors ${
                geminiSubTab === 'audit'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Log Audit AI ({aiAuditLogs.length})
            </button>
          </div>

          {geminiSubTab === 'sessions' && (() => {
            const pageSize = 6;
            const safePage = Math.min(metaAiSessionsPage, Math.max(1, Math.ceil(metaAiSessions.length / pageSize)));
            const paginatedSessions = metaAiSessions.slice((safePage - 1) * pageSize, safePage * pageSize);
            return (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Sesi WhatsApp Baileys Siap Meta AI ({metaAiSessions.length})
                  </h5>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {metaAiSessions.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Belum ada sesi WhatsApp Baileys yang terhubung saat ini. Hubungkan nomor WhatsApp melalui menu Koneksi.
                    </div>
                  ) : (
                    paginatedSessions.map(s => (
                      <div key={s.sessionId} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-slate-900 dark:text-white text-xs font-mono">{s.phoneNumber || s.sessionId}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Terhubung · Meta AI Siap
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 space-x-2 font-mono">
                            <span>Session: {s.sessionId}</span>
                            <span>•</span>
                            <span>User ID: {s.userId}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {metaAiSessions.length > pageSize && (
                  <div className="px-4 pb-4">
                    <PaginationControls
                      currentPage={safePage}
                      totalItems={metaAiSessions.length}
                      pageSize={pageSize}
                      onPageChange={setMetaAiSessionsPage}
                      itemLabel="sesi"
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {geminiSubTab === 'audit' && (() => {
            const pageSize = 8;
            const safePage = Math.min(aiAuditLogsPage, Math.max(1, Math.ceil(aiAuditLogs.length / pageSize)));
            const paginatedLogs = aiAuditLogs.slice((safePage - 1) * pageSize, safePage * pageSize);
            return (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Log Audit Error &amp; Aktivitas AI Server
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Tersimpan persisten di file server <code className="font-mono font-bold text-slate-700 dark:text-slate-200">{aiAuditLogFile}</code> (rotasi otomatis 2 MB, nomor tersensor).
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(['ALL', 'ERROR', 'WARN', 'INFO'] as const).map(lvl => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => handleRefreshAiAuditLogs(lvl)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-colors ${
                          aiAuditLevelFilter === lvl
                            ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {lvl === 'ALL' ? 'Semua' : lvl}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleRefreshAiAuditLogs(aiAuditLevelFilter)}
                      disabled={isLoadingAuditLogs}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingAuditLogs ? 'animate-spin' : ''}`} />
                      <span>Segarkan</span>
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {aiAuditLogs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Belum ada catatan log audit AI pada filter ini. Setiap error Meta AI, timeout, ACK ditolak, kuota habis, atau sukses balasan akan tercatat otomatis di sini dan di <code className="font-mono">{aiAuditLogFile}</code>.
                    </div>
                  ) : (
                    paginatedLogs.map((entry, idx) => (
                      <div key={`${entry.timestamp}-${idx}`} className="p-3.5 text-xs space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              entry.level === 'ERROR'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : entry.level === 'WARN'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}>
                              {entry.level}
                            </span>
                            <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">{entry.stage}</span>
                            {entry.error_code && (
                              <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-rose-700 dark:text-rose-300">
                                {entry.error_code}
                              </code>
                            )}
                            {entry.latency_ms !== undefined && (
                              <span className="text-[10px] font-mono text-slate-400">{entry.latency_ms}ms</span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                            {new Date(entry.timestamp).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">{entry.reason}</p>
                        <div className="text-[10px] font-mono text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                          {entry.session_id && <span>session: {entry.session_id}</span>}
                          {entry.user_id && <span>user: {entry.user_id}</span>}
                          {entry.customer_code && <span>chat: {entry.customer_code}</span>}
                          {entry.sender_masked && <span>sender: {entry.sender_masked}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {aiAuditLogs.length > pageSize && (
                  <div className="px-4 pb-4">
                    <PaginationControls
                      currentPage={safePage}
                      totalItems={aiAuditLogs.length}
                      pageSize={pageSize}
                      onPageChange={setAiAuditLogsPage}
                      itemLabel="log audit"
                    />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 4: UPLOAD QRIS & REKENING */}
      {activeTab === 'qris' && (
        <form onSubmit={handleSaveQris} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-5">
          <div>
            <h4 className="text-base font-black text-slate-900 dark:text-white">
              Pengaturan QRIS &amp; Rekening Pembayaran Resmi
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Upload foto barcode QRIS langsung dari perangkat Anda atau masukkan URL gambar. Barcode ini akan muncul saat pembeli melakukan checkout paket.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                  Upload File Barcode QRIS
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQrImageUpload}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1">
                  Atau Masukkan URL Barcode QRIS
                </label>
                <input
                  type="url"
                  value={qrisConfig.image_url}
                  onChange={e => setQrisConfig({ ...qrisConfig, image_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono"
                />
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
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs"
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
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono font-bold"
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
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold"
                />
              </div>
            </div>

            {/* QR Preview */}
            <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                Pratinjau QRIS di Layar Pembeli:
              </span>
              <div className="w-48 h-48 mx-auto bg-white p-2 rounded-2xl shadow-md border border-slate-200 flex items-center justify-center">
                <img
                  src={qrisConfig.image_url || 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=JAPRIIN'}
                  alt="QRIS Preview"
                  className="w-full h-full object-contain"
                />
              </div>
              <h5 className="font-black text-xs text-slate-900 dark:text-white">{qrisConfig.account_name}</h5>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={isSavingQris}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md flex items-center space-x-2"
            >
              {isSavingQris && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>Simpan QRIS &amp; Rekening</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 6: SERVER CLUSTER (APP_ID) & MONITOR KONEKSI WHATSAPP */}
      {activeTab === 'cluster' && (() => {
        const allPeers = clusterData?.inter_app_ping?.peers || [];
        const peersPageSize = 6;
        const safePeersPage = Math.min(clusterPeersPage, Math.max(1, Math.ceil(allPeers.length / peersPageSize)));
        const paginatedPeers = allPeers.slice((safePeersPage - 1) * peersPageSize, safePeersPage * peersPageSize);

        const allNodes = clusterData?.nodes || [];
        const nodesPageSize = 6;
        const safeNodesPage = Math.min(clusterNodesPage, Math.max(1, Math.ceil(allNodes.length / nodesPageSize)));
        const paginatedNodes = allNodes.slice((safeNodesPage - 1) * nodesPageSize, safeNodesPage * nodesPageSize);

        const filteredSessions = (clusterData?.sessions || []).filter(
          s => clusterFilter === 'all' || s.monitor_health === clusterFilter
        );
        const sessionsPageSize = 8;
        const safeSessionsPage = Math.min(clusterSessionsPage, Math.max(1, Math.ceil(filteredSessions.length / sessionsPageSize)));
        const paginatedSessions = filteredSessions.slice(
          (safeSessionsPage - 1) * sessionsPageSize,
          safeSessionsPage * sessionsPageSize
        );

        const filteredClusterUsers = (clusterData?.users || []).filter(u => {
          const q = userSearchFilter.trim().toLowerCase();
          if (!q) return true;
          return (
            u.username.toLowerCase().includes(q) ||
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)
          );
        });
        const usersPageSize = 8;
        const safeClusterUsersPage = Math.min(
          clusterUsersPage,
          Math.max(1, Math.ceil(filteredClusterUsers.length / usersPageSize))
        );
        const paginatedClusterUsers = filteredClusterUsers.slice(
          (safeClusterUsersPage - 1) * usersPageSize,
          safeClusterUsersPage * usersPageSize
        );

        const allActiveSockets = clusterData?.active_sockets || [];
        const socketsPageSize = 6;
        const safeSocketsPage = Math.min(clusterSocketsPage, Math.max(1, Math.ceil(allActiveSockets.length / socketsPageSize)));
        const paginatedSockets = allActiveSockets.slice(
          (safeSocketsPage - 1) * socketsPageSize,
          safeSocketsPage * socketsPageSize
        );

        const allKillIps = clusterData?.kill_target_ips || [];
        const killIpsPageSize = 5;
        const safeKillIpsPage = Math.min(clusterKillIpsPage, Math.max(1, Math.ceil(allKillIps.length / killIpsPageSize)));
        const paginatedKillIps = allKillIps.slice(
          (safeKillIpsPage - 1) * killIpsPageSize,
          safeKillIpsPage * killIpsPageSize
        );

        const allTelegrams = clusterData?.telegram_configs || [];
        const telegramPageSize = 4;
        const safeTelegramPage = Math.min(
          clusterTelegramPage,
          Math.max(1, Math.ceil(allTelegrams.length / telegramPageSize))
        );
        const paginatedTelegrams = allTelegrams.slice(
          (safeTelegramPage - 1) * telegramPageSize,
          safeTelegramPage * telegramPageSize
        );

        const clusterSubTabs = [
          { id: 'ringkasan' as const, label: 'Ringkasan & Mesh WS' },
          { id: 'nodes' as const, label: `Node Server (${allNodes.length})` },
          { id: 'sessions' as const, label: `Sesi WA (${clusterData?.sessions.length || 0})` },
          { id: 'users' as const, label: `Akun & APP_ID (${clusterData?.users?.length || 0})` },
          { id: 'security' as const, label: `Socket & IP Security (${allActiveSockets.length})` },
          { id: 'alerts' as const, label: `Alert & Telegram (${allTelegrams.length})` }
        ];

        return (
          <div className="space-y-5">
            {/* Header & Controls */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-emerald-600" />
                    <span>Orkestrasi Server APP_ID &amp; Monitor Koneksi</span>
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    APP_ID Aktif: {clusterData?.current_app_id || 'undefined'}
                  </span>
                  {clusterData?.self_socket?.primary_ip && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                      IP Host Ini: {clusterData.self_socket.primary_ip}
                    </span>
                  )}
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                      clusterData?.multi_node_enabled
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {clusterData?.multi_node_enabled ? 'Mode Multi-Host Aktif' : 'Mode Single Host'}
                  </span>
                  {clusterData?.inter_app_ping?.enabled && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800 tabular-nums">
                      Mesh WebSocket &amp; Ping ({Math.round((clusterData.inter_app_ping.interval_ms || 15000) / 1000)}d · WS {(clusterData.inter_app_ping.ws_outbound_open ?? 0) + (clusterData.inter_app_ping.ws_inbound_open ?? 0)} aktif · {allPeers.length} peer)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Mesh WebSocket persisten menjaga node 0-WA dan node aktif saling terhubung setiap ~15 detik agar tidak sleep. IP aktif dilindungi dari Kill, mendukung Unkill IP, failover prioritas Superadmin → Premium → Gratis, dan alert real-time Telegram.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={fetchClusterMonitor}
                  disabled={isLoadingCluster}
                  className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCluster ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={handleRunClusterTick}
                  disabled={isRunningClusterTick}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-60 whitespace-nowrap"
                >
                  <Activity className={`w-3.5 h-3.5 ${isRunningClusterTick ? 'animate-pulse' : ''}`} />
                  <span>{isRunningClusterTick ? 'Memproses...' : 'Jalankan Tugas Node'}</span>
                </button>
              </div>
            </div>

            {/* Cluster Sub-Menu Navigation */}
            <div className="flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto">
              {clusterSubTabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setClusterSubTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap shrink-0 transition-colors ${
                    clusterSubTab === tab.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* SUB-TAB 1: RINGKASAN & KEEPALIVE WEBSOCKET MESH */}
            {clusterSubTab === 'ringkasan' && (
              <div className="space-y-5">
                {clusterData && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Socket Aktif (Per IP)</div>
                      <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                        {clusterData.summary.online_sockets ?? clusterData.active_sockets?.filter(s => s.online).length ?? 0} / {clusterData.summary.total_sockets ?? clusterData.active_sockets?.length ?? 0}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Node Terdaftar</div>
                      <div className="text-xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                        {clusterData.summary.online_nodes} / {clusterData.summary.total_nodes}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Kapasitas Terpakai</div>
                      <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 tabular-nums">
                        {clusterData.summary.used_capacity} / {clusterData.summary.total_capacity}
                      </div>
                    </div>
                    <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-4">
                      <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Aman Terkoneksi</div>
                      <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
                        {clusterData.summary.connected_count}
                      </div>
                    </div>
                    <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-2xl p-4">
                      <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">Konflik (440)</div>
                      <div className="text-xl font-black text-rose-700 dark:text-rose-400 mt-1 tabular-nums">
                        {clusterData.summary.conflict_count}
                      </div>
                    </div>
                    <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl p-4">
                      <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Error / Delegasi</div>
                      <div className="text-xl font-black text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
                        {clusterData.summary.error_count} err · {clusterData.summary.delegating_count} dlg
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h5 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-600" />
                        <span>Mesh WebSocket &amp; Keepalive Ping Antar-App</span>
                      </h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Koneksi WebSocket persisten (<code className="font-mono">/ws/cluster</code>) + fallback HTTP menjaga interaksi tiap {Math.round((clusterData?.inter_app_ping?.interval_ms || 15000) / 1000)} detik antara node <strong>0 WA</strong> dan node dengan sesi aktif agar hosting tidak sleep.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 font-mono">
                    <div>
                      <span className="text-slate-500 block">WA Lokal Aktif</span>
                      <strong className="text-sm text-slate-900 dark:text-white tabular-nums">
                        {clusterData?.inter_app_ping?.local_active_connections ?? 0}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">WS Mesh (Out / In)</span>
                      <strong className="text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {clusterData?.inter_app_ping?.ws_outbound_open ?? 0} out · {clusterData?.inter_app_ping?.ws_inbound_open ?? 0} in
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Ping Keluar Terakhir</span>
                      <strong className="text-sm text-slate-900 dark:text-white tabular-nums">
                        {clusterData?.inter_app_ping?.last_round_at
                          ? new Date(clusterData.inter_app_ping.last_round_at).toLocaleTimeString('id-ID')
                          : '-'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Ping Masuk Terakhir</span>
                      <strong className="text-xs text-slate-900 dark:text-white truncate block">
                        {clusterData?.inter_app_ping?.last_inbound_ping_at
                          ? `${clusterData.inter_app_ping.last_inbound_ping_from || 'peer'} · ${new Date(clusterData.inter_app_ping.last_inbound_ping_at).toLocaleTimeString('id-ID')}`
                          : '-'}
                      </strong>
                    </div>
                  </div>

                  {allPeers.length > 0 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {paginatedPeers.map(p => (
                          <div
                            key={p.appId}
                            className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                {p.appId} ({p.peerConnections} WA)
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">{p.origin}</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-black uppercase">
                                {p.transport || (p.wsState === 'open' ? 'ws' : 'http')}
                              </span>
                              <span className={p.lastOk ? 'text-emerald-600 font-black tabular-nums' : 'text-rose-600 font-black tabular-nums'}>
                                {p.lastOk ? `OK ${p.lastLatencyMs ?? 0}ms` : `FAIL (${p.consecutiveFailures}x)`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <PaginationControls
                        currentPage={safePeersPage}
                        totalItems={allPeers.length}
                        pageSize={peersPageSize}
                        onPageChange={setClusterPeersPage}
                        itemLabel="peer cluster"
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic py-2">
                      Menunggu peer app lain terdeteksi di cluster MySQL.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: NODE SERVER CLUSTER */}
            {clusterSubTab === 'nodes' && (
              <div className="space-y-5">
                {/* Tambah / Edit Node APP_ID */}
                <form
                  onSubmit={handleSaveClusterNode}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4 text-emerald-600" />
                      <h5 className="text-sm font-black text-slate-900 dark:text-white">
                        {editingNodeAppId ? `Edit Node ${editingNodeAppId}` : 'Tambah / Atur Batas Koneksi Node (APP_ID)'}
                      </h5>
                    </div>
                    {editingNodeAppId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNodeAppId(null);
                          setNodeAppIdInput('');
                          setNodeNameInput('');
                          setNodeMaxConnInput('10');
                          setNodeIsActiveInput(true);
                        }}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700"
                      >
                        Batal Edit
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        APP_ID (sesuai ENV host)
                      </label>
                      <input
                        type="text"
                        required
                        disabled={Boolean(editingNodeAppId)}
                        value={nodeAppIdInput}
                        onChange={e => setNodeAppIdInput(e.target.value)}
                        placeholder="app01 / app02"
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Label Server
                      </label>
                      <input
                        type="text"
                        value={nodeNameInput}
                        onChange={e => setNodeNameInput(e.target.value)}
                        placeholder="Server Jakarta 01"
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Maksimal Koneksi WA
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={10000}
                        value={nodeMaxConnInput}
                        onChange={e => setNodeMaxConnInput(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-black text-emerald-600"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={nodeIsActiveInput}
                        onChange={e => setNodeIsActiveInput(e.target.checked)}
                        className="rounded text-emerald-600"
                      />
                      <span>Node aktif menerima tugas koneksi &amp; delegasi otomatis</span>
                    </label>

                    <button
                      type="submit"
                      disabled={isSavingClusterConfig}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
                    >
                      {isSavingClusterConfig && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{editingNodeAppId ? 'Simpan Perubahan Node' : 'Simpan Node Server'}</span>
                    </button>
                  </div>
                </form>

                {/* Daftar Server Cluster (Paginated) */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h5 className="text-sm font-black text-slate-900 dark:text-white">
                      Daftar Server Cluster ({allNodes.length})
                    </h5>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Klik <strong>Detail WA</strong> pada tiap App untuk melihat nomor yang tersambung, memutuskan WA, atau memindahkan ke App lain.
                    </span>
                  </div>
                  {!clusterData || allNodes.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Belum ada node terdaftar. Tambahkan node (misal app01 batas 10, app02 batas 5) di atas.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {paginatedNodes.map(node => {
                          const pct = node.max_connections > 0
                            ? Math.min(100, Math.round((node.active_connections / node.max_connections) * 100))
                            : 0;
                          const nodeAppNorm = node.app_id.trim().toLowerCase();
                          const nodeSessionsCount = (clusterData.sessions || []).filter(
                            s =>
                              s.assignment_status !== 'released' &&
                              ((s.connected_app_id || '').trim().toLowerCase() === nodeAppNorm ||
                                (s.assigned_app_id || '').trim().toLowerCase() === nodeAppNorm)
                          ).length;

                          return (
                            <div
                              key={node.app_id}
                              className={`p-4 rounded-2xl border space-y-3 ${
                                node.app_id === clusterData.current_app_id
                                  ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                                  : 'bg-slate-50/70 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAppDetail({ appId: node.app_id, title: node.name || node.app_id })}
                                  className="min-w-0 text-left group"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                        node.online ? 'bg-emerald-500' : 'bg-rose-500'
                                      }`}
                                    />
                                    <span className="font-mono text-xs font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate underline decoration-dotted">
                                      {node.app_id}
                                    </span>
                                    {node.app_id === clusterData.current_app_id && (
                                      <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-indigo-600 text-white">
                                        HOST INI
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate mt-0.5">
                                    {node.name || node.app_id}
                                  </div>
                                </button>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                                    node.is_active
                                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  {node.is_active ? 'Aktif' : 'Nonaktif'}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between text-[11px] font-bold">
                                  <span className="text-slate-500 dark:text-slate-400">Koneksi Terisi</span>
                                  <span className="text-slate-900 dark:text-white tabular-nums">
                                    {node.active_connections} / {node.max_connections} ({pct}%)
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>

                              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5">
                                {node.domain && <div className="truncate">Domain: {node.domain}</div>}
                                {node.server_ip && <div>IP Info: {node.server_ip}</div>}
                                {node.last_heartbeat_at && (
                                  <div>Heartbeat: {new Date(node.last_heartbeat_at).toLocaleString('id-ID')}</div>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAppDetail({ appId: node.app_id, title: node.name || node.app_id })}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 inline-flex items-center gap-1"
                                >
                                  <Smartphone className="w-3 h-3" />
                                  <span>Detail WA ({nodeSessionsCount})</span>
                                </button>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleClusterNodeActive(node)}
                                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                                  >
                                    {node.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingNodeAppId(node.app_id);
                                      setNodeAppIdInput(node.app_id);
                                      setNodeNameInput(node.name || '');
                                      setNodeMaxConnInput(String(node.max_connections));
                                      setNodeIsActiveInput(node.is_active !== false);
                                    }}
                                    className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600"
                                    title="Edit Node"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteClusterNode(node.app_id)}
                                    className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50"
                                    title="Hapus Node"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <PaginationControls
                        currentPage={safeNodesPage}
                        totalItems={allNodes.length}
                        pageSize={nodesPageSize}
                        onPageChange={setClusterNodesPage}
                        itemLabel="node server"
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 3: SESI WHATSAPP & PAIRING CLUSTER */}
            {clusterSubTab === 'sessions' && (
              <div className="space-y-5">
                {/* Tugaskan Pairing Eksklusif ke APP_ID */}
                <form
                  onSubmit={handleAssignPairingTarget}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-indigo-600" />
                    <h5 className="text-sm font-black text-slate-900 dark:text-white">
                      Arahkan Pairing ke APP_ID Cluster
                    </h5>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Delegasi dilakukan berdasarkan <strong>APP_ID</strong> (bukan IP agar aman saat IP hosting berubah). Hanya server dengan APP_ID tujuan yang menjalankan pairing; server lain otomatis melepaskan.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    <input
                      type="text"
                      required={pairAssignMethod === 'pairing_code'}
                      value={pairAssignPhone}
                      onChange={e => setPairAssignPhone(e.target.value)}
                      placeholder="Nomor WA (misal: 628123456789)"
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                    <select
                      value={availableAppIds.includes(pairAssignAppId.trim().toLowerCase()) ? pairAssignAppId.trim().toLowerCase() : ''}
                      onChange={e => setPairAssignAppId(e.target.value)}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                    >
                      <option value="">-- Pilih APP_ID Aktif --</option>
                      {availableAppIds.map(id => (
                        <option key={id} value={id}>
                          APP_ID: {id}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      value={pairAssignAppId}
                      onChange={e => setPairAssignAppId(e.target.value)}
                      placeholder="Ketik APP_ID (misal: 01, 02)"
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                    <select
                      value={pairAssignMethod}
                      onChange={e => setPairAssignMethod(e.target.value as 'pairing_code' | 'qr_code')}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-2 text-xs font-bold"
                    >
                      <option value="pairing_code">Pairing Code</option>
                      <option value="qr_code">QR Code</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isAssigningPairing || !pairAssignAppId.trim() || (pairAssignMethod === 'pairing_code' && !pairAssignPhone.trim())}
                      className="py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black disabled:opacity-50 whitespace-nowrap"
                    >
                      {isAssigningPairing ? 'Menugaskan...' : 'Tugaskan App'}
                    </button>
                  </div>
                  {pairAssignResult && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-200 space-y-1">
                      <div className="font-semibold">{pairAssignResult.message}</div>
                      {pairAssignResult.pairing_code && (
                        <div className="font-mono text-sm font-black tracking-widest">
                          Kode Pairing: {pairAssignResult.pairing_code}
                        </div>
                      )}
                    </div>
                  )}
                </form>

                {/* Monitor Koneksi Nomor WhatsApp Table (Paginated) */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-black text-slate-900 dark:text-white">
                        Monitor Koneksi Nomor WhatsApp ({filteredSessions.length})
                      </h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Klik tombol Detail pada setiap nomor untuk melihat riwayat APP_ID, kegagalan node, serta server/koneksi mana yang menyebabkan konflik 440.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'all', label: 'Semua' },
                          { id: 'connected', label: 'Aman Terkoneksi' },
                          { id: 'conflict', label: 'Konflik' },
                          { id: 'error', label: 'Error' },
                          { id: 'delegating', label: 'Delegasi' }
                        ] as const
                      ).map(chip => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => setClusterFilter(chip.id)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all whitespace-nowrap ${
                            clusterFilter === chip.id
                              ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-3 font-black">Status</th>
                          <th className="py-2.5 px-3 font-black">Nomor WhatsApp</th>
                          <th className="py-2.5 px-3 font-black">Pemilik</th>
                          <th className="py-2.5 px-3 font-black">APP_ID Tugas / Aktif</th>
                          <th className="py-2.5 px-3 font-black">Keterangan Singkat</th>
                          <th className="py-2.5 px-3 font-black text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {paginatedSessions.map(s => {
                          const dotClass =
                            s.monitor_health === 'connected'
                              ? 'bg-emerald-500'
                              : s.monitor_health === 'delegating'
                                ? 'bg-amber-500 animate-pulse'
                                : 'bg-rose-500';
                          const badgeClass =
                            s.monitor_health === 'connected'
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : s.monitor_health === 'conflict'
                                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                : s.monitor_health === 'error'
                                  ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700'
                                  : s.monitor_health === 'delegating'
                                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
                          const label =
                            s.monitor_health === 'connected'
                              ? 'Aman Terkoneksi'
                              : s.monitor_health === 'conflict'
                                ? 'Konflik (440)'
                                : s.monitor_health === 'error'
                                  ? 'Error Semua Node'
                                  : s.monitor_health === 'delegating'
                                    ? 'Proses / Delegasi'
                                    : 'Terputus';

                          return (
                            <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${badgeClass}`}>
                                  <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                                  <span>{label}</span>
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-mono font-black text-slate-900 dark:text-white">
                                  +{s.phone_number || '-'}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {s.session_name}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-bold text-slate-800 dark:text-slate-200">
                                  {s.owner_name || s.owner_username || '-'}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {s.owner_email || s.user_id || ''}
                                </div>
                              </td>
                              <td className="py-3 px-3 font-mono text-[11px]">
                                <div>
                                  Tugas App: <strong className="text-indigo-600 dark:text-indigo-400">{s.assigned_app_id || '-'}</strong>
                                </div>
                                <div className="text-slate-500 dark:text-slate-400">
                                  Aktif: <strong>{s.connected_app_id || 'undefined'}</strong>
                                  {s.connected_server_ip && <span> · {s.connected_server_ip}</span>}
                                </div>
                              </td>
                              <td className="py-3 px-3 max-w-xs">
                                <div className="truncate text-[11px] text-slate-600 dark:text-slate-300">
                                  {s.multi_location_active && s.monitor_health === 'connected'
                                    ? 'Aman Terkoneksi (juga aktif di lokasi lain)'
                                    : s.conflict_detail?.source_label ||
                                      s.assignment_error ||
                                      s.disconnect_reason ||
                                      (s.monitor_health === 'connected' ? 'Socket sehat & terhubung' : '-')}
                                </div>
                                {Array.isArray(s.failed_app_ids) && s.failed_app_ids.length > 0 && (
                                  <div className="text-[10px] text-rose-600 dark:text-rose-400 font-mono">
                                    Gagal di: {s.failed_app_ids.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSessionDetail(s);
                                    setReassignTargetAppId(s.assigned_app_id || '');
                                    setApplyReassignToUser(false);
                                    setDetailHealthMessage(null);
                                  }}
                                  className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-[11px] font-black inline-flex items-center gap-1"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                  <span>Detail</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredSessions.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                              Tidak ada sesi WhatsApp untuk filter ini.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <PaginationControls
                    currentPage={safeSessionsPage}
                    totalItems={filteredSessions.length}
                    pageSize={sessionsPageSize}
                    onPageChange={setClusterSessionsPage}
                    itemLabel="sesi WA"
                  />
                </div>
              </div>
            )}

            {/* SUB-TAB 4: PENUGASAN APP_ID PER AKUN PENGGUNA */}
            {clusterSubTab === 'users' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h5 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Server className="w-4 h-4 text-indigo-600" />
                      <span>Penugasan APP_ID Tetap Per Akun Pengguna ({filteredClusterUsers.length})</span>
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Satu nomor WA &amp; akun hanya berjalan di 1 App Cluster. Jika akun ditetapkan ke APP_ID <strong>02</strong>, maka koneksi akun tersebut di APP_ID <strong>01</strong> (atau app lain) otomatis diputuskan.
                    </p>
                  </div>
                  <input
                    type="text"
                    value={userSearchFilter}
                    onChange={e => setUserSearchFilter(e.target.value)}
                    placeholder="Cari username / nama / email..."
                    className="sm:w-64 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs"
                  />
                </div>

                {!clusterData?.users || clusterData.users.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                    Belum ada daftar akun pengguna yang dimuat dari database cluster.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                          <tr>
                            <th className="py-2.5 px-3 font-black">Akun Pengguna</th>
                            <th className="py-2.5 px-3 font-black">APP_ID Saat Ini</th>
                            <th className="py-2.5 px-3 font-black">APP_ID Tujuan Baru</th>
                            <th className="py-2.5 px-3 font-black text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {paginatedClusterUsers.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-xs text-slate-500">
                                Tidak ada akun pengguna yang cocok dengan pencarian &quot;{userSearchFilter}&quot;.
                              </td>
                            </tr>
                          ) : (
                            paginatedClusterUsers.map(u => {
                              const draftVal = userAppTargets[u.id] !== undefined ? userAppTargets[u.id] : (u.assigned_app_id || '');
                              return (
                                <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                                  <td className="py-2.5 px-3">
                                    <div className="font-bold text-slate-900 dark:text-white">
                                      {u.name} <span className="font-mono text-[11px] text-slate-500">@{u.username}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{u.email} · {u.role}</div>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono">
                                    {u.assigned_app_id ? (
                                      <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-black text-[11px]">
                                        {u.assigned_app_id}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-slate-400">Otomatis</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <select
                                        value={availableAppIds.includes(draftVal.trim().toLowerCase()) ? draftVal.trim().toLowerCase() : ''}
                                        onChange={e => setUserAppTargets(prev => ({ ...prev, [u.id]: e.target.value }))}
                                        className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono"
                                      >
                                        <option value="">Otomatis (Bebas)</option>
                                        {availableAppIds.map(id => (
                                          <option key={id} value={id}>{id}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        value={draftVal}
                                        onChange={e => setUserAppTargets(prev => ({ ...prev, [u.id]: e.target.value }))}
                                        placeholder="atau ketik misal: 02"
                                        className="w-28 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono"
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                                    <button
                                      type="button"
                                      disabled={savingUserAppId === u.id}
                                      onClick={() => handleAssignUserToApp(u.id, draftVal)}
                                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black disabled:opacity-50"
                                    >
                                      {savingUserAppId === u.id ? 'Menyimpan...' : 'Terapkan'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <PaginationControls
                      currentPage={safeClusterUsersPage}
                      totalItems={filteredClusterUsers.length}
                      pageSize={usersPageSize}
                      onPageChange={setClusterUsersPage}
                      itemLabel="akun pengguna"
                    />
                  </>
                )}
              </div>
            )}

            {/* SUB-TAB 5: SOCKET AKTIF PER IP & KILL/UNKILL SECURITY */}
            {clusterSubTab === 'security' && clusterData && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4">
                  <div>
                    <h5 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Radio className="w-4 h-4 text-emerald-600" />
                      <span>Registry Socket Aktif ({allActiveSockets.length})</span>
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Klik tombol <strong>Detail WA</strong> untuk melihat nomor WhatsApp yang berjalan di socket App tersebut, memutuskan WA, atau memindahkannya ke App lain. IP yang masih aktif otomatis dilindungi.
                    </p>
                  </div>

                  {allActiveSockets.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                      Belum ada socket aktif tercatat di database.
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                              <th className="py-2 px-2.5 font-black">Status Socket</th>
                              <th className="py-2 px-2.5 font-black">APP_ID</th>
                              <th className="py-2 px-2.5 font-black">IP &amp; Host / Domain</th>
                              <th className="py-2 px-2.5 font-black">Koneksi Aktif</th>
                              <th className="py-2 px-2.5 font-black text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {paginatedSockets.map(sock => {
                              const sockAppId = sock.app_id || 'undefined';
                              const isKillListed = allKillIps.some(
                                k => k.ip === sock.primary_ip || (sock.all_ips || []).includes(k.ip)
                              );
                              const statusChip =
                                sock.status === 'killed'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                                  : sock.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';

                              return (
                                <tr key={sock.instance_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                  <td className="py-2.5 px-2.5 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${statusChip}`}>
                                        {sock.status === 'active' ? (
                                          <Wifi className="w-3 h-3" />
                                        ) : (
                                          <WifiOff className="w-3 h-3" />
                                        )}
                                        <span>
                                          {sock.status === 'active' ? 'AKTIF' : sock.status === 'killed' ? 'DIMATIKAN' : 'OFFLINE'}
                                        </span>
                                      </span>
                                      {sock.is_self && (
                                        <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black">
                                          HOST INI
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-400 mt-0.5 tabular-nums">
                                      PID {sock.pid || '-'} · {sock.last_heartbeat_at ? new Date(sock.last_heartbeat_at).toLocaleTimeString('id-ID') : '-'}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-2.5 font-mono">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedAppDetail({
                                          appId: sockAppId,
                                          title: sock.domain || sock.hostname || `Socket ${sock.primary_ip || sock.server_ip || ''}`,
                                          instanceId: sock.instance_id
                                        })
                                      }
                                      className={`px-2.5 py-1 rounded-lg font-black text-[11px] border transition-colors ${
                                        !sock.app_id || sock.app_id === 'undefined'
                                          ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                                          : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
                                      }`}
                                      title="Klik untuk melihat detail WA di App ini"
                                    >
                                      {sockAppId}
                                    </button>
                                  </td>
                                  <td className="py-2.5 px-2.5 font-mono">
                                    <div className="font-bold text-slate-900 dark:text-white">{sock.primary_ip || sock.server_ip || '-'}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
                                      {sock.domain || sock.hostname || '-'}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-2.5">
                                    <div className="font-black text-slate-900 dark:text-white tabular-nums">
                                      {sock.active_connections || 0} aktif · {sock.connecting_connections || 0} proses
                                    </div>
                                    {Array.isArray(sock.active_phones) && sock.active_phones.length > 0 && (
                                      <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 truncate max-w-[180px]" title={sock.active_phones.join(', ')}>
                                        +{sock.active_phones.join(', +')}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedAppDetail({
                                            appId: sockAppId,
                                            title: sock.domain || sock.hostname || `Socket ${sock.primary_ip || sock.server_ip || ''}`,
                                            instanceId: sock.instance_id
                                          })
                                        }
                                        className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-[10px] font-black inline-flex items-center gap-1"
                                      >
                                        <Info className="w-3 h-3" />
                                        <span>Detail WA</span>
                                      </button>
                                      {sock.primary_ip && sock.primary_ip !== 'unknown' && (
                                        sock.status === 'killed' || isKillListed ? (
                                          <button
                                            type="button"
                                            disabled={isSavingKillIp}
                                            onClick={() => handleUnkillTargetIp(sock.primary_ip)}
                                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black inline-flex items-center gap-1"
                                            title="Pulihkan socket yang di-kill"
                                          >
                                            <Power className="w-3 h-3" />
                                            <span>Unkill IP</span>
                                          </button>
                                        ) : sock.online || sock.status === 'active' ? (
                                          <span
                                            className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[10px] font-bold inline-flex items-center gap-1"
                                            title="IP aktif/online dilindungi dan tidak dapat di-kill"
                                          >
                                            <ShieldCheck className="w-3 h-3" />
                                            <span>Dilindungi</span>
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={isSavingKillIp}
                                            onClick={() => handleAddKillTargetIp(sock.primary_ip, `Matikan socket IP ${sock.primary_ip}`)}
                                            className="px-2 py-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-[10px] font-black inline-flex items-center gap-1"
                                          >
                                            <Power className="w-3 h-3" />
                                            <span>Kill IP</span>
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <PaginationControls
                        currentPage={safeSocketsPage}
                        totalItems={allActiveSockets.length}
                        pageSize={socketsPageSize}
                        onPageChange={setClusterSocketsPage}
                        itemLabel="socket"
                      />
                    </>
                  )}
                </div>

                {/* Daftar IP Target Shutdown & Unkill IP */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-3 h-fit">
                  <div className="flex items-center gap-2">
                    <Power className="w-4 h-4 text-rose-600" />
                    <h5 className="text-sm font-black text-slate-900 dark:text-white">
                      Target IP Auto-Shutdown &amp; Unkill IP
                    </h5>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    IP yang masih aktif/online dilindungi dan ditolak saat di-kill. Jika ada IP masuk daftar shutdown, klik <strong>Unkill IP</strong> untuk memulihkan socket kembali aktif (cek otomatis tiap ~15 detik).
                  </p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={killTargetIpInput}
                      onChange={e => setKillTargetIpInput(e.target.value)}
                      placeholder="IP Server target offline (misal: 103.x.x.x)"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                    <input
                      type="text"
                      value={killTargetReasonInput}
                      onChange={e => setKillTargetReasonInput(e.target.value)}
                      placeholder="Alasan (opsional)"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={isSavingKillIp || !killTargetIpInput.trim()}
                      onClick={() => handleAddKillTargetIp()}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black disabled:opacity-50"
                    >
                      {isSavingKillIp ? 'Memproses...' : 'Tambahkan IP Target Shutdown'}
                    </button>
                  </div>

                  {allKillIps.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="space-y-1.5">
                        {paginatedKillIps.map(rule => (
                          <div
                            key={rule.ip}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-[11px]"
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-black text-rose-800 dark:text-rose-200">{rule.ip}</div>
                              {rule.reason && <div className="text-[10px] text-rose-600 dark:text-rose-400 truncate">{rule.reason}</div>}
                            </div>
                            <button
                              type="button"
                              disabled={isSavingKillIp}
                              onClick={() => handleUnkillTargetIp(rule.ip)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black shrink-0"
                              title="Unkill & pulihkan IP ini"
                            >
                              Unkill IP
                            </button>
                          </div>
                        ))}
                      </div>
                      <PaginationControls
                        currentPage={safeKillIpsPage}
                        totalItems={allKillIps.length}
                        pageSize={killIpsPageSize}
                        onPageChange={setClusterKillIpsPage}
                        itemLabel="IP"
                        compact
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 6: NOTIFIKASI TELEGRAM (DB) & WA ADMIN */}
            {clusterSubTab === 'alerts' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Nomor Admin Aplikasi */}
                <form
                  onSubmit={handleSaveClusterNotifyPhone}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4 h-fit"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-amber-600" />
                    <h5 className="text-sm font-black text-slate-900 dark:text-white">
                      Nomor WA Admin Aplikasi
                    </h5>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Jika sebuah nomor WhatsApp gagal dibangun di semua node aktif dan tidak ada lagi server tujuan delegasi, sistem akan menandai koneksi tersebut <strong>Error</strong> dan mengirim notifikasi ke nomor ini lewat koneksi Superadmin.
                  </p>
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Nomor WhatsApp Admin (contoh: 6281234567890)
                    </label>
                    <input
                      type="text"
                      value={adminNotifyPhoneInput}
                      onChange={e => setAdminNotifyPhoneInput(e.target.value)}
                      placeholder="6281234567890"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingClusterConfig}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {isSavingClusterConfig && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Simpan Nomor Admin Alert</span>
                  </button>
                </form>

                {/* Notifikasi Telegram & Key Bot (Disimpan di DB) */}
                <form
                  onSubmit={handleSaveTelegramConfig}
                  className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-sky-600" />
                      <h5 className="text-sm font-black text-slate-900 dark:text-white">
                        Notifikasi Telegram &amp; Key Bot (Disimpan di DB)
                      </h5>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        clusterData?.telegram_configured
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {clusterData?.telegram_configured
                        ? `${allTelegrams.filter(t => t.is_active).length} Target Aktif`
                        : 'Belum Terkonfigurasi'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Simpan <strong>Key / Bot Token Telegram</strong> (terenkripsi AES-256-GCM di DB) dan <strong>ID Chat</strong>. Setiap kendala seperti App offline/mati, failover pemindahan WA (jumlah berhasil &amp; gagal), ping gagal, atau error cluster akan otomatis dikirim ke Telegram.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Nama Label
                      </label>
                      <input
                        type="text"
                        value={tgNameInput}
                        onChange={e => setTgNameInput(e.target.value)}
                        placeholder="Admin Alert Utama"
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Key Telegram (Bot Token)
                      </label>
                      <input
                        type="password"
                        value={tgBotTokenInput}
                        onChange={e => setTgBotTokenInput(e.target.value)}
                        placeholder={editingTgId ? 'Kosongkan untuk pertahankan token lama' : '123456789:AAH...'}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        ID Chat Telegram
                      </label>
                      <input
                        type="text"
                        required
                        value={tgChatIdInput}
                        onChange={e => setTgChatIdInput(e.target.value)}
                        placeholder="123456789 atau -100..."
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tgIsActiveInput}
                        onChange={e => setTgIsActiveInput(e.target.checked)}
                        className="rounded text-sky-600"
                      />
                      <span>Aktifkan penerima notifikasi Telegram ini</span>
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                      {editingTgId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTgId(null);
                            setTgNameInput('');
                            setTgBotTokenInput('');
                            setTgChatIdInput('');
                            setTgIsActiveInput(true);
                          }}
                          className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold"
                        >
                          Batal Edit
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={testingTgId === 'draft' || !tgChatIdInput.trim() || (!tgBotTokenInput.trim() && !editingTgId)}
                        onClick={() =>
                          handleTestTelegramConfig({
                            id: editingTgId || undefined,
                            bot_token: tgBotTokenInput.trim() || undefined,
                            chat_id: tgChatIdInput.trim(),
                            name: tgNameInput.trim() || undefined
                          })
                        }
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                      >
                        {testingTgId === 'draft' ? 'Mengirim Tes...' : 'Tes Kirim'}
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingTg}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {isSavingTg && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>{editingTgId ? 'Simpan Perubahan' : 'Add & Simpan ke DB'}</span>
                      </button>
                    </div>
                  </div>

                  {allTelegrams.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                      <div className="space-y-2">
                        {paginatedTelegrams.map(item => (
                          <div
                            key={item.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-slate-900 dark:text-white truncate">{item.name}</span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${
                                    item.is_active
                                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  {item.is_active ? 'AKTIF' : 'JEDA'}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                Chat ID: <strong className="text-slate-700 dark:text-slate-200">{item.chat_id}</strong> · Key: {item.bot_token_masked || item.bot_token || '****'}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={testingTgId === item.id}
                                onClick={() => handleTestTelegramConfig({ id: item.id })}
                                className="px-2.5 py-1 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg text-[10px] font-black"
                              >
                                {testingTgId === item.id ? 'Testing...' : 'Tes'}
                              </button>
                              <button
                                type="button"
                                disabled={isSavingTg}
                                onClick={() => handleToggleTelegramActive(item)}
                                className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold"
                              >
                                {item.is_active ? 'Jeda' : 'Aktifkan'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTgId(item.id);
                                  setTgNameInput(item.name || '');
                                  setTgBotTokenInput('');
                                  setTgChatIdInput(item.chat_id || '');
                                  setTgIsActiveInput(item.is_active !== false);
                                }}
                                className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg"
                                title="Edit Telegram"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isSavingTg}
                                onClick={() => handleDeleteTelegramConfig(item.id)}
                                className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-rose-600 rounded-lg"
                                title="Hapus Telegram"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <PaginationControls
                        currentPage={safeTelegramPage}
                        totalItems={allTelegrams.length}
                        pageSize={telegramPageSize}
                        onPageChange={setClusterTelegramPage}
                        itemLabel="target Telegram"
                      />
                    </div>
                  )}
                </form>
              </div>
            )}
          </div>
        );
      })()}

      {/* DETAIL APP & SOCKET WHATSAPP MODAL (Klik per App/Socket) */}
      {selectedAppDetail && clusterData && (() => {
        const targetNorm = selectedAppDetail.appId.trim().toLowerCase();
        const matchingSockets = (clusterData.active_sockets || []).filter(sock => {
          if (selectedAppDetail.instanceId && sock.instance_id === selectedAppDetail.instanceId) return true;
          const sockApp = (sock.app_id || 'undefined').trim().toLowerCase();
          return sockApp === targetNorm;
        });
        const socketPhoneDigits = new Set(
          matchingSockets.flatMap(sock =>
            (sock.active_phones || []).map(p => String(p || '').replace(/\D/g, '')).filter(Boolean)
          )
        );
        const appSessions = (clusterData.sessions || []).filter(s => {
          if (s.assignment_status === 'released') return false;
          const connApp = (s.connected_app_id || '').trim().toLowerCase();
          const assignApp = (s.assigned_app_id || '').trim().toLowerCase();
          if (targetNorm === 'undefined') {
            return (!connApp && s.runtime_status === 'connected') || (s.phone_number && socketPhoneDigits.has(s.phone_number.replace(/\D/g, '')));
          }
          if (connApp === targetNorm || assignApp === targetNorm) return true;
          const digits = (s.phone_number || '').replace(/\D/g, '');
          return digits ? socketPhoneDigits.has(digits) : false;
        });

        return (
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6 animate-in fade-in"
            onClick={() => setSelectedAppDetail(null)}
          >
            <div
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sticky Header */}
              <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-indigo-600 shrink-0" />
                    <h3 className="text-base font-black text-slate-900 dark:text-white truncate">
                      Detail App &amp; Koneksi Socket: <span className="font-mono text-indigo-600 dark:text-indigo-400">{selectedAppDetail.appId}</span>
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {selectedAppDetail.title || 'Monitor semua nomor WA di App ini — putuskan dari socket atau pindahkan ke APP_ID lain.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAppDetail(null)}
                  aria-label="Tutup modal detail app"
                  className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                {/* Runtime Socket Instances Summary */}
                <div className="space-y-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Instance Socket Terhubung ({matchingSockets.length})
                  </div>
                  {matchingSockets.length === 0 ? (
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                      Belum ada heartbeat socket runtime aktif untuk APP_ID <strong>{selectedAppDetail.appId}</strong>.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {matchingSockets.map(sock => (
                        <div
                          key={sock.instance_id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-black text-slate-900 dark:text-white">
                              IP: {sock.primary_ip || sock.server_ip || '-'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                              sock.status === 'active'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            }`}>
                              {sock.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 truncate font-mono">
                            Host: {sock.domain || sock.hostname || '-'}
                          </div>
                          <div className="text-slate-600 dark:text-slate-300 font-bold">
                            {sock.active_connections || 0} aktif · {sock.connecting_connections || 0} proses · PID {sock.pid || '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Connected / Assigned WhatsApp Numbers on This App */}
                <div className="space-y-2.5">
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    WhatsApp Yang Terhubung / Ditugaskan ke App Ini ({appSessions.length})
                  </div>
                  {appSessions.length === 0 ? (
                    <div className="p-5 text-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                      Tidak ada nomor WhatsApp yang aktif atau ditugaskan ke APP_ID <strong>{selectedAppDetail.appId}</strong>.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {appSessions.map(sess => {
                        const moveVal =
                          appModalMoveTargets[sess.id] !== undefined
                            ? appModalMoveTargets[sess.id]
                            : '';
                        return (
                          <div
                            key={sess.id}
                            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 space-y-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                      sess.monitor_health === 'connected'
                                        ? 'bg-emerald-500'
                                        : sess.monitor_health === 'delegating'
                                          ? 'bg-amber-500 animate-pulse'
                                          : 'bg-rose-500'
                                    }`}
                                  />
                                  <span className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                    +{sess.phone_number || '-'}
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                                    ({sess.session_name})
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                                  Pemilik: <strong>{sess.owner_name || sess.owner_username || sess.user_id || '-'}</strong>
                                  {' · '}
                                  <span className="font-mono">
                                    App Tugas: {sess.assigned_app_id || '-'} / Aktif: {sess.connected_app_id || 'undefined'}
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={isDisconnectingSocketId === sess.id}
                                onClick={() => handleDisconnectSessionSocket(sess.id)}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[11px] font-black inline-flex items-center gap-1 disabled:opacity-50 shrink-0"
                              >
                                <WifiOff className="w-3.5 h-3.5" />
                                <span>{isDisconnectingSocketId === sess.id ? 'Memutus...' : 'Putuskan dari Socket'}</span>
                              </button>
                            </div>

                            {/* Pindah ke App Lain */}
                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                Pindah ke APP_ID:
                              </span>
                              <select
                                value={availableAppIds.includes(moveVal.trim().toLowerCase()) ? moveVal.trim().toLowerCase() : ''}
                                onChange={e => setAppModalMoveTargets(prev => ({ ...prev, [sess.id]: e.target.value }))}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-mono"
                              >
                                <option value="">-- Pilih App Tujuan --</option>
                                {availableAppIds
                                  .filter(id => id !== targetNorm)
                                  .map(id => (
                                    <option key={id} value={id}>
                                      {id}
                                    </option>
                                  ))}
                              </select>
                              <input
                                type="text"
                                value={moveVal}
                                onChange={e => setAppModalMoveTargets(prev => ({ ...prev, [sess.id]: e.target.value }))}
                                placeholder="atau ketik APP_ID (misal: 02)"
                                className="w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-mono"
                              />
                              <button
                                type="button"
                                disabled={isReassigning || !moveVal.trim()}
                                onClick={() => handleMoveSessionToApp(sess.id, moveVal, false)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-black inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>Pindah App</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedAppDetail(null)}
                  className="px-5 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DETAIL KONFLIK & DELEGASI SESSION MODAL */}
      {selectedSessionDetail && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6 animate-in fade-in"
          onClick={() => setSelectedSessionDetail(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-indigo-600 shrink-0" />
                  <h3 className="text-base font-black text-slate-900 dark:text-white truncate">
                    Detail Koneksi &amp; Status WhatsApp
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">
                  +{selectedSessionDetail.phone_number} · {selectedSessionDetail.session_name} ({selectedSessionDetail.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSessionDetail(null)}
                aria-label="Tutup modal detail"
                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">Status Kesehatan</span>
                  <span className="font-black text-slate-900 dark:text-white uppercase">
                    {selectedSessionDetail.monitor_health}
                    {selectedSessionDetail.multi_location_active ? ' (Multi-Lokasi Aman)' : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">Status Tugas Node</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {selectedSessionDetail.assignment_status || 'idle'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">APP_ID Ditugaskan</span>
                  <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 break-all">
                    {selectedSessionDetail.assigned_app_id || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">Server / APP_ID / IP Aktif</span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 break-all">
                    {selectedSessionDetail.connected_server_name || '-'} · {selectedSessionDetail.connected_app_id || 'undefined'} · {selectedSessionDetail.connected_server_ip || '-'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">Node Yang Pernah Gagal</span>
                  <span className="font-mono text-rose-600 dark:text-rose-400">
                    {selectedSessionDetail.failed_app_ids && selectedSessionDetail.failed_app_ids.length > 0
                      ? selectedSessionDetail.failed_app_ids.join(', ')
                      : 'Tidak ada'}
                  </span>
                </div>
                {(selectedSessionDetail.assignment_error || selectedSessionDetail.disconnect_reason) && (
                  <div className="col-span-2">
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-bold">Alasan Error / Putus Terakhir</span>
                    <span className="text-rose-700 dark:text-rose-300 font-medium break-words">
                      {selectedSessionDetail.assignment_error || selectedSessionDetail.disconnect_reason}
                      {selectedSessionDetail.disconnect_code ? ` (Kode ${selectedSessionDetail.disconnect_code})` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Non-aggressive Live Send Test & Quick Socket Reconnect */}
              <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">
                    Verifikasi Kirim WhatsApp (Tanpa Memaksa Reconnect)
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {(!detailHealthMessage?.ok || selectedSessionDetail.runtime_status !== 'connected') && (
                      <button
                        type="button"
                        disabled={reconnectingDetailSession || testingDetailHealth}
                        onClick={() => handleReconnectDetailSession(selectedSessionDetail)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${reconnectingDetailSession ? 'animate-spin' : ''}`} />
                        <span>{reconnectingDetailSession ? 'Menyambung...' : 'Sambungkan Ulang Socket'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={testingDetailHealth || reconnectingDetailSession}
                      onClick={() => handleTestDetailSessionHealth(selectedSessionDetail)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{testingDetailHealth ? 'Menguji...' : 'Tes Kirim Sekarang'}</span>
                    </button>
                  </div>
                </div>
                {detailHealthMessage && (
                  <div
                    className={`p-2.5 rounded-xl text-[11px] font-semibold ${
                      detailHealthMessage.ok
                        ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200'
                        : 'bg-rose-100/80 dark:bg-rose-900/40 text-rose-900 dark:text-rose-200'
                    }`}
                  >
                    {detailHealthMessage.text}
                  </div>
                )}
              </div>

              {selectedSessionDetail.conflict_detail ? (
                <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-2 text-xs">
                  <div className="font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{selectedSessionDetail.conflict_detail.source_label}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    {selectedSessionDetail.conflict_detail.competing_ip && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">IP Server Pesaing:</span>
                        <span className="font-mono font-bold text-rose-700 dark:text-rose-300 break-all">
                          {selectedSessionDetail.conflict_detail.competing_ip}
                        </span>
                      </div>
                    )}
                    {selectedSessionDetail.conflict_detail.local_ip && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">IP Server Lokal:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white break-all">
                          {selectedSessionDetail.conflict_detail.local_ip}
                        </span>
                      </div>
                    )}
                    {selectedSessionDetail.conflict_detail.competing_domain && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Domain Pesaing:</span>
                        <span className="font-mono font-bold break-all">
                          {selectedSessionDetail.conflict_detail.competing_domain}
                        </span>
                      </div>
                    )}
                    {selectedSessionDetail.conflict_detail.competing_hostname && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Hostname / Node:</span>
                        <span className="font-mono font-bold break-all">
                          {selectedSessionDetail.conflict_detail.competing_hostname}
                        </span>
                      </div>
                    )}
                    {selectedSessionDetail.conflict_detail.competing_instance_id && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Instance ID Pesaing:</span>
                        <span className="font-mono break-all">
                          {selectedSessionDetail.conflict_detail.competing_instance_id}
                        </span>
                      </div>
                    )}
                    {(selectedSessionDetail.conflict_detail.competing_session_name || selectedSessionDetail.conflict_detail.competing_session_id) && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Koneksi / Sesi Pesaing:</span>
                        <span className="font-mono font-bold break-all">
                          {selectedSessionDetail.conflict_detail.competing_session_name || '-'} ({selectedSessionDetail.conflict_detail.competing_session_id || '-'})
                        </span>
                      </div>
                    )}
                    {selectedSessionDetail.conflict_detail.competing_last_active_at && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Aktif Terakhir:</span>
                        <span>{new Date(selectedSessionDetail.conflict_detail.competing_last_active_at).toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    {selectedSessionDetail.conflict_detail.raw_reason && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Raw Reason:</span>
                        <span className="font-mono break-all">{selectedSessionDetail.conflict_detail.raw_reason}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 pt-2 border-t border-amber-200/70 dark:border-amber-800/50">
                    {selectedSessionDetail.conflict_detail.detail_note}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 text-xs text-slate-600 dark:text-slate-400">
                  Tidak ada konflik IP/server lain yang tercatat untuk sesi ini.
                </div>
              )}

              {/* Manual Reassign & Disconnect by APP_ID */}
              <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                <div className="text-xs font-black text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Pindah &amp; Delegasi Eksklusif Berdasarkan APP_ID</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={availableAppIds.includes(reassignTargetAppId.trim().toLowerCase()) ? reassignTargetAppId.trim().toLowerCase() : ''}
                    onChange={e => setReassignTargetAppId(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono"
                  >
                    <option value="">-- Pilih APP_ID Tujuan --</option>
                    {availableAppIds.map(id => (
                      <option key={id} value={id}>
                        APP_ID: {id}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={reassignTargetAppId}
                    onChange={e => setReassignTargetAppId(e.target.value)}
                    placeholder="Atau ketik APP_ID (misal: 01, 02)"
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono"
                  />
                </div>
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyReassignToUser}
                    onChange={e => setApplyReassignToUser(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>Tetapkan juga APP_ID ini permanen untuk akun pemilik sesi</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isReassigning || !reassignTargetAppId.trim()}
                    onClick={handleReassignSession}
                    className="flex-1 min-w-[160px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black disabled:opacity-60"
                  >
                    {isReassigning ? 'Memproses...' : 'Pindah ke APP_ID Ini'}
                  </button>
                  <button
                    type="button"
                    disabled={isDisconnectingSocketId === selectedSessionDetail.id}
                    onClick={() => handleDisconnectSessionSocket(selectedSessionDetail.id)}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>{isDisconnectingSocketId === selectedSessionDetail.id ? 'Memutus...' : 'Putuskan dari Socket'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedSessionDetail(null)}
                className="px-5 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLAN EDIT MODAL */}
      {showPlanModal && editingPlan && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6 animate-in fade-in"
          onClick={() => {
            setShowPlanModal(false);
            setEditingPlan(null);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <Layers className="w-5 h-5 text-emerald-600" />
                <span>Edit Ketentuan Paket</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowPlanModal(false);
                  setEditingPlan(null);
                }}
                aria-label="Tutup modal"
                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-300 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">ID Paket</label>
                  <input
                    type="text"
                    required
                    disabled={editingPlan.id === 'free'}
                    value={editingPlan.id}
                    onChange={e => setEditingPlan({ ...editingPlan, id: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Nama Paket</label>
                  <input
                    type="text"
                    required
                    value={editingPlan.name}
                    onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Harga (Rp)</label>
                  <input
                    type="number"
                    required
                    value={editingPlan.price}
                    onChange={e => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-black"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Periode</label>
                  <input
                    type="text"
                    required
                    value={editingPlan.period}
                    onChange={e => setEditingPlan({ ...editingPlan, period: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Limit Pesan WA / Hari</label>
                  <input
                    type="number"
                    required
                    value={editingPlan.daily_msg_limit}
                    onChange={e => setEditingPlan({ ...editingPlan, daily_msg_limit: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold text-emerald-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Limit Pesan WA / Bulan</label>
                  <input
                    type="number"
                    value={editingPlan.monthly_msg_limit || 0}
                    onChange={e => setEditingPlan({ ...editingPlan, monthly_msg_limit: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Maksimal Sesi WA</label>
                  <input
                    type="number"
                    value={1}
                    readOnly
                    disabled
                    title="Semua paket dibatasi 1 nomor WhatsApp per akun"
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-500 cursor-not-allowed"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">1 Nomor / Akun (Semua Paket)</span>
                </div>
              </div>

              {/* Batas Respon Meta AI WhatsApp Per Hari & Per Bulan */}
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/60 rounded-2xl space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-black text-indigo-700 dark:text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {editingPlan.id === 'free'
                      ? 'Respon Meta AI Paket Gratis (Otomatis Mengikuti Batas Chat Harian)'
                      : 'Batas Kuota Respon Meta AI WhatsApp (Otomatis)'}
                  </span>
                </div>
                {editingPlan.id === 'free' ? (
                  <p className="text-[11px] text-indigo-700/90 dark:text-indigo-300/90">
                    Akun Paket Gratis tidak dibatasi kuota AI terpisah — batas respon AI otomatis mengikuti limit pesan harian ({editingPlan.daily_msg_limit}/hari) dan bulanan ({editingPlan.monthly_msg_limit}/bln).
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Batas Respon AI / Hari</label>
                      <input
                        type="number"
                        required
                        value={editingPlan.daily_ai_limit ?? 50}
                        onChange={e => setEditingPlan({ ...editingPlan, daily_ai_limit: Number(e.target.value) })}
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl p-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">Batas Respon AI / Bulan</label>
                      <input
                        type="number"
                        required
                        value={editingPlan.monthly_ai_limit ?? 1500}
                        onChange={e => setEditingPlan({ ...editingPlan, monthly_ai_limit: Number(e.target.value) })}
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl p-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Fitur-fitur (Pisahkan dengan baris baru)
                </label>
                <textarea
                  rows={4}
                  value={editingPlan.features.join('\n')}
                  onChange={e => setEditingPlan({ ...editingPlan, features: e.target.value.split('\n').filter(Boolean) })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="popular_plan"
                  checked={Boolean(editingPlan.popular)}
                  onChange={e => setEditingPlan({ ...editingPlan, popular: e.target.checked })}
                  className="rounded text-emerald-600"
                />
                <label htmlFor="popular_plan" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tandai sebagai Paket Paling Laris (Badge Populer)
                </label>
              </div>
              </div>

              <div className="flex justify-end space-x-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowPlanModal(false);
                    setEditingPlan(null);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={isSavingPlan}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
