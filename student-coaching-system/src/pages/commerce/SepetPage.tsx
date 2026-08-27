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
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  csApplyCoupon,
  csClearCart,
  csCheckoutPrepare,
  csGetCart,
  csGetSettings,
  csRemoveFromCart,
  csUpdateCartItem,
  type CartItem,
} from '../../lib/commerceStoreApi';
import type { CommerceSettings } from '../../types/commerce.types';
import { formatCommerceTry } from '../../types/commerce.types';
import { useAuth } from '../../context/AuthContext';

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

  /** Pending sipariş + imzalı token → onlinevipdershane.com ödeme */
  const handleCheckout = async () => {
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

            {/* Ödemeye geç — onlinevipdershane.com'a yönlendir */}
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading || items.some((i) => i.out_of_stock) || items.length === 0}
              className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
            >
              {checkoutLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {checkoutLoading ? 'Sipariş hazırlanıyor…' : 'Ödemeye Geç'}
            </button>

            <p className="text-xs text-gray-400 text-center mt-3">
              onlinevipdershane.com güvenli ödeme
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
