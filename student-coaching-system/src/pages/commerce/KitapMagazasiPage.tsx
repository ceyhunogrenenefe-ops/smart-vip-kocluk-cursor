/**
 * Öğrenci/Veli Kitap Mağazası
 * Sekmeler: Tüm Kitaplar | Önerilen | Sınıf Paketleri | Atanmış Kitaplarım
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Loader2,
  Package,
  Search,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Tag,
  Truck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  csAddToCart,
  csGetAssigned,
  csGetSettings,
  csListCatalog,
  csListCollections,
  csListPackages,
  type CatalogListParams,
  type OfferWithBook,
  type StoreCollection,
  type StoreCollectionBook,
} from '../../lib/commerceStoreApi';
import type { CommerceBookPackage, CommerceSettings, CommerceStudentBookAssignment, CommerceVendorOffer } from '../../types/commerce.types';
import { formatCommerceTry } from '../../types/commerce.types';
import { useAuth } from '../../context/AuthContext';

type Tab = 'tum-kitaplar' | 'onerilen' | 'paketler' | 'atanmis';

const TABS: { key: Tab; label: string }[] = [
  { key: 'tum-kitaplar', label: 'Tüm Kitaplar' },
  { key: 'onerilen', label: 'Öğretmen Önerileri' },
  { key: 'paketler', label: 'Sınıf Paketleri' },
  { key: 'atanmis', label: 'Atanmış Kitaplarım' },
];

// ─── Yardımcı bileşenler ────────────────────────────────────────────

function DiscountBadge({ original, current }: { original: number | null; current: number }) {
  if (!original || original <= current) return null;
  const pct = Math.round((1 - current / original) * 100);
  return (
    <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
      %{pct}
    </span>
  );
}

function CartButton({ offerId, stock }: { offerId: string; stock: number }) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const { effectiveUser } = useAuth();

  const handle = async () => {
    if (!effectiveUser) { toast.error('Sepete eklemek için giriş yapın'); return; }
    setLoading(true);
    try {
      await csAddToCart(offerId, undefined, 1);
      setAdded(true);
      toast.success('Sepete eklendi');
      setTimeout(() => setAdded(false), 2000);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };

  if (stock === 0) return <span className="text-xs text-gray-400">Stok Yok</span>;
  return (
    <button
      onClick={handle}
      disabled={loading}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
        added
          ? 'bg-green-500 text-white'
          : 'bg-indigo-600 text-white hover:bg-indigo-700'
      } disabled:opacity-50`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : added ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
      {added ? 'Eklendi' : 'Sepete Ekle'}
    </button>
  );
}

function BookCard({ offer }: { offer: OfferWithBook }) {
  const navigate = useNavigate();
  const book = offer.commerce_books;
  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/kitap-magazasi/${book.slug}`)}
    >
      <div className="relative">
        <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center overflow-hidden">
          {book.cover_image_url ? (
            <img src={book.cover_image_url} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <BookOpen className="w-12 h-12 text-gray-300" />
          )}
        </div>
        <DiscountBadge original={offer.compare_at_price_kurus} current={offer.price_kurus} />
        {offer.teacher_recommended && (
          <span className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            <Star className="w-3 h-3" /> Önerilen
          </span>
        )}
        {offer.is_new_arrival && !offer.teacher_recommended && (
          <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
            Yeni
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.5rem]">{book.title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{book.author ?? offer.commerce_vendors.name}</div>
        {book.publisher && <div className="text-xs text-gray-400">{book.publisher}</div>}
        {typeof book.metadata?.fascicle_count === 'number' && (
          <div className="text-xs text-indigo-600 mt-0.5">{book.metadata.fascicle_count} fasikül</div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <div>
            <span className="text-base font-bold text-indigo-700">{formatCommerceTry(offer.price_kurus)}</span>
            {offer.compare_at_price_kurus && offer.compare_at_price_kurus > offer.price_kurus && (
              <span className="ml-1.5 text-xs text-gray-400 line-through">{formatCommerceTry(offer.compare_at_price_kurus)}</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Truck className="w-3 h-3" />
            {offer.shipping_days}g
          </div>
        </div>
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <CartButton offerId={offer.id} stock={offer.stock_quantity} />
        </div>
      </div>
    </div>
  );
}

// ─── Filtre panel ────────────────────────────────────────────────────
const SUBJECTS = ['Matematik', 'Türkçe', 'Fen Bilimleri', 'İngilizce', 'Din Kültürü ve Ahlak Bilgisi', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'Sosyal Bilgiler', 'Fizik', 'Kimya', 'Biyoloji'];

function isLgs8ClassLevel(value: unknown): boolean {
  if (value == null || value === '') return false;
  const s = String(value).trim().toLocaleUpperCase('tr');
  if (s === 'LGS' || s === '8' || s.startsWith('8.') || s.startsWith('8 ')) return true;
  return parseInt(String(value), 10) === 8;
}

function CollectionBookCard({ book }: { book: StoreCollectionBook }) {
  const navigate = useNavigate();
  const offer = (book.commerce_vendor_offers ?? []).find((o) => Number(o.price_kurus) > 0) ?? book.commerce_vendor_offers?.[0];
  const fascicle = book.metadata?.fascicle_count;
  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/kitap-magazasi/${book.slug}`)}
    >
      <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center overflow-hidden">
        {book.cover_image_url ? (
          <img src={book.cover_image_url} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <BookOpen className="w-12 h-12 text-gray-300" />
        )}
      </div>
      <div className="p-3">
        <div className="font-semibold text-sm leading-tight line-clamp-2 min-h-[2.5rem]">{book.title}</div>
        <div className="text-xs text-gray-400">{book.publisher}</div>
        {typeof fascicle === 'number' && <div className="text-xs text-indigo-600 mt-0.5">{fascicle} fasikül</div>}
        <div className="mt-2">
          {book.buyable && offer ? (
            <span className="text-base font-bold text-indigo-700">{formatCommerceTry(offer.price_kurus)}</span>
          ) : (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Fiyat yakında</span>
          )}
        </div>
        {book.buyable && offer && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <CartButton offerId={offer.id} stock={offer.stock_quantity} />
          </div>
        )}
      </div>
    </div>
  );
}

function FilterPanel({
  filters, onChange, onClose, settings
}: {
  filters: CatalogListParams;
  onChange: (f: CatalogListParams) => void;
  onClose: () => void;
  settings: CommerceSettings | null;
}) {
  const [local, setLocal] = useState(filters);
  const apply = () => { onChange(local); onClose(); };
  const reset = () => { setLocal({}); onChange({}); onClose(); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-800">Filtrele</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Ders</label>
            <select
              className="border rounded-lg px-3 py-2 text-sm w-full"
              value={local.subject ?? ''}
              onChange={(e) => setLocal({ ...local, subject: e.target.value || undefined })}
            >
              <option value="">Tüm Dersler</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Fiyat Aralığı</label>
            <div className="flex gap-2 items-center">
              <input
                type="number" placeholder="Min ₺" className="border rounded-lg px-2 py-1.5 text-sm w-1/2"
                value={local.price_min !== undefined ? local.price_min / 100 : ''}
                onChange={(e) => setLocal({ ...local, price_min: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
              />
              <span className="text-gray-400">–</span>
              <input
                type="number" placeholder="Max ₺" className="border rounded-lg px-2 py-1.5 text-sm w-1/2"
                value={local.price_max !== undefined ? local.price_max / 100 : ''}
                onChange={(e) => setLocal({ ...local, price_max: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
              />
            </div>
          </div>
          <div className="space-y-2">
            {([
              ['teacher_recommended', '⭐ Öğretmen Önerileri'],
              ['is_featured', '🔥 Öne Çıkanlar'],
              ['is_bestseller', '📈 Çok Satanlar'],
              ['is_new_arrival', '✨ Yeni Gelenler'],
            ] as [keyof CatalogListParams, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={Boolean(local[key])}
                  onChange={(e) => setLocal({ ...local, [key]: e.target.checked || undefined })}
                />
                {label}
              </label>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Sırala</label>
            <select
              className="border rounded-lg px-3 py-2 text-sm w-full"
              value={local.sort ?? 'newest'}
              onChange={(e) => setLocal({ ...local, sort: e.target.value as CatalogListParams['sort'] })}
            >
              <option value="newest">Yeniden Eskiye</option>
              <option value="price_asc">Fiyat: Düşükten Yükseğe</option>
              <option value="price_desc">Fiyat: Yüksekten Düşüğe</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={reset} className="flex-1 border border-gray-300 text-gray-600 text-sm py-2 rounded-lg">Sıfırla</button>
          <button onClick={apply} className="flex-1 bg-indigo-600 text-white text-sm py-2 rounded-lg">Uygula</button>
        </div>
      </div>
    </div>
  );
}

// ─── Paketler sekmesi ────────────────────────────────────────────────
function PaketlerTab({ classLevel }: { classLevel?: string }) {
  const [packages, setPackages] = useState<CommerceBookPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const { effectiveUser } = useAuth();

  useEffect(() => {
    csListPackages(classLevel).then((r) => setPackages(r.packages)).catch((e: Error) => toast.error(e.message)).finally(() => setLoading(false));
  }, [classLevel]);

  const handleAddPackage = async (pkgId: string) => {
    if (!effectiveUser) { toast.error('Sepete eklemek için giriş yapın'); return; }
    setAddingId(pkgId);
    try {
      await csAddToCart(undefined, pkgId, 1);
      toast.success('Paket sepete eklendi');
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setAddingId(null); }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;
  if (packages.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
      <p className="text-sm">Henüz aktif paket yok</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {packages.map((pkg) => {
        const items = (pkg as unknown as { commerce_book_package_items?: { commerce_books?: { title: string; cover_image_url: string | null }; is_required: boolean }[] }).commerce_book_package_items ?? [];
        return (
          <div key={pkg.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
            <div className="relative aspect-[2/1] bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
              {pkg.cover_image_url ? (
                <img src={pkg.cover_image_url} alt={pkg.name} className="w-full h-full object-cover" />
              ) : (
                <BookOpen className="w-16 h-16 text-indigo-300" />
              )}
              {pkg.compare_at_price_kurus && pkg.compare_at_price_kurus > pkg.price_kurus && (
                <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  %{Math.round((1 - pkg.price_kurus / pkg.compare_at_price_kurus) * 100)} İndirim
                </span>
              )}
            </div>
            <div className="p-4">
              <div className="font-bold text-base">{pkg.name}</div>
              {pkg.class_level && <div className="text-xs text-indigo-600 font-medium mt-0.5">{pkg.class_level}. Sınıf</div>}
              {pkg.description && <div className="text-sm text-gray-500 mt-1 line-clamp-2">{pkg.description}</div>}
              {items.length > 0 && (
                <div className="mt-3 space-y-1">
                  {items.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                      <span className="truncate">{item.commerce_books?.title ?? '—'}</span>
                      {!item.is_required && <span className="text-gray-400">(opsiyonel)</span>}
                    </div>
                  ))}
                  {items.length > 4 && <div className="text-xs text-gray-400">+{items.length - 4} kitap daha</div>}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <span className="text-xl font-bold text-indigo-700">{formatCommerceTry(pkg.price_kurus)}</span>
                  {pkg.compare_at_price_kurus && pkg.compare_at_price_kurus > pkg.price_kurus && (
                    <span className="ml-2 text-sm text-gray-400 line-through">{formatCommerceTry(pkg.compare_at_price_kurus)}</span>
                  )}
                </div>
                <button
                  onClick={() => handleAddPackage(pkg.id)}
                  disabled={addingId === pkg.id}
                  className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                >
                  {addingId === pkg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                  Paketi Al
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Atanmış Kitaplar sekmesi ────────────────────────────────────────
function AtanmisTab() {
  const { effectiveUser } = useAuth();
  const [assignments, setAssignments] = useState<(CommerceStudentBookAssignment & { commerce_books: { id: string; slug: string; title: string; author: string | null; cover_image_url: string | null; publisher: string | null } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    csGetAssigned()
      .then((r) => setAssignments(r.assignments as typeof assignments))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;
  if (!effectiveUser || !assignments.length) return (
    <div className="text-center py-12 text-gray-400">
      <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
      <p className="text-sm">Henüz kitap atanmamış</p>
    </div>
  );

  const TYPE_LABELS: Record<string, string> = { required: '📌 Zorunlu', recommended: '⭐ Önerilen', optional: 'Opsiyonel' };
  const STATUS_LABELS: Record<string, string> = { assigned: 'Atandı', purchased: 'Satın Alındı', owned: 'Sahip Olunuyor', declined: 'Reddedildi' };

  return (
    <div className="space-y-3">
      {assignments.map((a) => {
        const book = a.commerce_books;
        return (
          <div key={a.id} className="flex gap-3 bg-white border border-gray-200 rounded-xl p-3 items-center">
            <div
              className="w-12 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0 cursor-pointer"
              onClick={() => book?.slug && navigate(`/kitap-magazasi/${book.slug}`)}
            >
              {book?.cover_image_url ? (
                <img src={book.cover_image_url} alt={book?.title} className="w-full h-full object-cover" />
              ) : (
                <BookOpen className="w-full h-full p-2 text-gray-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{book?.title ?? '—'}</div>
              <div className="text-xs text-gray-400">{book?.author ?? book?.publisher ?? ''}</div>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-gray-500">{TYPE_LABELS[a.assignment_type] ?? a.assignment_type}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  a.status === 'purchased' ? 'bg-green-100 text-green-700' :
                  a.status === 'owned' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{STATUS_LABELS[a.status] ?? a.status}</span>
              </div>
            </div>
            {a.status === 'assigned' && (
              <button
                onClick={() => book?.slug && navigate(`/kitap-magazasi/${book.slug}`)}
                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg flex-shrink-0"
              >
                İncele
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Ana Sayfa ───────────────────────────────────────────────────────
export default function KitapMagazasiPage() {
  const [tab, setTab] = useState<Tab>('tum-kitaplar');
  const [offers, setOffers] = useState<OfferWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CatalogListParams>({});
  const [showFilter, setShowFilter] = useState(false);
  const [settings, setSettings] = useState<CommerceSettings | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [collections, setCollections] = useState<StoreCollection[]>([]);
  const [activeSeries, setActiveSeries] = useState<string | null>(null);
  const navigate = useNavigate();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { linkedStudent } = useAuth();
  const lgs8 = isLgs8ClassLevel(linkedStudent?.classLevel);

  // Ayarları bir kez çek
  useEffect(() => {
    csGetSettings().then((r) => setSettings(r.settings)).catch(() => null);
  }, []);

  useEffect(() => {
    csListCollections()
      .then((r) => setCollections(r.collections ?? []))
      .catch(() => setCollections([]));
  }, []);

  const loadCatalog = useCallback(async (params: CatalogListParams) => {
    setLoading(true);
    try {
      const isRecommended = tab === 'onerilen';
      const r = await csListCatalog({
        ...params,
        teacher_recommended: isRecommended || params.teacher_recommended,
        class_level: lgs8 ? (params.class_level || '8') : params.class_level,
        limit: 48,
      });
      setOffers(r.offers ?? []);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [tab, lgs8]);

  useEffect(() => {
    if (tab === 'tum-kitaplar' || tab === 'onerilen') {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        loadCatalog({ ...filters, search: search || undefined });
      }, 350);
    }
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [tab, search, filters, loadCatalog]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const activeCollection = collections.find((c) => c.key === activeSeries) ?? null;
  const showCollectionShelf = tab === 'tum-kitaplar' && !search && !filters.subject && (lgs8 || collections.some((c) => c.book_count > 0));

  const freeShippingMsg = useMemo(() => {
    if (!settings) return null;
    const threshold = settings.free_shipping_threshold_kurus;
    if (threshold <= 0) return 'Kargo ücretsiz!';
    return `${formatCommerceTry(threshold)} üzeri alışverişlerde kargo bedava`;
  }, [settings]);

  const showCatalog = tab === 'tum-kitaplar' || tab === 'onerilen';

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Kitap Mağazası</h1>
            {freeShippingMsg && (
              <div className="flex items-center gap-1 text-xs text-green-600 mt-0.5">
                <Truck className="w-3 h-3" /> {freeShippingMsg}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate('/sepet')}
          className="relative p-2.5 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100"
        >
          <ShoppingCart className="w-5 h-5" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">{cartCount}</span>
          )}
        </button>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-4 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSearch(''); setFilters({}); }}
            className={`px-4 py-2 text-sm whitespace-nowrap rounded-t-lg transition-colors ${
              tab === t.key ? 'bg-indigo-50 text-indigo-700 font-semibold border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Arama + Filtre (katalog sekmelerinde) */}
      {showCatalog && (
        <div className="flex gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="pl-9 pr-3 py-2 border rounded-xl text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Kitap, yazar veya yayınevi ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilter(true)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-sm ${activeFilterCount > 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtrele
            {activeFilterCount > 0 && <span className="bg-white text-indigo-700 text-xs rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>}
          </button>
        </div>
      )}

      {/* Aktif filtre etiketleri */}
      {showCatalog && activeFilterCount > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {filters.subject && (
            <span className="flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full">
              <Tag className="w-3 h-3" /> {filters.subject}
              <button onClick={() => setFilters({ ...filters, subject: undefined })}><X className="w-3 h-3" /></button>
            </span>
          )}
          {filters.teacher_recommended && (
            <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full">
              ⭐ Önerilen <button onClick={() => setFilters({ ...filters, teacher_recommended: undefined })}><X className="w-3 h-3" /></button>
            </span>
          )}
          {(filters.price_min || filters.price_max) && (
            <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
              ₺{filters.price_min ? filters.price_min / 100 : '0'} – {filters.price_max ? '₺' + filters.price_max / 100 : '∞'}
              <button onClick={() => setFilters({ ...filters, price_min: undefined, price_max: undefined })}><X className="w-3 h-3" /></button>
            </span>
          )}
        </div>
      )}

      {/* İçerik */}
      {tab === 'paketler' ? (
        <PaketlerTab classLevel={lgs8 ? '8' : undefined} />
      ) : tab === 'atanmis' ? (
        <AtanmisTab />
      ) : (
        <>
          {showCollectionShelf && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {collections.map((col) => (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => setActiveSeries(activeSeries === col.key ? null : col.key)}
                  className={`text-left rounded-2xl border overflow-hidden transition-shadow ${
                    activeSeries === col.key ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200 hover:shadow-md'
                  }`}
                >
                  <div className="h-28 bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center overflow-hidden">
                    {col.cover_image_url ? (
                      <img src={col.cover_image_url} alt={col.label} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-10 h-10 text-indigo-300" />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-bold text-sm">{col.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{col.description}</div>
                    {col.coming_soon && col.book_count === 0 && (
                      <span className="inline-block mt-2 text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Yakında</span>
                    )}
                    {col.book_count > 0 && (
                      <span className="inline-block mt-2 text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        {col.book_count} kitap{col.priced_count ? ` · ${col.priced_count} fiyatlı` : ''}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {activeCollection && showCollectionShelf ? (
            activeCollection.books.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {activeCollection.books.map((b) => <CollectionBookCard key={b.id} book={b} />)}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{activeCollection.label} yakında yüklenecek (Paraf ve denemeler sonraki adım).</p>
              </div>
            )
          ) : loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-indigo-400" /></div>
          ) : offers.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Kitap bulunamadı</p>
              {activeFilterCount > 0 && (
                <button onClick={() => setFilters({})} className="mt-2 text-sm text-indigo-600">Filtreleri temizle</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {offers.map((o) => <BookCard key={o.id} offer={o} />)}
            </div>
          )}
        </>
      )}

      {/* Filtre modal */}
      {showFilter && (
        <FilterPanel filters={filters} onChange={setFilters} onClose={() => setShowFilter(false)} settings={settings} />
      )}
    </div>
  );
}
