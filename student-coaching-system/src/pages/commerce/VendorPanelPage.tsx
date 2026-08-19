/**
 * Satıcı (vendor_admin) paneli
 * Sekmeler: Genel Bakış | Kitaplarım | Tekliflerim | Siparişlerim | Hakedişlerim
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  cvAcceptOrder,
  cvGetStats,
  cvListOffers,
  cvListOrders,
  cvListPayouts,
  cvMarkPreparing,
  cvShipOrder,
  cvSubmitOffer,
  type VendorStats,
} from '../../lib/commerceVendorApi';
import type {
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

// ── Tekliflerim ────────────────────────────────────────────────────────
function Tekliflerim() {
  const [offers, setOffers] = useState<CommerceVendorOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

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
          <button className="flex items-center gap-1 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Yeni Teklif
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {offers.map((o) => {
          const book = o.book as { title?: string; isbn?: string | null; cover_image_url?: string | null } | null;
          const canSubmit = ['draft', 'correction_requested', 'rejected'].includes(o.status);
          const canEdit = canSubmit;
          const isLowStock = o.stock_quantity <= o.low_stock_threshold;
          return (
            <div key={o.id} className={`border rounded-xl p-4 ${isLowStock && o.status === 'approved' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex gap-3">
                {book?.cover_image_url ? (
                  <img src={book.cover_image_url} alt={book?.title} className="w-12 h-16 object-cover rounded shadow-sm flex-shrink-0" />
                ) : (
                  <div className="w-12 h-16 bg-gray-100 rounded flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium truncate">{book?.title ?? '—'}</div>
                    <OfferStatusBadge status={o.status} />
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">ISBN: {book?.isbn ?? '—'}</div>
                  <div className="mt-2 flex gap-4 text-sm flex-wrap">
                    <div><span className="text-gray-500">Fiyat:</span> <strong>{formatCommerceTry(o.price_kurus)}</strong></div>
                    <div className={`${isLowStock ? 'text-red-700 font-semibold' : ''}`}>
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
                  <div className="mt-3 flex gap-2">
                    {canEdit && (
                      <button className="flex items-center gap-1 text-xs border border-gray-300 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-50">
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
            <p className="text-sm">Henüz teklif oluşturmadınız</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Siparişlerim ───────────────────────────────────────────────────────
function Siparislerim() {
  const [orders, setOrders] = useState<CommerceVendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [shipModal, setShipModal] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await cvListOrders({ status: filterStatus || undefined });
      setOrders(r.vendor_orders);
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

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-3">
        <h2 className="text-lg font-semibold">Siparişlerim</h2>
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
          const order = (vo as unknown as { commerce_orders?: { order_number?: string; customer_name?: string; customer_phone?: string } }).commerce_orders;
          const items = (vo as unknown as { commerce_order_items?: { title_snapshot: string; quantity: number; unit_price_kurus: number }[] }).commerce_order_items ?? [];
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
  const [tab, setTab] = useState<Tab>('genel');

  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as Tab;
    if (TABS.some((t) => t.key === hash)) setTab(hash);
  }, []);

  const roles = [(effectiveUser?.role ?? ''), ...((effectiveUser as { roles?: string[] })?.roles ?? [])];
  const hasAccess = roles.includes('vendor_admin') || roles.includes('super_admin');
  if (!hasAccess) {
    return <div className="p-6 text-gray-500">Bu sayfaya erişim yetkiniz yok.</div>;
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
