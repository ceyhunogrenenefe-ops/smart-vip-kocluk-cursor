/**
 * Sepet Sayfası — /sepet
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Copy,
  CreditCard,
  Landmark,
  Loader2,
  MapPin,
  Minus,
  Plus,
  ShoppingCart,
  Tag,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  csApplyCoupon,
  csClearCart,
  csCheckoutIban,
  csCheckoutPrepare,
  csGetCart,
  csGetSettings,
  csRemoveFromCart,
  csUpdateCartItem,
  type CartItem,
} from '../../lib/commerceStoreApi';
import type { CommerceIbanPayment, CommerceSettings } from '../../types/commerce.types';
import { formatCommerceTry } from '../../types/commerce.types';
import { useAuth } from '../../context/AuthContext';

const FALLBACK_IBAN: CommerceIbanPayment = {
  enabled: true,
  holder: 'Songül Öğrenenefe',
  iban: 'TR870003200000000066792070',
  note: 'Ödemeyi buraya yapabilirsiniz',
};

function formatIbanDisplay(iban: string) {
  return String(iban || '').replace(/[\s-]+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

export default function SepetPage() {
  const navigate = useNavigate();
  const { effectiveUser } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [settings, setSettings] = useState<CommerceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ id: string; code: string; discount_type: string; discount_value: number; max_discount_kurus: number | null; min_order_kurus: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [payMethod, setPayMethod] = useState<'card' | 'iban'>('card');
  const [ibanReceipt, setIbanReceipt] = useState<File | null>(null);
  const [ibanDone, setIbanDone] = useState<{ order_number: string; total_kurus: number; receipt_url: string } | null>(null);
  const [ship, setShip] = useState({
    name: '',
    phone: '',
    email: '',
    line1: '',
    line2: '',
    district: '',
    city: '',
    notes: '',
  });

  useEffect(() => {
    if (!effectiveUser) return;
    setShip((prev) => ({
      ...prev,
      name: prev.name || String(effectiveUser.name || ''),
      email: prev.email || String(effectiveUser.email || ''),
      phone: prev.phone || String(effectiveUser.phone || ''),
    }));
  }, [effectiveUser]);

  useEffect(() => {
    if (!effectiveUser) return;
    Promise.all([csGetCart(), csGetSettings()])
      .then(([cartRes, settingsRes]) => {
        setItems(cartRes.items);
        setSettings(settingsRes.settings);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [effectiveUser]);

  const subtotal = useMemo(() => items.reduce((s, i) => {
    const price = i.commerce_vendor_offers?.price_kurus ?? i.price_kurus_snapshot;
    return s + price * i.quantity;
  }, 0), [items]);

  const shippingCost = useMemo(() => {
    if (!settings) return 0;
    if (settings.free_shipping_threshold_kurus > 0 && subtotal >= settings.free_shipping_threshold_kurus) return 0;
    return settings.default_shipping_kurus;
  }, [settings, subtotal]);

  const discountAmount = useMemo(() => {
    if (!coupon) return 0;
    if (subtotal < coupon.min_order_kurus) return 0;
    let disc = coupon.discount_type === 'percent'
      ? Math.round(subtotal * coupon.discount_value / 100)
      : coupon.discount_value;
    if (coupon.max_discount_kurus) disc = Math.min(disc, coupon.max_discount_kurus);
    return Math.max(0, Math.min(disc, subtotal));
  }, [coupon, subtotal]);

  const total = subtotal + shippingCost - discountAmount;
  const ibanAccount = settings?.iban_payment?.iban ? settings.iban_payment : FALLBACK_IBAN;
  const ibanEnabled = ibanAccount.enabled !== false;

  const handleUpdateQty = async (itemId: string, qty: number) => {
    setUpdatingId(itemId);
    try {
      const r = await csUpdateCartItem(itemId, qty);
      setItems(r.items);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setUpdatingId(null); }
  };

  const handleRemove = async (itemId: string) => {
    setUpdatingId(itemId);
    try {
      const r = await csRemoveFromCart(itemId);
      setItems(r.items);
      toast.success('Ürün sepetten çıkarıldı');
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setUpdatingId(null); }
  };

  const shippingPayload = () => ({
    customer_name: ship.name.trim(),
    customer_phone: ship.phone.trim(),
    customer_email: ship.email.trim(),
    notes: ship.notes.trim(),
    address: {
      full_name: ship.name.trim(),
      phone: ship.phone.trim(),
      address_line1: ship.line1.trim(),
      address_line2: ship.line2.trim() || undefined,
      district: ship.district.trim() || undefined,
      city: ship.city.trim(),
    },
  });

  const assertShipReady = () => {
    if (ship.name.trim().length < 3) {
      toast.error('Kargo için veli adı soyadı girin');
      return false;
    }
    if (ship.phone.replace(/\D/g, '').length < 10) {
      toast.error('Kargo için geçerli telefon girin');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ship.email.trim())) {
      toast.error('Kargo için geçerli e-posta girin');
      return false;
    }
    if (!ship.line1.trim() || !ship.city.trim()) {
      toast.error('Kitap kargosu için teslimat adresi ve il girin');
      return false;
    }
    return true;
  };

  /** Kart: teslimat adresi /odeme/kitap sayfasında istenir. */
  const handleCheckout = async () => {
    if (items.some((i) => i.out_of_stock) || items.length === 0) return;
    setCheckoutLoading(true);
    try {
      const studentId = (effectiveUser as { student_id?: string })?.student_id ?? null;
      const prepared = await csCheckoutPrepare(coupon?.code ?? null, studentId);
      window.location.href = prepared.checkout_url;
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Ödeme başlatılamadı');
      setCheckoutLoading(false);
    }
  };

  const copyIban = async () => {
    try {
      await navigator.clipboard.writeText(ibanAccount.iban.replace(/\s+/g, ''));
      toast.success('IBAN kopyalandı');
    } catch {
      toast.error('IBAN kopyalanamadı — elle seçin');
    }
  };

  const handleIbanPay = async () => {
    if (!assertShipReady()) return;
    if (!ibanReceipt) {
      toast.error('Havale dekontunu ekleyin');
      return;
    }
    setCheckoutLoading(true);
    try {
      const studentId = (effectiveUser as { student_id?: string })?.student_id ?? null;
      const file_base64 = await fileToDataUrl(ibanReceipt);
      const paid = await csCheckoutIban({
        file_base64,
        mime_type: ibanReceipt.type || 'image/jpeg',
        coupon_code: coupon?.code ?? null,
        student_id: studentId,
        ...shippingPayload(),
      });
      setItems([]);
      setCoupon(null);
      setIbanReceipt(null);
      setIbanDone({
        order_number: paid.order_number,
        total_kurus: paid.total_kurus,
        receipt_url: paid.receipt_url,
      });
      toast.success(`Ödeme tamamlandı · ${paid.order_number}`);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'IBAN ödemesi tamamlanamadı');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleClearCart = async () => {
    if (!confirm('Sepeti tamamen boşaltmak istediğinize emin misiniz?')) return;
    try {
      await csClearCart();
      setItems([]);
      setCoupon(null);
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const r = await csApplyCoupon(couponCode);
      if (r.ok && r.coupon) {
        if (subtotal < r.coupon.min_order_kurus) {
          setCouponError(`Bu kupon için minimum sipariş tutarı ${formatCommerceTry(r.coupon.min_order_kurus)}`);
        } else {
          setCoupon(r.coupon);
          toast.success(`Kupon uygulandı: ${r.coupon.code}`);
        }
      } else {
        setCouponError(r.error ?? 'Geçersiz kupon');
      }
    } catch (e: unknown) { setCouponError((e as Error).message); }
    finally { setCouponLoading(false); }
  };

  if (!effectiveUser) return (
    <div className="p-6 text-center text-gray-500">
      <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="mb-3">Sepetinizi görmek için giriş yapın</p>
      <button onClick={() => navigate('/login')} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm">Giriş Yap</button>
    </div>
  );

  if (loading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin w-8 h-8 text-indigo-400" /></div>;

  if (items.length === 0 && ibanDone) return (
    <div className="p-6 text-center max-w-md mx-auto mt-10">
      <CheckCircle2 className="w-14 h-14 mx-auto mb-4 text-emerald-500" />
      <h2 className="text-lg font-semibold text-gray-800 mb-2">IBAN ödemesi tamamlandı</h2>
      <p className="text-sm text-gray-600 mb-1">Sipariş no: <b>{ibanDone.order_number}</b></p>
      <p className="text-sm text-gray-600 mb-5">Tutar: <b>{formatCommerceTry(ibanDone.total_kurus)}</b></p>
      <button onClick={() => navigate('/kitap-magazasi')} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700">
        Mağazaya dön
      </button>
    </div>
  );

  if (items.length === 0) return (
    <div className="p-6 text-center text-gray-400 max-w-md mx-auto mt-10">
      <ShoppingCart className="w-14 h-14 mx-auto mb-4 opacity-30" />
      <h2 className="text-lg font-semibold text-gray-600 mb-2">Sepetiniz boş</h2>
      <p className="text-sm mb-5">Kitap mağazasından ürün ekleyebilirsiniz.</p>
      <button onClick={() => navigate('/kitap-magazasi')} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700">
        Mağazaya Git
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Sepetim</h1>
        <span className="text-sm text-gray-400">({items.length} ürün)</span>
        <button onClick={handleClearCart} className="ml-auto text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
          <Trash2 className="w-3.5 h-3.5" /> Sepeti Temizle
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sepet ürünleri */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => {
            const offer = item.commerce_vendor_offers;
            const pkg = item.commerce_book_packages;
            const book = offer?.commerce_books;
            const title = book?.title ?? pkg?.name ?? item.title_snapshot ?? '—';
            const vendorName = offer?.commerce_vendors?.name ?? '';
            const currentPrice = offer?.price_kurus ?? item.price_kurus_snapshot;
            const coverUrl = book?.cover_image_url ?? pkg?.cover_image_url ?? null;

            return (
              <div key={item.id} className={`bg-white border rounded-xl p-3 flex gap-3 ${item.out_of_stock ? 'border-red-300 bg-red-50' : item.price_changed ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`}>
                <div className="w-14 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {coverUrl ? (
                    <img src={coverUrl} alt={title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><BookOpen className="w-6 h-6 text-gray-300" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm leading-tight">{title}</div>
                  {vendorName && <div className="text-xs text-gray-400 mt-0.5">{vendorName}</div>}
                  {item.out_of_stock && (
                    <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                      <AlertCircle className="w-3 h-3" /> Stok tükendi
                    </div>
                  )}
                  {item.price_changed && !item.out_of_stock && (
                    <div className="flex items-center gap-1 text-xs text-yellow-700 mt-1">
                      <AlertCircle className="w-3 h-3" /> Fiyat güncellendi: {formatCommerceTry(currentPrice)}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {!pkg && (
                      <div className="flex items-center border border-gray-200 rounded-lg">
                        <button
                          className="px-2 py-1 text-gray-500 hover:text-gray-700 disabled:opacity-40"
                          disabled={item.quantity <= 1 || updatingId === item.id}
                          onClick={() => handleUpdateQty(item.id, item.quantity - 1)}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 text-sm min-w-[1.5rem] text-center">
                          {updatingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : item.quantity}
                        </span>
                        <button
                          className="px-2 py-1 text-gray-500 hover:text-gray-700 disabled:opacity-40"
                          disabled={updatingId === item.id}
                          onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <span className="font-bold text-indigo-700">{formatCommerceTry(currentPrice * item.quantity)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(item.id)}
                  disabled={updatingId === item.id}
                  className="text-gray-300 hover:text-red-400 flex-shrink-0 self-start mt-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Sipariş özeti */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 sticky top-4">
            <h2 className="font-semibold text-gray-800 mb-4">Sipariş Özeti</h2>

            {/* Kupon */}
            <div className="mb-4">
              {coupon ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm text-green-700 font-medium flex-1">{coupon.code}</span>
                  <button onClick={() => setCoupon(null)} className="text-green-400 hover:text-green-600"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        className="pl-8 pr-3 py-2 border rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400 uppercase"
                        placeholder="Kupon kodu"
                        value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                      />
                    </div>
                    <button
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="text-sm bg-gray-800 text-white px-3 rounded-lg disabled:opacity-40"
                    >
                      {couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Uygula'}
                    </button>
                  </div>
                  {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
                </div>
              )}
            </div>

            {/* Fiyat kırılımı */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Ara Toplam</span>
                <span>{formatCommerceTry(subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Kargo</span>
                <span className={shippingCost === 0 ? 'text-green-600 font-medium' : ''}>
                  {shippingCost === 0 ? 'Ücretsiz' : formatCommerceTry(shippingCost)}
                </span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Kupon İndirimi</span>
                  <span>-{formatCommerceTry(discountAmount)}</span>
                </div>
              )}
              {settings && settings.free_shipping_threshold_kurus > 0 && shippingCost > 0 && (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                  {formatCommerceTry(settings.free_shipping_threshold_kurus - subtotal)} daha ekleyin, kargo bedava!
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-base text-gray-900">
                <span>Toplam</span>
                <span className="text-indigo-700">{formatCommerceTry(total)}</span>
              </div>
            </div>

            {/* Stok/fiyat uyarısı */}
            {items.some((i) => i.out_of_stock || i.price_changed) && (
              <div className="mt-3 flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-700">Bazı ürünlerde stok/fiyat değişikliği var. Lütfen kontrol edin.</p>
              </div>
            )}

            {ibanEnabled && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayMethod('card')}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 ${
                    payMethod === 'card' ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" /> Kart ile öde
                </button>
                <button
                  type="button"
                  onClick={() => setPayMethod('iban')}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 ${
                    payMethod === 'iban' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" /> IBAN ile öde
                </button>
              </div>
            )}

            {payMethod === 'iban' && ibanEnabled ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                    <MapPin className="w-3.5 h-3.5" /> Teslimat adresi (kargo) *
                  </div>
                  <p className="text-[11px] text-amber-800">
                    IBAN ödemesinde adres burada alınır. Kitapçı bu adrese gönderir.
                  </p>
                  <input
                    className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                    placeholder="Veli adı soyadı *"
                    value={ship.name}
                    onChange={(e) => setShip({ ...ship, name: e.target.value })}
                    autoComplete="name"
                  />
                  <input
                    className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                    placeholder="Telefon *"
                    value={ship.phone}
                    onChange={(e) => setShip({ ...ship, phone: e.target.value })}
                    autoComplete="tel"
                  />
                  <input
                    className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                    type="email"
                    placeholder="E-posta *"
                    value={ship.email}
                    onChange={(e) => setShip({ ...ship, email: e.target.value })}
                    autoComplete="email"
                  />
                  <input
                    className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                    placeholder="Mahalle, cadde, kapı no *"
                    value={ship.line1}
                    onChange={(e) => setShip({ ...ship, line1: e.target.value })}
                    autoComplete="street-address"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                      placeholder="İlçe"
                      value={ship.district}
                      onChange={(e) => setShip({ ...ship, district: e.target.value })}
                    />
                    <input
                      className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                      placeholder="İl *"
                      value={ship.city}
                      onChange={(e) => setShip({ ...ship, city: e.target.value })}
                      autoComplete="address-level1"
                    />
                  </div>
                  <textarea
                    className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                    rows={2}
                    placeholder="Kapı kodu, öğrenci adı (isteğe bağlı)"
                    value={ship.notes}
                    onChange={(e) => setShip({ ...ship, notes: e.target.value })}
                  />
                </div>
                <p className="text-xs text-emerald-900 font-medium">{ibanAccount.note}</p>
                <div className="text-sm text-gray-800">
                  <div className="text-xs text-gray-500">Alıcı</div>
                  <div className="font-semibold">{ibanAccount.holder}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">IBAN</div>
                  <button
                    type="button"
                    onClick={copyIban}
                    className="w-full flex items-center justify-between gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-left"
                  >
                    <span className="font-mono text-xs font-semibold tracking-wide text-gray-900">
                      {formatIbanDisplay(ibanAccount.iban)}
                    </span>
                    <Copy className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                  </button>
                </div>
                <div className="text-xs text-gray-600">
                  Tutar: <b className="text-emerald-800">{formatCommerceTry(total)}</b>
                </div>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Havale dekontu (fotoğraf veya PDF)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="mt-1 block w-full text-xs"
                    onChange={(e) => setIbanReceipt(e.target.files?.[0] || null)}
                  />
                </label>
                {ibanReceipt && (
                  <p className="text-xs text-emerald-800 truncate">Seçilen: {ibanReceipt.name}</p>
                )}
                <button
                  type="button"
                  onClick={handleIbanPay}
                  disabled={checkoutLoading || items.some((i) => i.out_of_stock) || items.length === 0 || !ibanReceipt}
                  className="w-full bg-emerald-700 text-white py-3 rounded-xl font-semibold text-sm hover:bg-emerald-800 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
                >
                  {checkoutLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Upload className="w-4 h-4" />
                  {checkoutLoading ? 'Dekont gönderiliyor…' : 'Dekontu gönder — ödemeyi tamamla'}
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={checkoutLoading || items.some((i) => i.out_of_stock) || items.length === 0}
                  className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {checkoutLoading ? (
                    <span className="inline-flex items-center gap-2 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" /> Sipariş hazırlanıyor…
                    </span>
                  ) : (
                    'Ödemeye Geç'
                  )}
                </button>
                <p className="text-xs text-gray-400 text-center mt-3">
                  Teslimat adresi ödeme sayfasında istenir · PayTR / Garanti
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
