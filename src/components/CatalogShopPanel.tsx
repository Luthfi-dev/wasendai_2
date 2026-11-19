import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Store,
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
  Upload,
  Link2,
  Copy,
  Check,
  X,
  Package,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Image as ImageIcon,
  CreditCard,
  QrCode,
  Building2,
  Save,
  Phone
} from 'lucide-react';
import { apiFetch } from '../lib/csrfFetch';
import { CatalogPaymentAccount, CatalogProduct, CatalogSettings } from '../types/whatsapp';
import { ConfirmModal } from './ConfirmModal';
import { PaginationControls } from './PaginationControls';

interface EnrichedCatalogProduct extends CatalogProduct {
  public_image_url?: string;
}

interface EnrichedCatalogSettings extends CatalogSettings {
  public_qris_image_url?: string;
  effective_order_notify_phone?: string;
}

interface CatalogShopPanelProps {
  currentUser: any;
  onNavigateTab?: (tab: string) => void;
}

function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  return `Rp ${safe.toLocaleString('id-ID')}`;
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak dapat diproses browser.'));
      img.onload = () => {
        const maxSide = 960;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxSide) / width));
            width = maxSide;
          } else {
            width = Math.max(1, Math.round((width * maxSide) / height));
            height = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const targetMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const compressed = canvas.toDataURL(targetMime, 0.82);
        resolve(compressed.length < src.length || file.size > 900 * 1024 ? compressed : src);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export const CatalogShopPanel: React.FC<CatalogShopPanelProps> = ({ currentUser, onNavigateTab }) => {
  const [settings, setSettings] = useState<EnrichedCatalogSettings>({
    user_id: currentUser?.id || '',
    enabled: false,
    shop_name: '',
    bank_accounts: [],
    payment_notes: '',
    qris_image_url: '',
    updated_at: ''
  });
  const [products, setProducts] = useState<EnrichedCatalogProduct[]>([]);
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [shopNameDraft, setShopNameDraft] = useState('');

  // Store Payment Settings Draft (Rekening + QRIS)
  const [bankAccountsDraft, setBankAccountsDraft] = useState<CatalogPaymentAccount[]>([]);
  const [paymentNotesDraft, setPaymentNotesDraft] = useState('');
  const [qrisImageUrlDraft, setQrisImageUrlDraft] = useState('');
  const [qrisPublicUrlDraft, setQrisPublicUrlDraft] = useState('');
  const [orderNotifyPhoneDraft, setOrderNotifyPhoneDraft] = useState('');
  const [effectiveOrderNotifyPhone, setEffectiveOrderNotifyPhone] = useState('');
  const [isUploadingQris, setIsUploadingQris] = useState(false);
  const qrisFileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<'produk' | 'pembayaran'>('produk');
  const [productsPage, setProductsPage] = useState(1);
  const productsPageSize = 9;
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setProductsPage(1);
  }, [searchQuery]);

  // Add/Edit Product Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<EnrichedCatalogProduct | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formPublicImageUrl, setFormPublicImageUrl] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [formError, setFormError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete Confirm Modal
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(prev => (prev?.text === text ? null : prev)), 3600);
  };

  const applySettingsState = (nextSettings: EnrichedCatalogSettings, base?: string) => {
    setSettings(nextSettings);
    setShopNameDraft(nextSettings?.shop_name || '');
    setBankAccountsDraft(Array.isArray(nextSettings?.bank_accounts) ? nextSettings.bank_accounts : []);
    setPaymentNotesDraft(nextSettings?.payment_notes || '');
    const rawQris = nextSettings?.qris_image_url || '';
    setQrisImageUrlDraft(rawQris);
    const resolvedBase = base || publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    setQrisPublicUrlDraft(
      nextSettings?.public_qris_image_url ||
        (rawQris.startsWith('/') && resolvedBase ? `${resolvedBase}${rawQris}` : rawQris)
    );
    setOrderNotifyPhoneDraft(nextSettings?.order_notify_phone || '');
    setEffectiveOrderNotifyPhone(nextSettings?.effective_order_notify_phone || '');
  };

  const fetchCatalog = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/catalog');
      const json = await res.json();
      if (json?.success && json.data) {
        const resolvedBase = json.public_base_url || window.location.origin;
        setPublicBaseUrl(resolvedBase);
        applySettingsState(json.data.settings, resolvedBase);
        setProducts(Array.isArray(json.data.products) ? json.data.products : []);
      }
    } catch {
      showToast('error', 'Gagal memuat katalog produk dari server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id) {
      void fetchCatalog();
    }
  }, [currentUser?.id]);

  const handleToggleCatalog = async (nextEnabled: boolean) => {
    const prev = settings.enabled;
    setSettings(s => ({ ...s, enabled: nextEnabled }));
    setIsSavingSettings(true);
    try {
      const res = await apiFetch('/api/catalog/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled })
      });
      const json = await res.json();
      if (json?.success && json.data) {
        setSettings(json.data);
        showToast('success', json.message || (nextEnabled ? 'Katalog diaktifkan untuk Meta AI.' : 'Katalog dinonaktifkan.'));
      } else {
        setSettings(s => ({ ...s, enabled: prev }));
        showToast('error', json?.error || 'Gagal memperbarui status katalog.');
      }
    } catch {
      setSettings(s => ({ ...s, enabled: prev }));
      showToast('error', 'Gagal menghubungi server.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveShopName = async () => {
    setIsSavingSettings(true);
    try {
      const res = await apiFetch('/api/catalog/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_name: shopNameDraft.trim() })
      });
      const json = await res.json();
      if (json?.success && json.data) {
        applySettingsState(json.data);
        showToast('success', 'Nama toko berhasil disimpan.');
      } else {
        showToast('error', json?.error || 'Gagal menyimpan nama toko.');
      }
    } catch {
      showToast('error', 'Gagal menghubungi server.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddBankAccountRow = () => {
    if (bankAccountsDraft.length >= 10) {
      showToast('error', 'Maksimal 10 rekening pembayaran.');
      return;
    }
    setBankAccountsDraft(prev => [
      ...prev,
      {
        id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        bank_name: '',
        account_number: '',
        account_holder: ''
      }
    ]);
  };

  const handleUpdateBankAccountRow = (
    idx: number,
    field: keyof CatalogPaymentAccount,
    value: string
  ) => {
    setBankAccountsDraft(prev =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveBankAccountRow = (idx: number) => {
    setBankAccountsDraft(prev => prev.filter((_, i) => i !== idx));
  };

  const handleQrisFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      showToast('error', 'Pilih file gambar QRIS format PNG, JPG, WEBP, atau GIF.');
      return;
    }

    setIsUploadingQris(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      const res = await apiFetch('/api/catalog/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data: dataUrl, purpose: 'qris' })
      });
      const json = await res.json();
      if (!json?.success || !json.relative_url) {
        showToast('error', json?.error || 'Gagal mengunggah gambar QRIS.');
        return;
      }
      setQrisImageUrlDraft(json.relative_url);
      setQrisPublicUrlDraft(json.public_url || `${window.location.origin}${json.relative_url}`);
      showToast('success', 'Gambar QRIS diunggah. Klik "Simpan Metode Pembayaran" untuk menyimpan permanen.');
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal memproses gambar QRIS.');
    } finally {
      setIsUploadingQris(false);
    }
  };

  const handleSavePaymentSettings = async () => {
    const cleanedAccounts = bankAccountsDraft
      .map(acc => ({
        id: acc.id,
        bank_name: (acc.bank_name || '').trim(),
        account_number: (acc.account_number || '').trim(),
        account_holder: (acc.account_holder || '').trim()
      }))
      .filter(acc => acc.bank_name || acc.account_number || acc.account_holder);

    setIsSavingPayment(true);
    try {
      const res = await apiFetch('/api/catalog/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_accounts: cleanedAccounts,
          payment_notes: paymentNotesDraft.trim(),
          qris_image_url: qrisImageUrlDraft.trim(),
          order_notify_phone: orderNotifyPhoneDraft.trim()
        })
      });
      const json = await res.json();
      if (json?.success && json.data) {
        applySettingsState({
          ...json.data,
          public_qris_image_url: json.public_qris_image_url || json.data.public_qris_image_url
        });
        showToast('success', 'Metode pembayaran & tujuan notifikasi order berhasil disimpan.');
      } else {
        showToast('error', json?.error || 'Gagal menyimpan metode pembayaran.');
      }
    } catch {
      showToast('error', 'Gagal menghubungi server.');
    } finally {
      setIsSavingPayment(false);
    }
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormTitle('');
    setFormPrice('');
    setFormDescription('');
    setFormImageUrl('');
    setFormPublicImageUrl('');
    setFormIsActive(true);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (product: EnrichedCatalogProduct) => {
    setEditingProduct(product);
    setFormTitle(product.title);
    setFormPrice(String(product.price || 0));
    setFormDescription(product.description || '');
    setFormImageUrl(product.image_url || '');
    setFormPublicImageUrl(
      product.public_image_url ||
        (product.image_url?.startsWith('/') && publicBaseUrl ? `${publicBaseUrl}${product.image_url}` : product.image_url || '')
    );
    setFormIsActive(Boolean(product.is_active));
    setFormError('');
    setIsModalOpen(true);
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      setFormError('Pilih file gambar format PNG, JPG, WEBP, atau GIF.');
      return;
    }

    setFormError('');
    setIsUploadingImage(true);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      const res = await apiFetch('/api/catalog/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data: dataUrl })
      });
      const json = await res.json();
      if (!json?.success || !json.relative_url) {
        setFormError(json?.error || 'Gagal mengunggah gambar produk.');
        return;
      }
      setFormImageUrl(json.relative_url);
      setFormPublicImageUrl(json.public_url || `${window.location.origin}${json.relative_url}`);
    } catch (err: any) {
      setFormError(err?.message || 'Gagal memproses file gambar.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = formTitle.trim();
    if (!cleanTitle) {
      setFormError('Judul produk wajib diisi.');
      return;
    }
    const numericPrice = formPrice.trim() === '' ? 0 : Number(formPrice.replace(/[^\d]/g, ''));
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setFormError('Harga produk harus berupa angka valid.');
      return;
    }

    setFormError('');
    setIsSubmittingProduct(true);
    try {
      const payload = {
        title: cleanTitle,
        price: numericPrice,
        description: formDescription.trim(),
        image_url: formImageUrl.trim(),
        is_active: formIsActive
      };
      const url = editingProduct ? `/api/catalog/products/${editingProduct.id}` : '/api/catalog/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json?.success || !json.data) {
        setFormError(json?.error || 'Gagal menyimpan produk.');
        return;
      }

      if (editingProduct) {
        setProducts(prev => prev.map(p => (p.id === json.data.id ? json.data : p)));
        showToast('success', 'Produk berhasil diperbarui.');
      } else {
        setProducts(prev => [json.data, ...prev]);
        showToast('success', 'Produk berhasil ditambahkan ke Mini Shop.');
      }
      setIsModalOpen(false);
    } catch {
      setFormError('Gagal menghubungi server.');
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const handleToggleProductActive = async (product: EnrichedCatalogProduct) => {
    const nextState = !product.is_active;
    setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_active: nextState } : p)));
    try {
      const res = await apiFetch(`/api/catalog/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextState })
      });
      const json = await res.json();
      if (json?.success && json.data) {
        setProducts(prev => prev.map(p => (p.id === json.data.id ? json.data : p)));
      } else {
        setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_active: !nextState } : p)));
        showToast('error', json?.error || 'Gagal mengubah status produk.');
      }
    } catch {
      setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_active: !nextState } : p)));
      showToast('error', 'Gagal menghubungi server.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/catalog/products/${deleteTarget.id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json?.success) {
        setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
        showToast('success', 'Produk berhasil dihapus.');
        setDeleteTarget(null);
      } else {
        showToast('error', json?.error || 'Gagal menghapus produk.');
      }
    } catch {
      showToast('error', 'Gagal menghubungi server.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyLink = (id: string, link: string) => {
    if (!link) return;
    navigator.clipboard?.writeText(link).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 2000);
  };

  const activeProductsCount = useMemo(
    () => products.filter(p => p.is_active).length,
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      p =>
        p.title.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  const effectivePreviewLink =
    formPublicImageUrl ||
    (formImageUrl.startsWith('/') && (publicBaseUrl || typeof window !== 'undefined')
      ? `${publicBaseUrl || window.location.origin}${formImageUrl}`
      : formImageUrl);

  return (
    <div className="space-y-4 mb-8">
      {/* HEADER & MASTER CATALOG CONTROL */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
              <Store className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                Katalog Produk
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                {settings.enabled
                  ? `${activeProductsCount} produk aktif dibaca Meta AI`
                  : `Nonaktif (${products.length} tersimpan)`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="inline-flex items-center cursor-pointer select-none min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={e => handleToggleCatalog(e.target.checked)}
                disabled={isSavingSettings}
                className="sr-only peer"
              />
              <div className="relative w-9 h-5 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              <span className="ml-2 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {settings.enabled ? 'Aktif' : 'Mati'}
              </span>
            </label>

            <button
              type="button"
              onClick={openCreateModal}
              className="px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah</span>
            </button>
          </div>
        </div>

        {/* Shop Name + Quick Test Link */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              maxLength={80}
              value={shopNameDraft}
              onChange={e => setShopNameDraft(e.target.value)}
              placeholder="Nama toko (opsional)..."
              className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 min-h-[40px] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleSaveShopName}
              disabled={isSavingSettings || shopNameDraft.trim() === (settings.shop_name || '')}
              className="px-3.5 min-h-[40px] bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold rounded-xl disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              Simpan
            </button>
          </div>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('rules')}
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0 flex items-center gap-1 self-start sm:self-center"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tes di Balasan AI →</span>
            </button>
          )}
        </div>

        {toast && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}
          >
            {toast.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
        )}
      </div>

      {/* SUB-MENU KATALOG */}
      <div className="flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-fit max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('produk')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'produk'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Produk Katalog ({products.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('pembayaran')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'pembayaran'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Pembayaran &amp; QRIS ({bankAccountsDraft.length})</span>
        </button>
      </div>

      {/* PAYMENT METHODS CARD (REKENING & QRIS UPLOAD) */}
      {activeSubTab === 'pembayaran' && (
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                Metode Pembayaran Toko (Rekening &amp; QRIS)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Otomatis dikirim sistem saat customer checkout: teks untuk rekening atau gambar langsung untuk QRIS.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSavePaymentSettings}
            disabled={isSavingPayment || isUploadingQris}
            className="px-4 min-h-[40px] bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            {isSavingPayment ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Simpan Metode Pembayaran</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left: Bank / E-Wallet Accounts + Free-form Payment Text */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Daftar Rekening Bank / E-Wallet</span>
              </span>
              <button
                type="button"
                onClick={handleAddBankAccountRow}
                className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Rekening</span>
              </button>
            </div>

            {bankAccountsDraft.length === 0 ? (
              <div className="p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-[11px] text-slate-500 dark:text-slate-400">
                Belum ada rekening terstruktur. Klik <strong>Tambah Rekening</strong> atau tulis detail transfer di kolom catatan bebas di bawah.
              </div>
            ) : (
              <div className="space-y-2">
                {bankAccountsDraft.map((acc, idx) => (
                  <div
                    key={acc.id || idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70"
                  >
                    <input
                      type="text"
                      maxLength={40}
                      value={acc.bank_name}
                      onChange={e => handleUpdateBankAccountRow(idx, 'bank_name', e.target.value)}
                      placeholder="Bank / E-Wallet (BCA, Mandiri, DANA)"
                      className="sm:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      maxLength={40}
                      value={acc.account_number}
                      onChange={e => handleUpdateBankAccountRow(idx, 'account_number', e.target.value)}
                      placeholder="No. Rekening / No. HP"
                      className="sm:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    />
                    <div className="sm:col-span-4 flex items-center gap-1.5">
                      <input
                        type="text"
                        maxLength={80}
                        value={acc.account_holder}
                        onChange={e => handleUpdateBankAccountRow(idx, 'account_holder', e.target.value)}
                        placeholder="Atas Nama"
                        className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveBankAccountRow(idx)}
                        className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"
                        title="Hapus Rekening"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Format Teks Rekening / Instruksi Pembayaran Bebas (Opsional)
              </label>
              <textarea
                rows={3}
                maxLength={800}
                value={paymentNotesDraft}
                onChange={e => setPaymentNotesDraft(e.target.value)}
                placeholder="Contoh: Transfer juga bisa ke GoPay 081234567890 a.n. Toko Maju. Setelah transfer mohon kirim bukti pembayaran ke chat ini."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
              />
            </div>

            <div className="p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5 space-y-2">
              <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Nomor WhatsApp Admin / Pemilik Penerima Daftar Order</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={20}
                  value={orderNotifyPhoneDraft}
                  onChange={e => setOrderNotifyPhoneDraft(e.target.value)}
                  placeholder="Contoh: 081234567890 atau 6281234567890 (opsional)"
                  className="flex-1 min-w-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleSavePaymentSettings}
                  disabled={isSavingPayment || isUploadingQris}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl shrink-0 disabled:opacity-50"
                >
                  Simpan
                </button>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Saat pesanan sudah dibayar &amp; diverifikasi AI, rincian order otomatis dikirim oleh <strong>WhatsApp Superadmin</strong> ke nomor ini.
                {effectiveOrderNotifyPhone ? (
                  <> Tujuan aktif saat ini: <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">+{effectiveOrderNotifyPhone}</span>{!orderNotifyPhoneDraft.trim() ? ' (otomatis dari nomor akun)' : ''}.</>
                ) : (
                  <> Jika dikosongkan, sistem otomatis mengirim ke nomor WhatsApp yang terdaftar di akun Anda.</>
                )}
              </p>
            </div>
          </div>

          {/* Right: Upload QRIS Image */}
          <div className="lg:col-span-5 space-y-2.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5 text-indigo-600" />
              <span>Gambar QRIS Pembayaran</span>
            </span>

            <input
              ref={qrisFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleQrisFileSelect}
              className="hidden"
            />

            {qrisImageUrlDraft ? (
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2.5">
                <div className="flex items-start gap-3">
                  <img
                    src={qrisImageUrlDraft}
                    alt="QRIS Toko"
                    className="w-24 h-24 rounded-lg object-contain border border-slate-200 dark:border-slate-800 bg-white shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      QRIS aktif — dikirim langsung oleh sistem
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Saat pelanggan memilih QRIS saat checkout, sistem mengirim gambar ini langsung ke WhatsApp tanpa diteruskan ke Meta AI.
                    </p>
                    {qrisPublicUrlDraft && (
                      <p className="text-[10px] font-mono text-slate-400 truncate">{qrisPublicUrlDraft}</p>
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => qrisFileInputRef.current?.click()}
                        disabled={isUploadingQris}
                        className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Ganti QRIS
                      </button>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          setQrisImageUrlDraft('');
                          setQrisPublicUrlDraft('');
                        }}
                        className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Hapus QRIS
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => qrisFileInputRef.current?.click()}
                  disabled={isUploadingQris}
                  className="w-full py-5 px-4 border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-300 flex flex-col items-center justify-center gap-1.5 transition-colors"
                >
                  {isUploadingQris ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>Mengunggah gambar QRIS...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-6 h-6 text-indigo-600" />
                      <span>Upload Gambar QRIS (PNG/JPG/WEBP)</span>
                      <span className="text-[10px] font-normal text-slate-400">
                        Klik untuk unggah kode QRIS toko Anda
                      </span>
                    </>
                  )}
                </button>
                <input
                  type="url"
                  value={qrisImageUrlDraft}
                  onChange={e => {
                    setQrisImageUrlDraft(e.target.value);
                    setQrisPublicUrlDraft(e.target.value);
                  }}
                  placeholder="Atau tempel URL gambar QRIS https://... (opsional)"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {activeSubTab === 'produk' && (() => {
        const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / productsPageSize));
        const safeProductsPage = Math.min(productsPage, totalProductPages);
        const paginatedProducts = filteredProducts.slice(
          (safeProductsPage - 1) * productsPageSize,
          safeProductsPage * productsPageSize
        );
        return (
          <div className="space-y-4">
            {/* SEARCH BAR (IF >= 4 PRODUCTS) */}
            {products.length >= 4 && (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari produk..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 min-h-[42px] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* PRODUCT LIST / EMPTY STATE */}
            {isLoading ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
                <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400">Memuat katalog...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-10 text-center space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 mx-auto flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {products.length === 0 ? 'Katalog Masih Kosong' : 'Produk Tidak Ditemukan'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {products.length === 0
                      ? 'Tambahkan produk agar Meta AI bisa langsung menjawab pertanyaan pelanggan.'
                      : 'Coba kata kunci lain.'}
                  </p>
                </div>
                {products.length === 0 && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex items-center gap-1.5 px-4 min-h-[42px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Produk</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {paginatedProducts.map(product => {
            const publicLink =
              product.public_image_url ||
              (product.image_url?.startsWith('/') && publicBaseUrl
                ? `${publicBaseUrl}${product.image_url}`
                : product.image_url || '');

            return (
              <div
                key={product.id}
                className={`bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between transition-opacity ${
                  product.is_active ? 'opacity-100' : 'opacity-65'
                }`}
              >
                {/* Mobile: Compact Horizontal Layout | Desktop/Tablet: Vertical Card */}
                <div className="flex sm:block p-3 sm:p-0 gap-3">
                  {/* Image Preview */}
                  <div className="w-20 h-20 sm:w-full sm:h-auto sm:aspect-[16/10] rounded-xl sm:rounded-none bg-slate-100 dark:bg-slate-950 border sm:border-0 sm:border-b border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-400 dark:text-slate-600" />
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="sm:p-4 flex-1 min-w-0 space-y-1 sm:space-y-1.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-1 sm:line-clamp-2">
                      {product.title}
                    </h3>

                    <div className="text-xs sm:text-sm font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {product.price > 0 ? formatRupiah(product.price) : 'Harga Tanya Admin'}
                    </div>

                    {product.description && (
                      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {product.description}
                      </p>
                    )}

                    {publicLink && (
                      <button
                        type="button"
                        onClick={() => handleCopyLink(product.id, publicLink)}
                        className="pt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium"
                      >
                        {copiedId === product.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600 font-semibold">Link disalin</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3 h-3" />
                            <span>Salin link foto</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="px-3 py-2 sm:px-4 sm:py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-950/60">
                  <button
                    type="button"
                    onClick={() => handleToggleProductActive(product)}
                    className={`px-2.5 min-h-[36px] rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      product.is_active
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{product.is_active ? 'Aktif di AI' : 'Tersembunyi'}</span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(product)}
                      className="w-9 h-9 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center transition-colors"
                      title="Edit Produk"
                      aria-label="Edit Produk"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ id: product.id, title: product.title })}
                      className="w-9 h-9 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center transition-colors"
                      title="Hapus Produk"
                      aria-label="Hapus Produk"
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
                  currentPage={safeProductsPage}
                  totalItems={filteredProducts.length}
                  pageSize={productsPageSize}
                  onPageChange={setProductsPage}
                  itemLabel="produk"
                />
              </>
            )}
          </div>
        );
      })()}

      {/* ADD / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-[9999] flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-6 pb-20 sm:pb-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[calc(100dvh-5.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl relative"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-slate-900">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Store className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{editingProduct ? 'Edit Produk Katalog' : 'Tambah Produk Baru'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Tutup"
                className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Judul Produk / Jasa *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Contoh: Kopi Arabika Gayo 250gr"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between mb-1">
                  <span>Harga (Rp) *</span>
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {formPrice.trim() ? formatRupiah(Number(formPrice.replace(/[^\d]/g, '')) || 0) : 'Isi 0 jika harga fleksibel'}
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000000000}
                  step={1}
                  value={formPrice}
                  onChange={e => setFormPrice(e.target.value)}
                  placeholder="Contoh: 85000"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Deskripsi Produk (Varian, Ukuran, Keunggulan)
                </label>
                <textarea
                  rows={3}
                  maxLength={600}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Contoh: Biji kopi single origin Aceh Gayo, tersedia level roast medium & dark. Bisa giling halus/kasar."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              {/* Photo Upload + Generated Link */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Foto Produk (Otomatis Jadi Link untuk Meta AI)
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageFileSelect}
                  className="hidden"
                />

                {formImageUrl ? (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-950 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <img
                        src={formImageUrl}
                        alt="Preview produk"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-800 shrink-0 bg-white"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Foto siap dibagikan sebagai link oleh AI
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          {effectivePreviewLink}
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingImage}
                            className="text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:underline"
                          >
                            Ganti Foto
                          </button>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <button
                            type="button"
                            onClick={() => {
                              setFormImageUrl('');
                              setFormPublicImageUrl('');
                            }}
                            className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                          >
                            Hapus Foto
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="w-full py-3 px-4 border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center space-x-2 transition-colors"
                    >
                      {isUploadingImage ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                          <span>Mengunggah &amp; membuat link foto...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-emerald-600" />
                          <span>Upload Foto Produk (PNG/JPG/WEBP, maks 1,5 MB)</span>
                        </>
                      )}
                    </button>
                    <input
                      type="url"
                      value={formImageUrl}
                      onChange={e => {
                        setFormImageUrl(e.target.value);
                        setFormPublicImageUrl(e.target.value);
                      }}
                      placeholder="Atau tempel link gambar https://... (opsional)"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              <label className="flex items-center space-x-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tampilkan produk ini ke Meta AI saat menjawab pelanggan
                </span>
              </label>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProduct || isUploadingImage}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isSubmittingProduct && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingProduct ? 'Simpan Perubahan' : 'Simpan Produk'}</span>
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Hapus Produk dari Katalog?"
        message={`Produk "${deleteTarget?.title || ''}" akan dihapus permanen dari Mini Shop Anda dan tidak lagi dibaca Meta AI.`}
        type="danger"
        confirmText="Hapus Produk"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !isDeleting && setDeleteTarget(null)}
      />
    </div>
  );
};
