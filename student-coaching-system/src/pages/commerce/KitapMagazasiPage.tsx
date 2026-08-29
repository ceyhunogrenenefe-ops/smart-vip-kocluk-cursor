/**
 * Öğrenci/Veli Kitap Mağazası
 * Sekmeler: Tüm Kitaplar | Önerilen | Sınıf Paketleri | Atanmış Kitaplarım
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  Package,
  Search,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Tag,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  csAddToCart,
  csGetAssigned,
  csGetCart,
  csGetSettings,
  csListBrowse,
  csListCatalog,
  csListPackages,
  csStaffAssign,
  csStaffCreatePackage,
  csStaffRoster,
  type CatalogListParams,
  type StaffRosterClass,
  type StaffRosterStudent,
  type OfferWithBook,
  type StoreBrowseCategoryWithBooks,
  type StoreCollectionBook,
} from '../../lib/commerceStoreApi';
import type { CommerceBookPackage, CommerceSettings, CommerceStudentBookAssignment, StoreBrowseClass } from '../../types/commerce.types';
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

function BookCard({
  offer,
  onCartChange,
  canBuy = true,
  staffSelect = false,
  selected = false,
  onToggleSelect,
}: {
  offer: OfferWithBook;
  onCartChange?: () => void;
  canBuy?: boolean;
  staffSelect?: boolean;
  selected?: boolean;
  onToggleSelect?: (bookId: string) => void;
}) {
  const navigate = useNavigate();
  const book = offer.commerce_books;
  if (!book) return null;
  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-shadow cursor-pointer ${
        selected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200'
      }`}
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
        {staffSelect && (
          <label
            className="absolute bottom-2 left-2 bg-white/95 border border-indigo-200 rounded-lg px-2 py-1 flex items-center gap-1 text-[11px] font-medium text-indigo-700 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(book.id)}
            />
            Seç
          </label>
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
            {offer.unpriced || offer.price_kurus <= 0 ? (
              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Fiyat yakında</span>
            ) : (
              <>
                <span className="text-base font-bold text-indigo-700">{formatCommerceTry(offer.price_kurus)}</span>
                {offer.compare_at_price_kurus && offer.compare_at_price_kurus > offer.price_kurus && (
                  <span className="ml-1.5 text-xs text-gray-400 line-through">{formatCommerceTry(offer.compare_at_price_kurus)}</span>
                )}
              </>
            )}
          </div>
          {!offer.unpriced && offer.price_kurus > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Truck className="w-3 h-3" />
              {offer.shipping_days}g
            </div>
          )}
        </div>
        {canBuy && !offer.unpriced && offer.price_kurus > 0 && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <CartButton offerId={offer.id} stock={offer.stock_quantity} onAdded={onCartChange} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Filtre panel ────────────────────────────────────────────────────
const SUBJECTS = ['Matematik', 'Türkçe', 'Fen Bilimleri', 'İngilizce', 'Din Kültürü ve Ahlak Bilgisi', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'Sosyal Bilgiler', 'Fizik', 'Kimya', 'Biyoloji'];
const STORE_KINDS = [
  { key: 'egitim-setleri', label: 'Eğitim Setleri' },
  { key: 'soru-bankalari', label: 'Soru Bankaları' },
  { key: 'denemeler', label: 'Denemeler' },
];

function isLgs8ClassLevel(value: unknown): boolean {
  if (value == null || value === '') return false;
  const s = String(value).trim().toLocaleUpperCase('tr');
  if (s === 'LGS' || s === '8' || s.startsWith('8.') || s.startsWith('8 ')) return true;
  return parseInt(String(value), 10) === 8;
}

function classKeysEqual(a: string, b: string) {
  const left = String(a ?? '').trim().toLocaleUpperCase('tr');
  const right = String(b ?? '').trim().toLocaleUpperCase('tr');
  if (!left || !right) return false;
  if (left === right) return true;
  const ln = parseInt(left, 10);
  const rn = parseInt(right, 10);
  if (/^\d+$/.test(left) && Number.isFinite(rn) && ln === rn) return true;
  if (/^\d+$/.test(right) && Number.isFinite(ln) && ln === rn) return true;
  return false;
}

function studentMatchesClass(studentLevel: unknown, classKey: string) {
  if (studentLevel == null || studentLevel === '') return false;
  if (classKeysEqual(String(studentLevel), classKey)) return true;
  if (isLgs8ClassLevel(studentLevel) && (classKeysEqual(classKey, '8') || classKeysEqual(classKey, 'LGS'))) return true;
  return false;
}

function categoryBelongsToClass(cat: { class_keys?: string[] }, classKey: string) {
  const keys = cat.class_keys ?? [];
  if (keys.some((k) => classKeysEqual(k, classKey))) return true;
  if (isLgs8ClassLevel(classKey) && keys.some((k) => isLgs8ClassLevel(k))) return true;
  return false;
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
        {book.metadata?.is_set && typeof book.metadata?.book_count === 'number' && (
          <div className="text-xs text-indigo-600 mt-0.5">
            {typeof book.metadata.set_size_label === 'string' ? book.metadata.set_size_label : `${book.metadata.book_count} kitaplık set`}
          </div>
        )}
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
                  {pkg.price_kurus > 0 ? (
                    <>
                      <span className="text-xl font-bold text-indigo-700">{formatCommerceTry(pkg.price_kurus)}</span>
                      {pkg.compare_at_price_kurus && pkg.compare_at_price_kurus > pkg.price_kurus && (
                        <span className="ml-2 text-sm text-gray-400 line-through">{formatCommerceTry(pkg.compare_at_price_kurus)}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Fiyat yakında</span>
                  )}
                </div>
                {pkg.price_kurus > 0 && (
                  <button
                    onClick={() => handleAddPackage(pkg.id)}
                    disabled={addingId === pkg.id}
                    className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {addingId === pkg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                    Paketi Al
                  </button>
                )}
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

type StaffAction = 'recommend' | 'assign' | 'package';

function StaffActionModal({
  action,
  bookIds,
  bookTitles,
  onClose,
  onDone,
}: {
  action: StaffAction;
  bookIds: string[];
  bookTitles: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [rosterClasses, setRosterClasses] = useState<StaffRosterClass[]>([]);
  const [rosterStudents, setRosterStudents] = useState<StaffRosterStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classId, setClassId] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [assignmentType, setAssignmentType] = useState<'recommended' | 'required' | 'optional'>('recommended');
  const [notes, setNotes] = useState('');
  const [pkgName, setPkgName] = useState('');
  const [pkgDesc, setPkgDesc] = useState('');
  const [pkgPriceTl, setPkgPriceTl] = useState('');

  useEffect(() => {
    csStaffRoster()
      .then((r) => {
        setRosterClasses(r.classes ?? []);
        setRosterStudents(r.students ?? []);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoadingRoster(false));
  }, []);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLocaleLowerCase('tr');
    return rosterStudents.filter((s) => {
      if (classId && s.class_id !== classId) return false;
      if (classLevel && !studentMatchesClass(s.class_level, classLevel)) return false;
      if (!q) return true;
      return String(s.name || '').toLocaleLowerCase('tr').includes(q);
    });
  }, [rosterStudents, classId, classLevel, studentQuery]);

  const toggleStudent = (id: string) => {
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (action === 'package') {
        const name = pkgName.trim();
        if (!name) { toast.error('Paket adı gerekli'); return; }
        const priceTl = pkgPriceTl.trim();
        const price_kurus = priceTl ? Math.round(parseFloat(priceTl.replace(',', '.')) * 100) : 0;
        if (priceTl && (!Number.isFinite(price_kurus) || price_kurus < 0)) {
          toast.error('Geçerli bir fiyat yazın veya boş bırakın');
          return;
        }
        await csStaffCreatePackage({
          name,
          book_ids: bookIds,
          class_level: classLevel || undefined,
          description: pkgDesc.trim() || undefined,
          price_kurus: price_kurus || undefined,
        });
        toast.success(price_kurus > 0 ? 'Sınıf paketi oluşturuldu' : 'Paket oluşturuldu — fiyat girilmediği için “Fiyat yakında” görünür');
      } else if (action === 'recommend' && !classId && !classLevel && studentIds.length === 0) {
        await csStaffAssign({
          book_ids: bookIds,
          assignment_type: 'recommended',
          notes: notes.trim() || undefined,
        });
        toast.success('Kitap öğretmen önerilerine eklendi');
      } else {
        if (!classId && !classLevel && studentIds.length === 0) {
          toast.error('Sınıf, kademe veya öğrenci seçin');
          return;
        }
        const r = await csStaffAssign({
          book_ids: bookIds,
          student_ids: studentIds.length ? studentIds : undefined,
          class_id: classId || undefined,
          class_level: !classId && classLevel ? classLevel : undefined,
          assignment_type: action === 'recommend' ? 'recommended' : assignmentType,
          notes: notes.trim() || undefined,
        });
        toast.success(`${r.student_count} öğrenciye ${r.book_count} kitap atandı`);
      }
      onDone();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const title = action === 'package' ? 'Sınıf paketi oluştur' : action === 'recommend' ? 'Kitap öner' : 'Sınıfa / kişiye ata';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="text-xs text-gray-500 mb-3">
          {bookTitles.slice(0, 4).join(' · ')}
          {bookTitles.length > 4 ? ` +${bookTitles.length - 4}` : ''}
        </div>
        {loadingRoster ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>
        ) : (
          <div className="space-y-3">
            {action === 'package' && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Paket adı</label>
                  <input className="border rounded-lg px-3 py-2 text-sm w-full" value={pkgName} onChange={(e) => setPkgName(e.target.value)} placeholder="Örn. 8-F LGS seti" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Açıklama (opsiyonel)</label>
                  <textarea className="border rounded-lg px-3 py-2 text-sm w-full" rows={2} value={pkgDesc} onChange={(e) => setPkgDesc(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Paket fiyatı (₺) — boş = Fiyat yakında</label>
                  <input className="border rounded-lg px-3 py-2 text-sm w-full" inputMode="decimal" value={pkgPriceTl} onChange={(e) => setPkgPriceTl(e.target.value)} placeholder="Uydurma — yalnızca gerçek fiyat" />
                </div>
              </>
            )}
            {(action === 'assign' || action === 'package' || action === 'recommend') && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Sınıf (şube)</label>
                  <select className="border rounded-lg px-3 py-2 text-sm w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
                    <option value="">Şube seçme</option>
                    {rosterClasses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name || c.id}{c.class_level ? ` · ${c.class_level}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Kademe</label>
                  <select className="border rounded-lg px-3 py-2 text-sm w-full" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}>
                    <option value="">Tüm kademeler</option>
                    {['5', '6', '7', '8', 'LGS', '9', '10', '11', '12', 'TYT', 'AYT'].map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {action !== 'package' && (
              <>
                {action === 'assign' && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Atama tipi</label>
                    <select className="border rounded-lg px-3 py-2 text-sm w-full" value={assignmentType} onChange={(e) => setAssignmentType(e.target.value as typeof assignmentType)}>
                      <option value="recommended">Önerilen (alsın diye)</option>
                      <option value="required">Zorunlu</option>
                      <option value="optional">Opsiyonel</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Kişiye ata (opsiyonel)</label>
                  <input className="border rounded-lg px-3 py-2 text-sm w-full mb-2" placeholder="Öğrenci ara" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} />
                  <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                    {filteredStudents.slice(0, 80).map((s) => (
                      <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                        <span className="truncate">{s.name || s.id}</span>
                        {s.class_level && <span className="text-xs text-gray-400 ml-auto">{s.class_level}</span>}
                      </label>
                    ))}
                    {filteredStudents.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">Öğrenci yok</div>}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Not (opsiyonel)</label>
                  <input className="border rounded-lg px-3 py-2 text-sm w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                {action === 'recommend' && !classId && !classLevel && studentIds.length === 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Hedef seçilmezse kitap tüm mağazada “Öğretmen önerisi” olarak görünür.</p>
                )}
              </>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 text-sm py-2 rounded-lg">Vazgeç</button>
          <button type="button" onClick={submit} disabled={saving} className="flex-1 bg-indigo-600 text-white text-sm py-2 rounded-lg disabled:opacity-50">
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BrowseBox({
  title,
  subtitle,
  badge,
  selected,
  highlight,
  onClick,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  selected?: boolean;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border bg-white px-4 py-4 min-h-[7.5rem] transition-all ${
        selected
          ? 'border-indigo-600 bg-indigo-600 text-white shadow-md'
          : highlight
            ? 'border-indigo-300 ring-2 ring-indigo-100 hover:border-indigo-400'
            : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm'
      }`}
    >
      <div className={`text-base font-bold leading-tight ${selected ? 'text-white' : 'text-gray-900'}`}>{title}</div>
      {subtitle && (
        <div className={`text-xs mt-1.5 line-clamp-2 ${selected ? 'text-indigo-100' : 'text-gray-500'}`}>{subtitle}</div>
      )}
      {badge && (
        <span className={`inline-block mt-2.5 text-[11px] px-2 py-0.5 rounded-full ${
          selected ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Ana Sayfa ───────────────────────────────────────────────────────
export default function KitapMagazasiPage() {
  const [tab, setTab] = useState<Tab>('tum-kitaplar');
  const [offers, setOffers] = useState<OfferWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CatalogListParams>({});
  const [showFilter, setShowFilter] = useState(false);
  const [settings, setSettings] = useState<CommerceSettings | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [classes, setClasses] = useState<StoreBrowseClass[]>([]);
  const [categories, setCategories] = useState<StoreBrowseCategoryWithBooks[]>([]);
  const [activeClassKey, setActiveClassKey] = useState<string | null>(null);
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const navigate = useNavigate();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { effectiveUser, linkedStudent } = useAuth();
  const role = String(effectiveUser?.role || '');
  const staffRole = ['super_admin', 'admin', 'coach', 'teacher'].includes(role);
  const canBuy = ['student', 'super_admin', 'admin'].includes(role);
  const [viewMode, setViewMode] = useState<'list' | 'categories'>('categories');
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [staffAction, setStaffAction] = useState<StaffAction | null>(null);

  useEffect(() => {
    csGetSettings().then((r) => setSettings(r.settings)).catch(() => null);
  }, []);

  useEffect(() => {
    setBrowseLoading(true);
    csListBrowse()
      .then((r) => {
        setClasses(r.classes ?? []);
        setCategories(r.categories ?? []);
      })
      .catch(() => { setClasses([]); setCategories([]); })
      .finally(() => setBrowseLoading(false));
  }, []);

  useEffect(() => {
    if (!effectiveUser) { setCartCount(0); return; }
    csGetCart()
      .then((r) => setCartCount(r.items.reduce((n, i) => n + i.quantity, 0)))
      .catch(() => setCartCount(0));
  }, [effectiveUser]);

  const loadCatalog = useCallback(async (params: CatalogListParams) => {
    setLoading(true);
    try {
      const isRecommended = tab === 'onerilen';
      const r = await csListCatalog({
        ...params,
        teacher_recommended: isRecommended || params.teacher_recommended,
        limit: 96,
      });
      setOffers(r.offers ?? []);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => {
    const needList = tab === 'onerilen' || (tab === 'tum-kitaplar' && viewMode === 'list');
    if (!needList) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadCatalog({ ...filters, search: search || undefined });
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [tab, search, filters, loadCatalog, viewMode]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const activeClass = classes.find((c) => c.key === activeClassKey) ?? null;
  const classCategories = useMemo(
    () => (activeClassKey ? categories.filter((c) => categoryBelongsToClass(c, activeClassKey)) : []),
    [categories, activeClassKey]
  );
  const activeCategory = classCategories.find((c) => c.key === activeCategoryKey) ?? null;

  const freeShippingMsg = useMemo(() => {
    if (!settings) return null;
    const threshold = settings.free_shipping_threshold_kurus;
    if (threshold <= 0) return 'Kargo ücretsiz!';
    return `${formatCommerceTry(threshold)} üzeri alışverişlerde kargo bedava`;
  }, [settings]);

  const showCatalog = tab === 'tum-kitaplar' || tab === 'onerilen';

  const resetBrowse = () => {
    setActiveClassKey(null);
    setActiveCategoryKey(null);
  };

  const renderBrowse = () => {
    if (browseLoading) {
      return <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-indigo-400" /></div>;
    }

    const crumb = (
      <div className="flex flex-wrap items-center gap-1 text-sm mb-4">
        <button
          type="button"
          onClick={resetBrowse}
          className={`font-bold tracking-wide ${activeClass ? 'text-indigo-600 hover:underline' : 'text-gray-900'}`}
        >
          SINIFLAR
        </button>
        {activeClass && (
          <>
            <ChevronRight className="w-4 h-4 text-gray-300" />
            <button
              type="button"
              onClick={() => setActiveCategoryKey(null)}
              className={`font-semibold ${activeCategory ? 'text-indigo-600 hover:underline' : 'text-gray-900'}`}
            >
              {activeClass.label}
            </button>
          </>
        )}
        {activeCategory && (
          <>
            <ChevronRight className="w-4 h-4 text-gray-300" />
            <span className="font-semibold text-gray-900">{activeCategory.label}</span>
          </>
        )}
      </div>
    );

    if (!activeClass) {
      return (
        <div>
          {crumb}
          <p className="text-sm text-gray-500 mb-4">Sınıfını seç — ardından kitap kategorisi açılır.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {classes.map((cl) => (
              <BrowseBox
                key={cl.key}
                title={cl.label}
                subtitle={cl.category_count ? `${cl.category_count} kategori` : 'Kategori yakında'}
                badge={cl.book_count ? `${cl.book_count} kitap` : 'Yakında'}
                highlight={studentMatchesClass(linkedStudent?.classLevel, cl.key)}
                onClick={() => { setActiveClassKey(cl.key); setActiveCategoryKey(null); }}
              />
            ))}
          </div>
        </div>
      );
    }

    if (!activeCategory) {
      return (
        <div>
          {crumb}
          <p className="text-sm text-gray-500 mb-4">{activeClass.label} için bir kategori seç.</p>
          {classCategories.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Bu sınıf için henüz kategori yok.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {classCategories.map((cat) => (
                <BrowseBox
                  key={cat.key}
                  title={cat.label}
                  subtitle={cat.description || undefined}
                  badge={cat.book_count ? `${cat.book_count} kitap` : 'Yakında'}
                  onClick={() => setActiveCategoryKey(cat.key)}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div>
        {crumb}
        {activeCategory.books.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {activeCategory.books.map((b) => <CollectionBookCard key={b.id} book={b} />)}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{activeCategory.label} henüz ürün yok.</p>
          </div>
        )}
      </div>
    );
  };

  const renderSearchOrRecommended = () => {
    if (loading) {
      return <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-indigo-400" /></div>;
    }
    if (offers.length === 0) {
      return (
        <div className="text-center py-16 text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Kitap bulunamadı</p>
          {activeFilterCount > 0 && (
            <button onClick={() => setFilters({})} className="mt-2 text-sm text-indigo-600">Filtreleri temizle</button>
          )}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {offers.map((o) => (
          <BookCard
            key={o.id}
            offer={o}
            onCartChange={refreshCartCount}
            canBuy={canBuy}
            staffSelect={staffRole && (tab === 'tum-kitaplar' || tab === 'onerilen')}
            selected={selectedBookIds.includes(o.commerce_books.id)}
            onToggleSelect={(id) => setSelectedBookIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
          />
        ))}
      </div>
    );
  };

  const selectedTitles = offers
    .filter((o) => selectedBookIds.includes(o.commerce_books.id))
    .map((o) => o.commerce_books.title);

  const classChips = classes.length
    ? classes
    : [
        { key: '5', label: '5' }, { key: '6', label: '6' }, { key: '7', label: '7' },
        { key: '8', label: '8' }, { key: 'LGS', label: 'LGS' }, { key: '9', label: '9' },
        { key: '10', label: '10' }, { key: '11', label: '11' }, { key: '12', label: '12' },
        { key: 'TYT', label: 'TYT' }, { key: 'AYT', label: 'AYT' },
      ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
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
        {canBuy && (
          <button
            onClick={() => navigate('/sepet')}
            className="relative p-2.5 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">{cartCount}</span>
            )}
          </button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 mb-4 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSearch(''); setFilters({}); if (t.key === 'tum-kitaplar') resetBrowse(); }}
            className={`px-4 py-2 text-sm whitespace-nowrap rounded-t-lg transition-colors ${
              tab === t.key ? 'bg-indigo-50 text-indigo-700 font-semibold border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showCatalog && (
        <div className="mb-5 space-y-3">
          <div className="flex gap-2">
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
              Daha fazla
              {activeFilterCount > 0 && <span className="bg-white text-indigo-700 text-xs rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>}
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => { setFilters({ ...filters, class_level: undefined }); setActiveClassKey(null); setActiveCategoryKey(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                !filters.class_level ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Tüm sınıflar
            </button>
            {classChips.map((cl) => (
              <button
                key={cl.key}
                type="button"
                onClick={() => {
                  setFilters({ ...filters, class_level: cl.key });
                  setActiveClassKey(cl.key);
                  setActiveCategoryKey(null);
                  setViewMode('categories');
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                  filters.class_level === cl.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cl.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => { setFilters({ ...filters, series: undefined }); setActiveCategoryKey(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                !filters.series ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Tüm kategoriler
            </button>
            {STORE_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => {
                  setFilters({ ...filters, series: k.key });
                  setViewMode('list');
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                  filters.series === k.key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="border rounded-xl px-3 py-2 text-sm bg-white"
              value={filters.subject ?? ''}
              onChange={(e) => setFilters({ ...filters, subject: e.target.value || undefined })}
            >
              <option value="">Tüm dersler</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="border rounded-xl px-3 py-2 text-sm bg-white"
              value={filters.sort ?? 'newest'}
              onChange={(e) => setFilters({ ...filters, sort: e.target.value as CatalogListParams['sort'] })}
            >
              <option value="newest">Yeniden eskiye</option>
              <option value="price_asc">Fiyat: düşük → yüksek</option>
              <option value="price_desc">Fiyat: yüksek → düşük</option>
            </select>
            {tab === 'tum-kitaplar' && (
              <div className="flex rounded-xl border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1 px-3 py-2 text-xs font-medium ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}
                >
                  <List className="w-3.5 h-3.5" /> Liste
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('categories')}
                  className={`flex items-center gap-1 px-3 py-2 text-xs font-medium ${viewMode === 'categories' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Kategoriler
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {staffRole && (tab === 'tum-kitaplar' || tab === 'onerilen' || tab === 'paketler') && (
        <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3 py-3 flex flex-wrap items-center gap-2">
          <Users className="w-4 h-4 text-indigo-700" />
          <span className="text-xs text-indigo-800 font-medium">
            {selectedBookIds.length ? `${selectedBookIds.length} kitap seçili` : 'Kitap seç → öner, ata veya paket yap'}
          </span>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <button
              type="button"
              disabled={selectedBookIds.length !== 1}
              onClick={() => setStaffAction('recommend')}
              className="text-xs px-3 py-1.5 rounded-lg bg-yellow-400 text-yellow-950 font-medium disabled:opacity-40"
            >
              Tek kitap öner
            </button>
            <button
              type="button"
              disabled={selectedBookIds.length === 0}
              onClick={() => setStaffAction('assign')}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-40"
            >
              Sınıfa / kişiye ata
            </button>
            <button
              type="button"
              disabled={selectedBookIds.length === 0}
              onClick={() => setStaffAction('package')}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-800 font-medium disabled:opacity-40"
            >
              Sınıf paketi oluştur
            </button>
          </div>
        </div>
      )}

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

      {tab === 'paketler' ? (
        <PaketlerTab classLevel={filters.class_level} />
      ) : tab === 'atanmis' ? (
        <AtanmisTab />
      ) : tab === 'onerilen' || (tab === 'tum-kitaplar' && viewMode === 'list') ? (
        renderSearchOrRecommended()
      ) : (
        renderBrowse()
      )}

      {showFilter && (
        <FilterPanel filters={filters} onChange={setFilters} onClose={() => setShowFilter(false)} settings={settings} />
      )}
      {staffAction && (
        <StaffActionModal
          action={staffAction}
          bookIds={selectedBookIds}
          bookTitles={selectedTitles}
          onClose={() => setStaffAction(null)}
          onDone={() => { setSelectedBookIds([]); if (tab === 'onerilen' || viewMode === 'list') loadCatalog({ ...filters, search: search || undefined }); }}
        />
      )}
    </div>
  );
}
