import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/csrfFetch';
import { Database, Download, Copy, Check, FileCode, Server, Wifi, WifiOff, RefreshCw, Send, CheckCircle2, AlertCircle, ArrowUpRight, Cloud, ShieldCheck } from 'lucide-react';
import { MysqlConnectionStatus } from '../types/whatsapp';

export const SqlSchemaViewer: React.FC = () => {
  // Cloud DB Credentials State (loaded from server config or entered by Superadmin)
  const [host, setHost] = useState('');
  const [port, setPort] = useState(3306);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);
  const [database, setDatabase] = useState('');
  const [useSsl, setUseSsl] = useState(false);
  const [isEnvManaged, setIsEnvManaged] = useState(false);

  // Connection & Sync Status
  const [connectionStatus, setConnectionStatus] = useState<MysqlConnectionStatus | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);

  // SQL Script state
  const [exportedSql, setExportedSql] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isLoadingExport, setIsLoadingExport] = useState(false);

  // Env update PIN modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [envPinInput, setEnvPinInput] = useState('');
  const [pinErrorMsg, setPinErrorMsg] = useState('');
  const [envUpdateSuccess, setEnvUpdateSuccess] = useState<string | null>(null);
  const [envUpdateError, setEnvUpdateError] = useState<string | null>(null);

  const handleOpenEnvUpdate = () => {
    setEnvPinInput('');
    setPinErrorMsg('');
    setEnvUpdateError(null);
    setShowPinModal(true);
  };

  const handleVerifyPinAndCommitEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinErrorMsg('');

    try {
      const unlockRes = await apiFetch('/api/auth/master-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: envPinInput.trim() })
      });
      const unlockData = await unlockRes.json();
      if (!unlockRes.ok || !unlockData.success) {
        setPinErrorMsg(unlockData.error || 'PIN Master Superadmin salah!');
        return;
      }

      setShowPinModal(false);
      const res = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mysql_host: host,
          mysql_port: port,
          mysql_user: user,
          mysql_password: password,
          mysql_database: database
        })
      });
      const data = await res.json();
      if (data.success) {
        setEnvUpdateSuccess('✓ Konfigurasi database berhasil disimpan ke server!');
        setTimeout(() => setEnvUpdateSuccess(null), 6000);
      } else {
        setEnvUpdateError(data.error || 'Gagal memperbarui konfigurasi server.');
      }
    } catch (err: any) {
      setEnvUpdateError(err?.message || 'Gagal menghubungi server.');
    }
  };

  // Load current DB config and test connection if configured
  useEffect(() => {
    apiFetch('/api/config')
      .then(r => r.json())
      .then(res => {
        if (res.success && res.fullConfig) {
          const h = res.fullConfig.mysql_host || '';
          const p = res.fullConfig.mysql_port || 3306;
          const u = res.fullConfig.mysql_user || '';
          const db = res.fullConfig.mysql_database || '';
          const hasPass = Boolean(res.fullConfig.mysql_password_set);
          const sslEnabled = Boolean(res.fullConfig.mysql_ssl);
          const envManaged = Boolean(res.fullConfig.mysql_env_managed);

          setHost(h);
          setPort(p);
          setUser(u);
          setPassword('');
          setPasswordSet(hasPass);
          setDatabase(db);
          setUseSsl(sslEnabled);
          setIsEnvManaged(envManaged);

          if (h && db) {
            handleTestWithCreds(h, p, u, '', db, sslEnabled);
          } else {
            setConnectionStatus({
              connected: false,
              host: h,
              port: p,
              database: db,
              error_code: 'MISSING_CONFIG',
              error_detail: 'Host, User, atau Nama Database MySQL belum diisi.',
              hint: 'Isi form Host, Port, Nama Database, User, dan Password DB Cloud Anda lalu klik "Tes Hubungkan".',
              message: 'Kredensial MySQL Cloud DB belum dikonfigurasi. Aplikasi berjalan dengan penyimpanan lokal terenkripsi.',
              checked_at: new Date().toISOString()
            });
          }
        }
      })
      .catch(() => {
        setConnectionStatus({
          connected: false,
          error_code: 'CONFIG_FETCH_ERROR',
          error_detail: 'Gagal memuat konfigurasi Cloud DB dari endpoint /api/config.',
          hint: 'Pastikan sesi login Superadmin aktif dan server backend berjalan normal.',
          message: 'Tidak dapat memuat status konfigurasi Cloud DB.',
          checked_at: new Date().toISOString()
        });
      });
  }, []);

  const handleTestWithCreds = async (
    h: string,
    p: number,
    u: string,
    pass: string,
    db: string,
    sslOverride?: boolean
  ) => {
    setIsTesting(true);
    try {
      const payload: Record<string, any> = {
        host: h,
        port: p,
        user: u,
        database: db
      };
      if (pass !== '') {
        payload.password = pass;
      }
      if (sslOverride !== undefined) {
        payload.ssl = sslOverride;
      }

      const res = await apiFetch('/api/mysql/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setConnectionStatus(
        data.data || {
          connected: Boolean(res.ok && data.success),
          host: h,
          port: p,
          database: db,
          error_code: res.ok ? undefined : `HTTP_${res.status}`,
          error_detail: data.error || data.message || 'Server mengembalikan kegagalan tanpa detail tambahan.',
          hint: 'Periksa kembali Host, Port, User, Password, dan firewall/IP Whitelist server database Anda.',
          message: data.error || data.message || 'Gagal menguji koneksi database.',
          checked_at: new Date().toISOString()
        }
      );
    } catch (err: any) {
      setConnectionStatus({
        connected: false,
        host: h,
        port: p,
        database: db,
        error_code: 'NETWORK_ERROR',
        error_detail: err?.message || 'Tidak dapat menghubungi endpoint /api/mysql/test.',
        hint: 'Periksa koneksi internet Anda atau pastikan server backend Japriin aktif.',
        message: err?.message || 'Gagal menghubungi server untuk uji koneksi MySQL.',
        checked_at: new Date().toISOString()
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 1. Test live Cloud Database connection
  const handleTestConnection = async () => {
    await handleTestWithCreds(host, port, user, password, database, useSsl);
  };

  // 2. Push structure and sync data to online Cloud DB
  const handleSyncPush = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const payload: Record<string, any> = {
        host,
        port,
        user,
        database,
        ssl: useSsl
      };
      if (password !== '') {
        payload.password = password;
      }
      const res = await apiFetch('/api/mysql/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setSyncResult(
        data.logs
          ? data
          : {
              success: Boolean(data.success),
              message: data.error || data.message || `HTTP ${res.status}`,
              logs: [`✗ ${data.error || data.message || `Sinkronisasi gagal (HTTP ${res.status})`}`]
            }
      );
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: 'Gagal melakukan sinkronisasi data ke Cloud DB.',
        logs: [`✗ Network/Server Error: ${err?.message || 'Unknown error'}`]
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // 3. Export SQL Script
  const handleExportLiveSql = async () => {
    setIsLoadingExport(true);
    try {
      const res = await apiFetch('/api/export-sql');
      const text = await res.text();
      setExportedSql(text);
    } catch (err) {
      setExportedSql('-- Gagal mengambil cadangan SQL dari server');
    } finally {
      setIsLoadingExport(false);
    }
  };

  const handleDownloadSqlFile = () => {
    const textToDownload = exportedSql || `-- JAPRIIN WA GATEWAY CLOUD DATABASE BACKUP
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id VARCHAR(64) PRIMARY KEY,
    wam_id VARCHAR(128),
    sender_phone VARCHAR(32) NOT NULL,
    sender_name VARCHAR(128) NOT NULL,
    message_body TEXT NOT NULL,
    direction VARCHAR(16) DEFAULT 'incoming',
    status VARCHAR(32) NOT NULL,
    reply_body TEXT,
    error_detail TEXT,
    ai_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_cloud_database_${Date.now()}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(exportedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="sql-schema-container" className="space-y-6 mb-8 transition-colors duration-200">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border border-teal-500/30 rounded-3xl p-6 sm:p-7 text-white shadow-xl space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-3 bg-teal-500/20 text-teal-300 rounded-2xl border border-teal-500/30 shrink-0">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-black text-teal-200">Koneksi &amp; Sinkronisasi Database Cloud Online</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/30 text-teal-200 border border-teal-400/40">
                  Cloud DB
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Seluruh data pengguna, sesi WhatsApp, aturan bot, SMTP, dan konfigurasi tersimpan 100% secara real-time langsung ke Database MySQL Online tanpa file penyimpanan lokal (database.json).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleDownloadSqlFile}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition-all flex items-center space-x-2 shadow-md min-h-[40px]"
            >
              <Download className="w-4 h-4" />
              <span>Download data.sql</span>
            </button>
          </div>
        </div>
      </div>

      {/* CLOUD DB CONNECTION & PUSH CARD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Pengaturan Database Cloud Online
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Koneksikan server database online Anda (cPanel, VPS, Server Cloud, atau Hosting Pribadi) melalui variabel environment server / Secrets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {isEnvManaged && (
              <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 border bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Server Env / Secrets Aktif</span>
              </span>
            )}
            {connectionStatus && (
              <span className={`px-3 py-1 rounded-full text-xs font-black flex items-center space-x-1.5 border ${
                connectionStatus.connected
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                  : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/30'
              }`}>
                {connectionStatus.connected ? <Wifi className="w-3.5 h-3.5 text-emerald-600" /> : <WifiOff className="w-3.5 h-3.5 text-rose-600" />}
                <span>{connectionStatus.connected ? 'Cloud DB Online' : 'Koneksi Terputus'}</span>
              </span>
            )}
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Host Server Cloud DB</label>
            <input
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="localhost atau 103.xxx.xxx.xxx"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Port</label>
            <input
              type="number"
              value={port}
              onChange={e => setPort(Number(e.target.value))}
              placeholder="3306"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Nama Database</label>
            <input
              type="text"
              value={database}
              onChange={e => setDatabase(e.target.value)}
              placeholder="database_bisnis"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">User Akun DB</label>
            <input
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              placeholder="root atau user_db"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Password DB</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={passwordSet ? '•••••••• (Tersimpan, kosongkan jika tetap)' : 'Password database'}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="inline-flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useSsl}
                onChange={e => setUseSsl(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Wajibkan SSL/TLS (Aiven / TiDB / Managed Cloud)</span>
            </label>

            <div className="flex items-end gap-2">
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-all flex items-center justify-center space-x-1.5 min-h-[40px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-600' : ''}`} />
                <span>{isTesting ? 'Menguji...' : 'Tes Hubungkan'}</span>
              </button>

              <button
                onClick={handleSyncPush}
                disabled={isSyncing}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5 min-h-[40px]"
              >
                <ArrowUpRight className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : ''}`} />
                <span>{isSyncing ? 'Mendorong...' : 'Push &amp; Sinkronkan'}</span>
              </button>
            </div>

            <button
              onClick={handleOpenEnvUpdate}
              className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 min-h-[40px]"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300" />
              <span>Perbarui Env (Update Environment) ⚡</span>
            </button>
          </div>
        </div>

        {/* Success / Error Env Update Banner */}
        {envUpdateSuccess && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs font-black flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{envUpdateSuccess}</span>
          </div>
        )}
        {envUpdateError && (
          <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 rounded-2xl text-xs font-black flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{envUpdateError}</span>
          </div>
        )}

        {/* PIN Verification Modal for Env Update */}
        {showPinModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[99999] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl text-slate-900 dark:text-slate-100 space-y-4 animate-in fade-in zoom-in-95">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl mx-auto flex items-center justify-center font-black">
                  🔒
                </div>
                <h3 className="text-base font-black">Verifikasi PIN Master</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Masukkan PIN Master Superadmin untuk menyimpan kredensial server database.
                </p>
              </div>

              <form onSubmit={handleVerifyPinAndCommitEnv} className="space-y-4">
                <div>
                  <input
                    type="password"
                    maxLength={16}
                    value={envPinInput}
                    onChange={(e) => {
                      setEnvPinInput(e.target.value);
                      setPinErrorMsg('');
                    }}
                    placeholder="Masukkan PIN Master Superadmin"
                    className="w-full text-center tracking-widest font-mono text-base bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-white"
                    autoFocus
                  />
                  {pinErrorMsg && (
                    <p className="text-[11px] text-rose-600 font-bold mt-1 text-center">
                      {pinErrorMsg}
                    </p>
                  )}
                </div>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowPinModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-md"
                  >
                    Konfirmasi PIN
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Live Status Message Box */}
        {connectionStatus && (
          <div className={`p-4 rounded-2xl text-xs font-bold border flex items-start space-x-3 ${
            connectionStatus.connected
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-900 dark:text-rose-300'
          }`}>
            {connectionStatus.connected ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black text-sm">
                  {connectionStatus.connected ? 'Koneksi Berhasil Terhubung!' : 'Koneksi Database Cloud Gagal Terhubung'}
                </span>
                {connectionStatus.error_code && !connectionStatus.connected && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 font-mono text-[10px] font-black text-rose-700 dark:text-rose-300">
                    {connectionStatus.error_code}
                  </span>
                )}
              </div>

              <p className="font-normal text-xs leading-relaxed">
                {connectionStatus.message}
              </p>

              {(connectionStatus.host || connectionStatus.database) && (
                <div className="text-[11px] font-mono opacity-85 bg-white/70 dark:bg-slate-950/60 px-3 py-1.5 rounded-xl border border-current/15">
                  Target: {connectionStatus.host || '(kosong)'}:{connectionStatus.port || 3306} / DB: {connectionStatus.database || '(kosong)'}
                  {connectionStatus.ssl_enabled ? ' (SSL Aktif)' : ''}
                </div>
              )}

              {!connectionStatus.connected && connectionStatus.error_detail && (
                <div className="text-[11px] font-mono bg-white dark:bg-slate-950 text-rose-800 dark:text-rose-300 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800/50 break-words">
                  Detail Teknis: {connectionStatus.error_detail}
                </div>
              )}

              {!connectionStatus.connected && connectionStatus.hint && (
                <div className="text-[11px] font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800/50 leading-relaxed">
                  <strong>Solusi / Keterangan Lanjut:</strong> {connectionStatus.hint}
                </div>
              )}

              {connectionStatus.version && (
                <span className="text-[11px] font-mono opacity-80 block">Versi Server: {connectionStatus.version}</span>
              )}
            </div>
          </div>
        )}

        {/* Sync Push Logs Viewer */}
        {syncResult && (
          <div className="bg-slate-950 text-slate-200 p-4 rounded-2xl font-mono text-xs space-y-2 border border-slate-800">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-emerald-400 font-bold">Laporan Eksekusi Sinkronisasi Cloud DB:</span>
              <span className="text-[10px] text-slate-400">{new Date().toLocaleTimeString('id-ID')}</span>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
              {syncResult.logs?.map((l: string, idx: number) => (
                <div key={idx} className="text-[11px] text-slate-300">{l}</div>
              ))}
            </div>
            {syncResult.tables_created && (
              <div className="pt-2 text-[11px] text-emerald-400">
                ✓ Tabel DDL berhasil dibuat/diperbarui: {syncResult.tables_created.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SQL SCHEMA & LIVE EXPORT VIEWER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Skema Struktur Tabel &amp; Cadangan Data
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Anda juga dapat menyalin atau mengekspor script database ini secara manual untuk di-import kapan saja.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportLiveSql}
              disabled={isLoadingExport}
              className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-colors min-h-[36px]"
            >
              {isLoadingExport ? 'Mengekspor...' : 'Generate Live SQL'}
            </button>
            {exportedSql && (
              <button
                onClick={handleCopySql}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 min-h-[36px]"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin' : 'Salin Data'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-slate-950 text-slate-200 p-4 rounded-2xl border border-slate-800 font-mono text-[11px] overflow-x-auto max-h-64 leading-relaxed">
          <pre>{exportedSql || `-- Klik tombol "Generate Live SQL" untuk melihat seluruh struktur tabel dan data terkini yang siap dicadangkan.`}</pre>
        </div>
      </div>
    </div>
  );
};
