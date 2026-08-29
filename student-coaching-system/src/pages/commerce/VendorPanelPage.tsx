/**
 * Satıcı (vendor_admin) paneli
 * Sekmeler: Genel Bakış | Kitaplarım | Tekliflerim | Siparişlerim | Hakedişlerim
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronRight,
  Image,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  Truck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  cvAcceptOrder,
  cvCreateBook,
  cvCreateOffer,
  cvDeleteOrder,
  cvGetStats,
  cvListBooks,
  cvListOffers,
  cvListOrders,
  cvListPayouts,
  cvMarkPreparing,
  cvShipOrder,
  cvSubmitOffer,
  cvUpdateOffer,
  cvUpdateOrder,
  cvUpdateBook,
  type VendorStats,
} from '../../lib/commerceVendorApi';
import { apiFetch } from '../../lib/session';
import { clearActingVendor, getActingVendor, setActingVendor, type ActingVendor } from '../../lib/commerceActingVendor';
import { caListVendors } from '../../lib/commerceAdminApi';
import type {
  CommerceBook,
  CommerceVendorOffer,
  CommerceVendorOrder,
  CommerceVendorPayout,
} from '../../types/commerce.types';
import { formatCommerceTry, COMMERCE_OFFER_STATUS_LABELS } from '../../types/commerce.types';
import { useAuth } from '../../context/AuthContext';

type Tab = 'genel' | 'kitaplarim' | 'tekliflerim' | 'siparislerim' | 'hakedislerim';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'genel', label: 'Genel Bakış', icon: <Store className="w-4 h-4" /> },
  { key: 'kitaplarim', label: 'Kitaplarım', icon: <BookOpen className="w-4 h-4" /> },
  { key: 'tekliflerim', label: 'Tekliflerim', icon: <Package className="w-4 h-4" /> },
  { key: 'siparislerim', label: 'Siparişlerim', icon: <ShoppingBag className="w-4 h-4" /> },
  { key: 'hakedislerim', label: 'Hakedişlerim', icon: <Wallet className="w-4 h-4" /> },
];

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={`rounded-xl p-4 border ${color ?? 'bg-gray-50 border-gray-200'}`}>
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function OfferStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: 'bg-green-100 text-green-700',
    pending_approval: 'bg-yellow-100 text-yellow-700',
    draft: 'bg-gray-100 text-gray-500',
    rejected: 'bg-red-100 text-red-700',
    inactive: 'bg-gray-100 text-gray-400',
    correction_requested: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? 'bg-gray-100'}`}>
      {COMMERCE_OFFER_STATUS_LABELS[status as keyof typeof COMMERCE_OFFER_STATUS_LABELS] ?? status}
    </span>
  );
}

// ── Genel Bakış ────────────────────────────────────────────────────────
function GenelBakis() {
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cvGetStats()
      .then((r) => setStats(r.stats))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Toplam Sipariş" value={stats.total_orders} />
        <StatCard label="Yeni Sipariş" value={stats.pending_orders}
          color={stats.pending_orders > 0 ? 'bg-yellow-50 border-yellow-200' : undefined} />
        <StatCard label="Aktif Teklif" value={stats.active_offers}
          color="bg-green-50 border-green-200" />
        <StatCard label="Onay Bekleyen" value={stats.pending_approval}
          color={stats.pending_approval > 0 ? 'bg-orange-50 border-orange-200' : undefined} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Düşük Stok" value={stats.low_stock}
          color={stats.low_stock > 0 ? 'bg-red-50 border-red-200' : undefined} />
        <StatCard label="Toplam Net Kazanç" value={formatCommerceTry(stats.total_net_kurus)}
          color="bg-indigo-50 border-indigo-200" />
        <StatCard label="Bekleyen Hakediş" value={formatCommerceTry(stats.pending_payout_kurus)}
          color="bg-purple-50 border-purple-200" />
      </div>

      {stats.pending_orders > 0 && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-yellow-800 text-sm">{stats.pending_orders} yeni sipariş onayınızı bekliyor</div>
            <div className="text-xs text-yellow-600 mt-0.5">Siparişlerim sekmesinden inceleyebilirsiniz.</div>
          </div>
        </div>
      )}
      {stats.low_stock > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-red-700 text-sm">{stats.low_stock} teklif stok eşiğinin altında</div>
            <div className="text-xs text-red-500 mt-0.5">Tekliflerim sekmesinden stok güncelleyebilirsiniz.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Kapak görseli yükleme yardımcısı
// ─────────────────────────────────────────────────────────────────────
async function uploadBookCover(file: File, bookId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await apiFetch('/api/commerce-upload', {
          method: 'POST',
          body: JSON.stringify({
            op: 'book_cover',
            file_base64: reader.result as string,
            mime_type: file.type,
            book_id: bookId,
            save_to_db: true,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? 'upload_failed');
        resolve(data.url as string);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────
// Teklif oluşturma / düzenleme modalı
// ─────────────────────────────────────────────────────────────────────
type OfferModalProps = {
  offer: CommerceVendorOffer | null; // null = yeni teklif
  onClose: () => void;
  onSave: () => void;
};

type BookMode = 'search' | 'new';

const SUBJECTS = ['Matematik', 'Türkçe', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce',
  'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya', 'Din Kültürü', 'Diğer'];
const CLASS_LEVELS = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'LGS', 'TYT', 'AYT', 'YOS'];

function OfferModal({ offer, onClose, onSave }: OfferModalProps) {
  const isEdit = Boolean(offer);

  // Fiyat alanları
  const [priceLira, setPriceLira] = useState(offer ? String(offer.price_kurus / 100) : '');
  const [discountLira, setDiscountLira] = useState(
    offer?.compare_at_price_kurus ? String(offer.compare_at_price_kurus / 100) : ''
  );
  const [stock, setStock] = useState(String(offer?.stock_quantity ?? '0'));
  const [lowStock, setLowStock] = useState(String(offer?.low_stock_threshold ?? '5'));
  const [shippingDays, setShippingDays] = useState(String(offer?.shipping_days ?? '3'));

  // Kitap seçimi
  const [bookMode, setBookMode] = useState<BookMode>('search');
  const [bookSearch, setBookSearch] = useState('');
  const [bookResults, setBookResults] = useState<(CommerceBook & { my_offer: CommerceVendorOffer | null })[]>([]);
  const [bookSearching, setBookSearching] = useState(false);
  const [selectedBook, setSelectedBook] = useState<{ id: string; title: string; isbn: string | null; cover_image_url: string | null; description?: string | null } | null>(
    offer?.book ? (offer.book as { id: string; title: string; isbn: string | null; cover_image_url: string | null; description?: string | null }) : null
  );

  // Yeni kitap formu
  const [newBook, setNewBook] = useState({ isbn: '', title: '', subtitle: '', author: '', publisher: '', subject: '', class_levels: [] as string[], description: '' });
  const [createdBookId, setCreatedBookId] = useState<string | null>(null);

  // Kapak görseli
  const [coverPreview, setCoverPreview] = useState<string | null>(selectedBook?.cover_image_url ?? null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editDescription, setEditDescription] = useState(
    String((offer?.book as { description?: string | null } | undefined)?.description ?? '')
  );

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Kitap arama (debounce)
  useEffect(() => {
    if (bookMode !== 'search' || bookSearch.length < 2) { setBookResults([]); return; }
    const t = setTimeout(async () => {
      setBookSearching(true);
      try {
        const r = await cvListBooks({ search: bookSearch, limit: 20 });
        setBookResults(r.books);
      } catch { /* ignore */ }
      finally { setBookSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [bookSearch, bookMode]);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      toast.error('Yalnızca JPEG, PNG veya WebP yükleyebilirsiniz');
      return;
    }
    if (f.size > 10 * 1024 * 1024) { toast.error('Dosya 10 MB sınırını aşıyor'); return; }
    setCoverFile(f);
    const reader = new FileReader();
    reader.onload = () => setCoverPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const price = parseFloat(priceLira);
    if (isNaN(price) || price <= 0) e.price = 'Geçerli bir fiyat girin (₺)';
    const disc = discountLira ? parseFloat(discountLira) : null;
    if (disc !== null && disc <= price) e.discount = 'İndirimli fiyat, normal fiyattan yüksek olmalı';
    if (parseInt(stock) < 0) e.stock = 'Stok 0 veya üzeri olmalı';
    if (parseInt(shippingDays) < 1) e.shippingDays = 'Kargo süresi en az 1 gün olmalı';
    if (!isEdit) {
      if (bookMode === 'search' && !selectedBook) e.book = 'Bir kitap seçin';
      if (bookMode === 'new' && !newBook.title.trim()) e.newTitle = 'Kitap başlığı zorunlu';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const priceKurus = Math.round(parseFloat(priceLira) * 100);
      const discKurus = discountLira ? Math.round(parseFloat(discountLira) * 100) : null;

      if (isEdit && offer) {
        const bookId = (offer.book as { id?: string } | undefined)?.id;
        if (bookId) {
          await cvUpdateBook(bookId, { description: editDescription.trim() || null });
          if (coverFile) {
            setUploading(true);
            try {
              await uploadBookCover(coverFile, bookId);
            } catch (e: unknown) {
              toast.error('Kapak yüklenemedi: ' + (e as Error).message);
            } finally {
              setUploading(false);
            }
          }
        }
        await cvUpdateOffer(offer.id, {
          price_kurus: priceKurus,
          compare_at_price_kurus: discKurus ?? undefined,
          stock_quantity: parseInt(stock),
          low_stock_threshold: parseInt(lowStock),
          shipping_days: parseInt(shippingDays),
        });
        toast.success('Teklif güncellendi');
      } else {
        // Yeni teklif
        let bookId = selectedBook?.id ?? createdBookId ?? null;

        // Yeni kitap oluştur
        if (bookMode === 'new' && !bookId) {
          const bookRes = await cvCreateBook({
            title: newBook.title.trim(),
            subtitle: newBook.subtitle.trim() || undefined,
            isbn: newBook.isbn.trim() || undefined,
            author: newBook.author.trim() || undefined,
            publisher: newBook.publisher.trim() || undefined,
            subject: newBook.subject || undefined,
            class_levels: newBook.class_levels,
            description: newBook.description.trim() || undefined,
          });
          bookId = bookRes.book.id;
          setCreatedBookId(bookId);

          // Kapak yükle (yeni kitap için)
          if (coverFile && bookId) {
            setUploading(true);
            try { await uploadBookCover(coverFile, bookId); }
            catch (e: unknown) { toast.error('Kapak yüklenemedi: ' + (e as Error).message); }
            finally { setUploading(false); }
          }
        }

        if (!bookId) { toast.error('Kitap seçilmedi'); setSaving(false); return; }

        const offerRes = await cvCreateOffer({
          book_id: bookId,
          price_kurus: priceKurus,
          compare_at_price_kurus: discKurus ?? undefined,
          stock_quantity: parseInt(stock),
          shipping_days: parseInt(shippingDays),
        });

        // Kapak yükle (mevcut kitap seçilmişse)
        if (coverFile && bookMode === 'search' && selectedBook) {
          setUploading(true);
          try { await uploadBookCover(coverFile, selectedBook.id); }
          catch (e: unknown) { toast.error('Kapak yüklenemedi: ' + (e as Error).message); }
          finally { setUploading(false); }
        }

        toast.success('Teklif oluşturuldu — "Onaya Gönder" ile gönderin');
      }

      onSave();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const discountPct = (() => {
    const p = parseFloat(priceLira);
    const d = parseFloat(discountLira);
    if (!isNaN(p) && !isNaN(d) && d > p && p > 0) return Math.round((1 - p / d) * 100);
    return null;
  })();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-4">
        {/* Başlık */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold">{isEdit ? 'Teklifi Düzenle' : 'Yeni Kitap Teklifi'}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ── KİTAP SEÇİMİ (sadece yeni teklif) ── */}
          {!isEdit && (
            <div>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setBookMode('search')}
                  className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${bookMode === 'search' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  Katalogdan Seç
                </button>
                <button
                  onClick={() => setBookMode('new')}
                  className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${bookMode === 'new' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  Yeni Kitap Ekle
                </button>
              </div>

              {bookMode === 'search' && (
                <div>
                  {selectedBook ? (
                    <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                      {selectedBook.cover_image_url ? (
                        <img src={selectedBook.cover_image_url} alt={selectedBook.title} className="w-10 h-14 object-cover rounded" />
                      ) : <div className="w-10 h-14 bg-gray-200 rounded" />}
                      <div className="flex-1">
                        <div className="font-medium text-sm">{selectedBook.title}</div>
                        <div className="text-xs text-gray-500">ISBN: {selectedBook.isbn ?? '—'}</div>
                      </div>
                      <button onClick={() => { setSelectedBook(null); setCoverPreview(null); }} className="text-gray-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        className="pl-9 pr-3 py-2 border rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="Kitap adı veya ISBN ara..."
                        value={bookSearch}
                        onChange={(e) => setBookSearch(e.target.value)}
                      />
                      {bookSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
                    </div>
                  )}
                  {errors.book && <p className="text-xs text-red-500 mt-1">{errors.book}</p>}
                  {bookResults.length > 0 && !selectedBook && (
                    <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                      {bookResults.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => { setSelectedBook(b); setCoverPreview(b.cover_image_url); setBookResults([]); setBookSearch(''); }}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-indigo-50 text-left border-b border-gray-100 last:border-0"
                        >
                          {b.cover_image_url ? (
                            <img src={b.cover_image_url} alt={b.title} className="w-8 h-10 object-cover rounded flex-shrink-0" />
                          ) : <div className="w-8 h-10 bg-gray-100 rounded flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{b.title}</div>
                            <div className="text-xs text-gray-400">{b.author ?? ''} · ISBN: {b.isbn ?? '—'}</div>
                          </div>
                          {b.my_offer && <span className="text-xs text-orange-500 flex-shrink-0">Teklif var</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {bookMode === 'new' && (
                <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Kitap Başlığı <span className="text-red-500">*</span></label>
                      <input className={`mt-0.5 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errors.newTitle ? 'border-red-400' : 'border-gray-300'}`}
                        placeholder="Tam kitap adı"
                        value={newBook.title}
                        onChange={(e) => setNewBook({ ...newBook, title: e.target.value })} />
                      {errors.newTitle && <p className="text-xs text-red-500 mt-0.5">{errors.newTitle}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">ISBN</label>
                      <input className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        placeholder="978-..."
                        value={newBook.isbn}
                        onChange={(e) => setNewBook({ ...newBook, isbn: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Yazar</label>
                      <input className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        value={newBook.author}
                        onChange={(e) => setNewBook({ ...newBook, author: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Yayınevi</label>
                      <input className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        value={newBook.publisher}
                        onChange={(e) => setNewBook({ ...newBook, publisher: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Ders</label>
                      <select className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        value={newBook.subject}
                        onChange={(e) => setNewBook({ ...newBook, subject: e.target.value })}>
                        <option value="">Seçin</option>
                        {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Sınıf / Seviye</label>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {CLASS_LEVELS.map((cl) => (
                          <button
                            key={cl}
                            type="button"
                            onClick={() => {
                              const next = newBook.class_levels.includes(cl)
                                ? newBook.class_levels.filter((x) => x !== cl)
                                : [...newBook.class_levels, cl];
                              setNewBook({ ...newBook, class_levels: next });
                            }}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${newBook.class_levels.includes(cl) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                          >{cl}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Açıklama (opsiyonel)</label>
                    <textarea
                      className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none h-16"
                      value={newBook.description}
                      onChange={(e) => setNewBook({ ...newBook, description: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          )}

          {isEdit && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Kitap açıklaması</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none h-24"
                placeholder="Kitap hakkında kısa açıklama"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
          )}

          {/* ── KAPAK GÖRSELİ ── */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Kapak Görseli</label>
            <div className="flex items-start gap-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-32 border-2 border-dashed border-gray-300 rounded-xl overflow-hidden cursor-pointer hover:border-indigo-400 transition-colors flex items-center justify-center bg-gray-50 relative flex-shrink-0"
              >
                {coverPreview ? (
                  <>
                    <img src={coverPreview} alt="Kapak" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-400">
                    <Image className="w-8 h-8 mx-auto mb-1" />
                    <span className="text-xs">Yükle</span>
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-500 pt-2">
                <p className="font-medium text-gray-700 mb-1">Kitap Kapak Görseli</p>
                <p>· JPEG, PNG veya WebP</p>
                <p>· Maksimum 10 MB</p>
                <p>· Önerilen: 400×600 px (dikey)</p>
                {coverFile && <p className="text-green-600 mt-1">✓ {coverFile.name}</p>}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-indigo-600 hover:underline text-xs"
                >
                  {coverPreview ? 'Görseli Değiştir' : 'Dosya Seç'}
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleCoverChange}
            />
          </div>

          {/* ── FİYAT & İNDİRİM ── */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Fiyatlandırma</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Satış Fiyatı (₺) <span className="text-red-500">*</span></label>
                <div className="relative mt-0.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₺</span>
                  <input
                    type="number" min="0" step="0.01"
                    className={`pl-7 pr-3 py-2 border rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errors.price ? 'border-red-400' : 'border-gray-300'}`}
                    placeholder="0.00"
                    value={priceLira}
                    onChange={(e) => { setPriceLira(e.target.value); setErrors({ ...errors, price: '' }); }}
                  />
                </div>
                {errors.price && <p className="text-xs text-red-500 mt-0.5">{errors.price}</p>}
              </div>
              <div>
                <label className="text-xs text-gray-500 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Normal Fiyat (indirim öncesi, opsiyonel)
                </label>
                <div className="relative mt-0.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₺</span>
                  <input
                    type="number" min="0" step="0.01"
                    className={`pl-7 pr-3 py-2 border rounded-lg text-sm w-full focus:outline-none ${errors.discount ? 'border-red-400' : 'border-gray-300'}`}
                    placeholder="Örn: 89.90"
                    value={discountLira}
                    onChange={(e) => { setDiscountLira(e.target.value); setErrors({ ...errors, discount: '' }); }}
                  />
                </div>
                {errors.discount && <p className="text-xs text-red-500 mt-0.5">{errors.discount}</p>}
              </div>
            </div>
            {discountPct && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">%{discountPct} İndirim</span>
                <span className="text-gray-500">
                  <span className="line-through">{discountLira ? `₺${discountLira}` : ''}</span>
                  {' → '}
                  <span className="font-semibold text-green-700">₺{priceLira}</span>
                </span>
              </div>
            )}
          </div>

          {/* ── STOK & KARGO ── */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Stok & Kargo</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500">Mevcut Stok <span className="text-red-500">*</span></label>
                <input
                  type="number" min="0"
                  className={`mt-0.5 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errors.stock ? 'border-red-400' : 'border-gray-300'}`}
                  value={stock}
                  onChange={(e) => { setStock(e.target.value); setErrors({ ...errors, stock: '' }); }}
                />
                {errors.stock && <p className="text-xs text-red-500 mt-0.5">{errors.stock}</p>}
              </div>
              <div>
                <label className="text-xs text-gray-500">Düşük Stok Uyarısı</label>
                <input
                  type="number" min="0"
                  className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={lowStock}
                  onChange={(e) => setLowStock(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Kargo (iş günü) <span className="text-red-500">*</span></label>
                <div className="relative mt-0.5">
                  <Truck className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="number" min="1"
                    className={`pl-8 pr-3 py-2 border rounded-lg text-sm w-full focus:outline-none ${errors.shippingDays ? 'border-red-400' : 'border-gray-300'}`}
                    value={shippingDays}
                    onChange={(e) => { setShippingDays(e.target.value); setErrors({ ...errors, shippingDays: '' }); }}
                  />
                </div>
                {errors.shippingDays && <p className="text-xs text-red-500 mt-0.5">{errors.shippingDays}</p>}
              </div>
            </div>
          </div>

          {/* Özet önizleme */}
          {priceLira && parseFloat(priceLira) > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-center gap-4 text-sm">
              {coverPreview && <img src={coverPreview} alt="kapak" className="w-10 h-14 object-cover rounded shadow-sm flex-shrink-0" />}
              <div>
                <div className="font-semibold">
                  {isEdit ? (offer?.book as { title?: string } | null)?.title : (selectedBook?.title ?? newBook.title) || 'Kitap başlığı'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-indigo-700 font-bold">₺{priceLira}</span>
                  {discountPct && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">%{discountPct} indirim</span>}
                  <span className="text-gray-500">· Stok: {stock}</span>
                  <span className="text-gray-500">· {shippingDays}g kargo</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">İptal</button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex items-center gap-2 text-sm bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {(saving || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploading ? 'Görsel yükleniyor...' : isEdit ? 'Güncelle' : 'Teklif Oluştur'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tekliflerim ────────────────────────────────────────────────────────
function Tekliflerim() {
  const [offers, setOffers] = useState<CommerceVendorOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [modalOffer, setModalOffer] = useState<CommerceVendorOffer | null | 'new'>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await cvListOffers();
      setOffers(r.offers);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (id: string) => {
    setSubmitting(id);
    try {
      await cvSubmitOffer(id);
      toast.success('Teklif onaya gönderildi');
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSubmitting(null); }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Tekliflerim ({offers.length})</h2>
        <div className="flex gap-2">
          <button onClick={load} className="text-gray-400 hover:text-gray-600"><RefreshCw className="w-4 h-4" /></button>
          <button
            onClick={() => setModalOffer('new')}
            className="flex items-center gap-1 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Yeni Teklif
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {offers.map((o) => {
          const book = o.book as { title?: string; isbn?: string | null; cover_image_url?: string | null } | null;
          const canSubmit = ['draft', 'correction_requested', 'rejected'].includes(o.status);
          const canEdit = canSubmit || o.status === 'approved';
          const isLowStock = o.stock_quantity <= o.low_stock_threshold;
          return (
            <div key={o.id} className={`border rounded-xl p-4 ${isLowStock && o.status === 'approved' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex gap-3">
                {book?.cover_image_url ? (
                  <img src={book.cover_image_url} alt={book?.title} className="w-12 h-16 object-cover rounded shadow-sm flex-shrink-0" />
                ) : (
                  <div className="w-12 h-16 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-gray-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium truncate">{book?.title ?? '—'}</div>
                    <OfferStatusBadge status={o.status} />
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">ISBN: {book?.isbn ?? '—'}</div>
                  <div className="mt-2 flex gap-4 text-sm flex-wrap">
                    <div>
                      <span className="text-gray-500">Fiyat:</span>{' '}
                      <strong className="text-indigo-700">{formatCommerceTry(o.price_kurus)}</strong>
                      {o.compare_at_price_kurus && o.compare_at_price_kurus > o.price_kurus && (
                        <span className="ml-1 text-xs text-gray-400 line-through">{formatCommerceTry(o.compare_at_price_kurus)}</span>
                      )}
                    </div>
                    <div className={isLowStock ? 'text-red-700 font-semibold' : ''}>
                      <span className="text-gray-500">Stok:</span> <strong>{o.stock_quantity}</strong>
                      {isLowStock && <span className="ml-1 text-xs text-red-500">⚠ düşük</span>}
                    </div>
                    <div><span className="text-gray-500">Kargo:</span> <strong>{o.shipping_days} gün</strong></div>
                  </div>
                  {o.status === 'correction_requested' && o.correction_notes && (
                    <div className="mt-2 text-xs bg-orange-100 text-orange-800 p-2 rounded">
                      <strong>Düzeltme notu:</strong> {o.correction_notes}
                    </div>
                  )}
                  {o.status === 'rejected' && o.rejection_reason && (
                    <div className="mt-2 text-xs bg-red-100 text-red-800 p-2 rounded">
                      <strong>Red nedeni:</strong> {o.rejection_reason}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {canEdit && (
                      <button
                        onClick={() => setModalOffer(o)}
                        className="flex items-center gap-1 text-xs border border-gray-300 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-50"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Düzenle
                      </button>
                    )}
                    {canSubmit && (
                      <button
                        onClick={() => handleSubmit(o.id)}
                        disabled={submitting === o.id}
                        className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {submitting === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Onaya Gönder
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {offers.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm mb-3">Henüz teklif oluşturmadınız</p>
            <button
              onClick={() => setModalOffer('new')}
              className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
            >
              İlk Teklifini Oluştur
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOffer !== null && (
        <OfferModal
          offer={modalOffer === 'new' ? null : modalOffer}
          onClose={() => setModalOffer(null)}
          onSave={load}
        />
      )}
    </div>
  );
}

// ── Siparişlerim ───────────────────────────────────────────────────────
type VendorOrderRow = CommerceVendorOrder & {
  commerce_orders?: {
    id?: string;
    order_number?: string;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_phone?: string | null;
    notes?: string | null;
    status?: string;
    payment_status?: string;
  };
  commerce_order_items?: { title_snapshot: string; quantity: number; unit_price_kurus: number }[];
};

function Siparislerim() {
  const [orders, setOrders] = useState<VendorOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [shipModal, setShipModal] = useState<string | null>(null);
  const [editing, setEditing] = useState<VendorOrderRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await cvListOrders({ status: filterStatus || undefined });
      setOrders((r.vendor_orders || []) as VendorOrderRow[]);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [filterStatus]);
  useEffect(() => { load(); }, [load]);

  const handleAccept = async (id: string) => {
    try {
      await cvAcceptOrder(id);
      toast.success('Sipariş kabul edildi');
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const handlePreparing = async (id: string) => {
    try {
      await cvMarkPreparing(id);
      toast.success('Sipariş hazırlanıyor olarak işaretlendi');
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const handleDelete = async (vo: VendorOrderRow) => {
    const no = vo.commerce_orders?.order_number || vo.id;
    if (!window.confirm(`“${no}” siparişini silmek istiyor musunuz? Bu işlem geri alınamaz.`)) return;
    try {
      await cvDeleteOrder(vo.id);
      toast.success('Sipariş silindi');
      if (editing?.id === vo.id) setEditing(null);
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-3">
        <div>
          <h2 className="text-lg font-semibold">Siparişlerim</h2>
          <p className="text-xs text-gray-500 mt-0.5">Yalnızca kart veya IBAN ile ödemesi alınan siparişler listelenir.</p>
        </div>
        <select
          className="border rounded-lg text-sm px-2 py-1.5"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Tüm durumlar</option>
          <option value="pending">Yeni</option>
          <option value="confirmed">Onaylandı</option>
          <option value="preparing">Hazırlanıyor</option>
          <option value="shipped">Kargoya Verildi</option>
          <option value="delivered">Teslim Edildi</option>
        </select>
      </div>
      <div className="space-y-3">
        {orders.map((vo) => {
          const order = vo.commerce_orders;
          const items = vo.commerce_order_items ?? [];
          return (
            <div key={vo.id} className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-mono text-xs font-bold text-gray-700">{order?.order_number}</div>
                  <div className="text-sm font-medium mt-0.5">{order?.customer_name ?? '—'}</div>
                  {order?.customer_phone && <div className="text-xs text-gray-400">{order.customer_phone}</div>}
                </div>
                <div className="text-right">
                  <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    vo.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    vo.status === 'confirmed' ? 'bg-teal-100 text-teal-700' :
                    vo.status === 'preparing' ? 'bg-indigo-100 text-indigo-700' :
                    vo.status === 'shipped' ? 'bg-purple-100 text-purple-700' :
                    vo.status === 'delivered' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {vo.status === 'pending' ? 'Yeni' :
                     vo.status === 'confirmed' ? 'Onaylandı' :
                     vo.status === 'preparing' ? 'Hazırlanıyor' :
                     vo.status === 'shipped' ? 'Kargoda' :
                     vo.status === 'delivered' ? 'Teslim Edildi' : vo.status}
                  </div>
                  <div className="text-sm font-bold mt-1">{formatCommerceTry(vo.vendor_net_kurus)}</div>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-2 space-y-1">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="truncate text-gray-700">{item.title_snapshot} ×{item.quantity}</span>
                    <span className="text-gray-500">{formatCommerceTry(item.unit_price_kurus * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                {vo.status === 'pending' && (
                  <button onClick={() => handleAccept(vo.id)}
                    className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Kabul Et
                  </button>
                )}
                {vo.status === 'confirmed' && (
                  <button onClick={() => handlePreparing(vo.id)}
                    className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
                    <Package className="w-3.5 h-3.5" /> Hazırlamaya Başla
                  </button>
                )}
                {vo.status === 'preparing' && (
                  <button onClick={() => setShipModal(vo.id)}
                    className="flex items-center gap-1 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700">
                    <Truck className="w-3.5 h-3.5" /> Kargoya Ver
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(vo)}
                  className="flex items-center gap-1 text-xs border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  <Pencil className="w-3.5 h-3.5" /> Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(vo)}
                  className="flex items-center gap-1 text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Sil
                </button>
              </div>
            </div>
          );
        })}
        {orders.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Sipariş bulunamadı</p>
          </div>
        )}
      </div>
      {/* Kargo modal */}
      {shipModal && (
        <ShipOrderModal
          vendorOrderId={shipModal}
          onClose={() => setShipModal(null)}
          onSuccess={() => { setShipModal(null); load(); }}
        />
      )}
      {editing && (
        <VendorOrderEditModal
          vo={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          onDeleted={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function VendorOrderEditModal({
  vo,
  onClose,
  onSaved,
  onDeleted,
}: {
  vo: VendorOrderRow;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const parent = vo.commerce_orders;
  const [form, setForm] = useState({
    customer_name: parent?.customer_name || '',
    customer_email: parent?.customer_email || '',
    customer_phone: parent?.customer_phone || '',
    notes: parent?.notes || '',
    vendor_notes: vo.vendor_notes || '',
    status: vo.status,
    order_status: parent?.status || '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await cvUpdateOrder(vo.id, {
        customer_name: form.customer_name.trim() || null,
        customer_email: form.customer_email.trim() || null,
        customer_phone: form.customer_phone.trim() || null,
        notes: form.notes.trim() || null,
        vendor_notes: form.vendor_notes.trim() || null,
        status: form.status,
        order_status: form.order_status || undefined,
      });
      toast.success('Sipariş güncellendi');
      onSaved();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const no = parent?.order_number || vo.id;
    if (!window.confirm(`“${no}” siparişini silmek istiyor musunuz?`)) return;
    setDeleting(true);
    try {
      await cvDeleteOrder(vo.id);
      toast.success('Sipariş silindi');
      onDeleted();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Siparişi düzenle · {parent?.order_number || ''}</h3>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Müşteri adı</label>
            <input className="mt-0.5 w-full border rounded-lg px-3 py-2 text-sm" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">E-posta</label>
              <input className="mt-0.5 w-full border rounded-lg px-3 py-2 text-sm" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Telefon</label>
              <input className="mt-0.5 w-full border rounded-lg px-3 py-2 text-sm" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Kitapçı durumu</label>
            <select className="mt-0.5 w-full border rounded-lg px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CommerceVendorOrder['status'] })}>
              <option value="pending">Yeni</option>
              <option value="confirmed">Onaylandı</option>
              <option value="preparing">Hazırlanıyor</option>
              <option value="shipped">Kargoda</option>
              <option value="delivered">Teslim edildi</option>
              <option value="cancelled">İptal</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Sipariş notu</label>
            <textarea className="mt-0.5 w-full border rounded-lg px-3 py-2 text-sm h-20" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Kitapçı notu</label>
            <textarea className="mt-0.5 w-full border rounded-lg px-3 py-2 text-sm h-16" value={form.vendor_notes} onChange={(e) => setForm({ ...form, vendor_notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-between mt-5">
          <button type="button" onClick={remove} disabled={deleting} className="text-sm text-red-600 hover:underline disabled:opacity-50">
            {deleting ? 'Siliniyor…' : 'Siparişi sil'}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-3 py-1.5">Vazgeç</button>
            <button type="button" onClick={save} disabled={saving} className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg disabled:opacity-50">
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShipOrderModal({ vendorOrderId, onClose, onSuccess }: { vendorOrderId: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ carrier: '', tracking_number: '', tracking_url: '', invoice_number: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await cvShipOrder(vendorOrderId, form);
      toast.success('Kargo bilgisi kaydedildi');
      onSuccess();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Kargo Bilgisi Gir</h3>
        <div className="space-y-3">
          {[
            { key: 'carrier', label: 'Kargo Firması', placeholder: 'Aras, Yurtiçi, MNG...' },
            { key: 'tracking_number', label: 'Takip Numarası', placeholder: '' },
            { key: 'tracking_url', label: 'Takip URL (isteğe bağlı)', placeholder: 'https://...' },
            { key: 'invoice_number', label: 'Fatura No (isteğe bağlı)', placeholder: '' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder={placeholder}
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-1.5">İptal</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.tracking_number.trim()}
            className="text-sm bg-purple-600 text-white px-4 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Kargoya Ver
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hakedişlerim ──────────────────────────────────────────────────────
function Hakedislerim() {
  const [payouts, setPayouts] = useState<CommerceVendorPayout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cvListPayouts()
      .then((r) => setPayouts(r.payouts))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;

  const totalPaid = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.net_payout_kurus, 0);
  const totalPending = payouts.filter((p) => p.status === 'pending').reduce((s, p) => s + p.net_payout_kurus, 0);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs text-green-600 mb-1">Toplam Ödenen</div>
          <div className="text-xl font-bold text-green-800">{formatCommerceTry(totalPaid)}</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="text-xs text-yellow-600 mb-1">Bekleyen Hakediş</div>
          <div className="text-xl font-bold text-yellow-800">{formatCommerceTry(totalPending)}</div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Dönem</th>
              <th className="px-4 py-3 font-medium">Brüt Satış</th>
              <th className="px-4 py-3 font-medium">Komisyon</th>
              <th className="px-4 py-3 font-medium">Net Hakediş</th>
              <th className="px-4 py-3 font-medium">Durum</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-xs">{p.period_start} – {p.period_end}</td>
                <td className="px-4 py-3">{formatCommerceTry(p.gross_sales_kurus)}</td>
                <td className="px-4 py-3 text-red-600">-{formatCommerceTry(p.commission_kurus)}</td>
                <td className="px-4 py-3 font-semibold text-green-700">{formatCommerceTry(p.net_payout_kurus)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.status === 'paid' ? 'bg-green-100 text-green-700' :
                    p.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {p.status === 'paid' ? 'Ödendi' : p.status === 'approved' ? 'Onaylandı' : 'Bekliyor'}
                  </span>
                </td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Hakediş kaydı yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Kitaplarım (placeholder) ──────────────────────────────────────────
function Kitaplarim() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <BookOpen className="w-10 h-10 mb-3 opacity-40" />
      <p className="text-sm mb-2">Katalogdan kitap seçerek teklif oluşturabilirsiniz</p>
      <p className="text-xs text-gray-400">Tekliflerim sekmesinden <strong>Yeni Teklif</strong> butonuna tıklayın</p>
    </div>
  );
}

// ── Ana sayfa ──────────────────────────────────────────────────────────
export default function VendorPanelPage() {
  const { effectiveUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('genel');
  const [acting, setActing] = useState<ActingVendor | null>(() => getActingVendor());
  const [vendorChoices, setVendorChoices] = useState<{ id: string; name: string }[]>([]);
  const [vendorPick, setVendorPick] = useState('');

  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as Tab;
    if (TABS.some((t) => t.key === hash)) setTab(hash);
  }, []);

  useEffect(() => {
    const sync = () => setActing(getActingVendor());
    window.addEventListener('commerce-acting-vendor', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('commerce-acting-vendor', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const roles = [(effectiveUser?.role ?? ''), ...((effectiveUser as { roles?: string[] })?.roles ?? [])];
  const isSuperAdmin = roles.includes('super_admin');
  const hasAccess = roles.includes('vendor_admin') || isSuperAdmin;

  useEffect(() => {
    if (!isSuperAdmin || acting) return;
    caListVendors()
      .then((r) => setVendorChoices((r.vendors || []).map((v) => ({ id: v.id, name: v.name }))))
      .catch(() => undefined);
  }, [isSuperAdmin, acting]);

  if (!hasAccess) {
    return <div className="p-6 text-gray-500">Bu sayfaya erişim yetkiniz yok.</div>;
  }

  if (isSuperAdmin && !acting) {
    return (
      <div className="p-4 md:p-6 max-w-xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Satıcı paneline geç</h1>
        <p className="text-sm text-gray-500 mb-4">
          Süper admin olarak bir satıcı seçin; o satıcının paneli açılır (görsel, açıklama, teklif, sipariş).
        </p>
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
          value={vendorPick}
          onChange={(e) => setVendorPick(e.target.value)}
        >
          <option value="">Satıcı seçin…</option>
          {vendorChoices.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <button
          disabled={!vendorPick}
          onClick={() => {
            const v = vendorChoices.find((x) => x.id === vendorPick);
            if (!v) return;
            setActingVendor(v);
            setActing(v);
          }}
          className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
        >
          Panele geç
        </button>
      </div>
    );
  }

  const renderTab = () => {
    switch (tab) {
      case 'genel': return <GenelBakis />;
      case 'kitaplarim': return <Kitaplarim />;
      case 'tekliflerim': return <Tekliflerim />;
      case 'siparislerim': return <Siparislerim />;
      case 'hakedislerim': return <Hakedislerim />;
      default: return null;
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {isSuperAdmin && acting && (
        <div className="mb-4 flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <div className="text-sm text-indigo-900">
            <span className="font-semibold">{acting.name}</span> satıcı paneli — süper admin olarak bakıyorsunuz
          </div>
          <button
            className="text-xs font-medium text-indigo-700 hover:underline"
            onClick={() => {
              clearActingVendor();
              navigate('/kitap-pazaryeri#saticilar');
            }}
          >
            Pazaryerine dön
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 mb-6">
        <Store className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Satıcı Panelim</h1>
          <p className="text-sm text-gray-500">Kitaplar · Teklifler · Siparişler · Hakedişler</p>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 mb-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); window.history.replaceState(null, '', `#${t.key}`); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-indigo-50 text-indigo-700 font-semibold border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div>{renderTab()}</div>
    </div>
  );
}
