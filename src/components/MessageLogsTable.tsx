import React, { useState, useEffect } from 'react';
import {
  Search,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  MessageCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { WhatsAppMessageLog } from '../types/whatsapp';

interface MessageLogsTableProps {
  logs: WhatsAppMessageLog[];
  onClearLogs: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const MessageLogsTable: React.FC<MessageLogsTableProps> = ({
  logs,
  onClearLogs,
  isLoading
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Sukses' | 'Gagal'>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Broadcast' | 'Incoming' | 'Outgoing'>('All');
  const [selectedLog, setSelectedLog] = useState<WhatsAppMessageLog | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter]);

  const getDaysUntilAutoDelete = (isoStr: string): number => {
    const createdMs = new Date(isoStr).getTime();
    if (isNaN(createdMs)) return 7;
    const expiresMs = createdMs + 7 * 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000));
    return Math.max(1, Math.min(7, diffDays));
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.sender_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.sender_phone.includes(searchTerm) ||
      log.message_body.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.reply_body && log.reply_body.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || log.status === statusFilter;

    const isBroadcastLog =
      log.sender_name.toLowerCase().includes('broadcast') ||
      (log.reply_body && log.reply_body.toLowerCase().includes('broadcast'));

    const matchesType =
      typeFilter === 'All' ||
      (typeFilter === 'Broadcast' && isBroadcastLog) ||
      (typeFilter === 'Incoming' && log.direction === 'incoming') ||
      (typeFilter === 'Outgoing' && log.direction === 'outgoing');

    return matchesSearch && matchesStatus && matchesType;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const paginatedLogs = filteredLogs.slice((validCurrentPage - 1) * pageSize, validCurrentPage * pageSize);

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: 'short'
      }).format(d);
    } catch {
      return isoStr;
    }
  };

  const formatShortTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      if (sameDay) {
        return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(d);
      }
      return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(d);
    } catch {
      return isoStr;
    }
  };

  return (
    <div id="message-logs-container" className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden mb-6 transition-colors duration-200">
      {/* Header Controls */}
      <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              Riwayat Pesan
            </h2>
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
              ({filteredLogs.length})
            </span>
          </div>
          <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Log pesan masuk, balasan otomatis, dan broadcast (otomatis terhapus setiap 7 hari).
          </p>
        </div>

        <button
          id="clear-logs-btn"
          type="button"
          onClick={() => setShowConfirmClear(true)}
          disabled={logs.length === 0}
          className="px-3 py-2 text-xs font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-40 min-h-[40px] shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus</span>
        </button>
      </div>

      {/* Search & Single-Row Horizontal Filter Chips */}
      <div className="p-3.5 sm:px-5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2.5">
        <div className="flex flex-col md:flex-row gap-2.5 md:items-center md:justify-between">
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="search-message-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama, nomor, atau isi chat..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 pl-9 pr-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-400 min-h-[40px]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {(
              [
                { id: 'All', label: 'Semua' },
                { id: 'Incoming', label: 'Masuk' },
                { id: 'Outgoing', label: 'Keluar' },
                { id: 'Broadcast', label: 'Broadcast' }
              ] as const
            ).map(tp => (
              <button
                key={tp.id}
                type="button"
                onClick={() => setTypeFilter(tp.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                  typeFilter === tp.id
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {tp.label}
              </button>
            ))}

            <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />

            {(['All', 'Sukses', 'Gagal'] as const).map((st) => (
              <button
                key={st}
                id={`filter-status-${st.toLowerCase()}`}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                  statusFilter === st
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {st === 'All' ? 'Semua Status' : st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Native Tap List Rows */}
      <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
        {isLoading ? (
          <div className="text-center py-10 text-xs text-slate-500">
            <div className="flex justify-center items-center gap-2">
              <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <span>Memuat pesan...</span>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-500 dark:text-slate-400">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Belum ada riwayat pesan</p>
            <p className="text-xs mt-1">Pesan masuk dan balasan otomatis akan tampil di sini.</p>
          </div>
        ) : (
          paginatedLogs.map((log) => (
            <button
              key={log.id}
              type="button"
              onClick={() => setSelectedLog(log)}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 active:bg-slate-100 dark:active:bg-slate-800 transition-colors min-h-[68px]"
            >
              {/* Avatar + Status Dot */}
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/20 flex items-center justify-center font-bold text-sm">
                  {log.sender_name.charAt(0).toUpperCase()}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                    log.status === 'Sukses' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
              </div>

              {/* Main Content */}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                    {log.sender_name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                    {formatShortTime(log.created_at)}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                  {log.message_body}
                </p>

                {log.reply_body && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 truncate flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3 shrink-0" />
                    <span className="truncate">{log.reply_body}</span>
                  </p>
                )}
              </div>

              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
            </button>
          ))
        )}
      </div>

      {/* Desktop Messages Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-800 tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Waktu</th>
              <th className="py-3 px-4">Pengirim</th>
              <th className="py-3 px-4">Nomor WA</th>
              <th className="py-3 px-4">Pesan Masuk</th>
              <th className="py-3 px-4">Balasan Bot</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-500">
                  <div className="flex justify-center items-center gap-2">
                    <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <span>Memuat data pesan...</span>
                  </div>
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Belum ada riwayat pesan</p>
                  <p className="text-xs mt-1">Pesan masuk dan balasan otomatis akan tampil di sini.</p>
                </td>
              </tr>
            ) : (
              paginatedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono text-[11px] tabular-nums">
                    {formatDate(log.created_at)}
                  </td>

                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                        {log.sender_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate max-w-[130px]">{log.sender_name}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">
                    +{log.sender_phone}
                  </td>

                  <td className="py-3 px-4 max-w-xs">
                    <div className="flex items-start gap-1.5">
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <p className="truncate text-slate-900 dark:text-slate-100">{log.message_body}</p>
                    </div>
                  </td>

                  <td className="py-3 px-4 max-w-xs">
                    {log.reply_body ? (
                      <div className="flex items-start gap-1.5">
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <p className="truncate text-slate-600 dark:text-slate-400">{log.reply_body}</p>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    {log.status === 'Sukses' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Sukses
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400" title={log.error_detail}>
                        <XCircle className="w-3 h-3 mr-1" /> Gagal
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <button
                      id={`view-log-detail-${log.id}`}
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="px-2.5 py-1.5 text-emerald-700 dark:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 rounded-lg font-semibold text-[11px] transition-colors inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Detail</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-950/60 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
        <span className="tabular-nums text-[11px]">
          {filteredLogs.length === 0 ? '0 pesan' : `${(validCurrentPage - 1) * pageSize + 1}–${Math.min(validCurrentPage * pageSize, filteredLogs.length)} dari ${filteredLogs.length}`}
        </span>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={validCurrentPage === 1}
              className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center justify-center"
              aria-label="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
              {validCurrentPage}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage === totalPages}
              className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center justify-center"
              aria-label="Halaman Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* MODAL / BOTTOM SHEET DETAIL PESAN */}
      {selectedLog && (
        <div
          onClick={() => setSelectedLog(null)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl max-w-lg w-full shadow-2xl text-slate-900 dark:text-slate-100 max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-900">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  {selectedLog.sender_name}
                </h3>
                <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{selectedLog.sender_phone} · {formatDate(selectedLog.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                aria-label="Tutup"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold shrink-0"
              >
                ×
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3 text-xs">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Pesan Masuk</span>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                  {selectedLog.message_body}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Balasan Bot</span>
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200/70 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 whitespace-pre-wrap break-words leading-relaxed">
                  {selectedLog.reply_body || '(Tidak ada balasan)'}
                </div>
              </div>

              {selectedLog.error_detail && (
                <div>
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 block mb-1">Detail Error</span>
                  <div className="bg-rose-50 dark:bg-rose-500/10 p-3 rounded-xl border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 font-mono text-[11px] break-words">
                    {selectedLog.error_detail}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Auto-hapus {getDaysUntilAutoDelete(selectedLog.created_at)} hari lagi
                </span>
                <span className="font-mono truncate max-w-[160px]">{selectedLog.wam_id || selectedLog.id}</span>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="w-full min-h-[44px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM CLEAR LOGS MODAL */}
      {showConfirmClear && (
        <div
          onClick={() => setShowConfirmClear(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl text-slate-900 dark:text-slate-100 space-y-4"
          >
            <h3 className="text-base font-bold">Hapus Semua Riwayat Log?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Seluruh riwayat log pesan akan dihapus permanen dan tidak bisa dikembalikan.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmClear(false)}
                className="px-4 min-h-[40px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearLogs();
                  setShowConfirmClear(false);
                }}
                className="px-4 min-h-[40px] bg-rose-600 text-white hover:bg-rose-500 text-xs font-bold rounded-xl"
              >
                Hapus Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
