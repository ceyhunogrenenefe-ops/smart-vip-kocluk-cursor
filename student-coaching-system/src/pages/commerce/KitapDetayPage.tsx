/**
 * Kitap Detay Sayfası — /kitap-magazasi/:slug
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Loader2,
  Package,
  ShoppingCart,
  Star,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { csAddToCart, csGetBook, csMarkOwned } from '../../lib/commerceStoreApi';
import type { CommerceBook, CommerceVendorOffer } from '../../types/commerce.types';
import { formatCommerceTry } from '../../types/commerce.types';
import { useAuth } from '../../context/AuthContext';

export default function KitapDetayPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { effectiveUser } = useAuth();

  const [book, setBook] = useState<(CommerceBook & { commerce_vendor_offers: (CommerceVendorOffer & { commerce_vendors: { id: string; name: string } })[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [addingCart, setAddingCart] = useState(false);
  const [markingOwned, setMarkingOwned] = useState(false);
  const [owned, setOwned] = useState(false);
  const [cartAdded, setCartAdded] = useState(false);

  useEffect(() => {
    if (!slug) return;
    csGetBook(slug)
      .then((r) => {
        setBook(r.book);
        const offers = r.book.commerce_vendor_offers ?? [];
        if (offers.length > 0) setSelectedOfferId(offers[0].id);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const selectedOffer = book?.commerce_vendor_offers?.find((o) => o.id === selectedOfferId) ?? null;

  const handleAddToCart = async () => {
    if (!effectiveUser) { toast.error('Sepete eklemek için giriş yapın'); return; }
    if (!selectedOfferId) return;
    setAddingCart(true);
    try {
      await csAddToCart(selectedOfferId, undefined, 1);
      setCartAdded(true);
      toast.success('Sepete eklendi');
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setAddingCart(false); }
  };

  const handleMarkOwned = async () => {
    if (!effectiveUser) { toast.error('Giriş yapın'); return; }
    if (!book) return;
    setMarkingOwned(true);
    try {
      await csMarkOwned(book.id, selectedOfferId ?? undefined);
      setOwned(true);
      toast.success('Kitap Takibi\'ne "Sahip Olunuyor" olarak eklendi');
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setMarkingOwned(false); }
  };

  if (loading) return (
    <div className="flex justify-center items-center min-h-64">
      <Loader2 className="animate-spin w-8 h-8 text-indigo-400" />
    </div>
  );

  if (!book) return (
    <div className="p-6 text-center text-gray-400">
      <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-30" />
      <p>Kitap bulunamadı</p>
      <button onClick={() => navigate(-1)} className="mt-3 text-sm text-indigo-600">Geri Dön</button>
    </div>
  );

  const hasOffers = book.commerce_vendor_offers.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Geri */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft className="w-4 h-4" /> Mağazaya Dön
      </button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Sol — Kitap kapağı */}
        <div className="md:col-span-1">
          <div className="aspect-[3/4] bg-gray-100 rounded-2xl overflow-hidden shadow-md">
            {book.cover_image_url ? (
              <img src={book.cover_image_url} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <BookOpen className="w-16 h-16 text-gray-300" />
              </div>
            )}
          </div>
          {book.page_count && (
            <div className="mt-3 text-center text-sm text-gray-500">{book.page_count} sayfa</div>
          )}
        </div>

        {/* Sağ — Detaylar */}
        <div className="md:col-span-2">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{book.title}</h1>
          {book.subtitle && <p className="text-gray-500 mt-1">{book.subtitle}</p>}
          {book.author && <p className="text-base text-gray-600 mt-1">✍️ {book.author}</p>}
          {book.publisher && <p className="text-sm text-gray-400 mt-0.5">🏛️ {book.publisher}</p>}

          {/* Sınıf & Ders */}
          <div className="flex flex-wrap gap-2 mt-3">
            {(book.class_levels ?? []).map((cl) => (
              <span key={cl} className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                {cl === 'LGS' ? 'LGS' : /^\d+$/.test(cl) ? `${cl}. Sınıf` : cl}
              </span>
            ))}
            {book.subject && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{book.subject}</span>}
            {typeof book.metadata?.fascicle_count === 'number' && (
              <span className="bg-violet-100 text-violet-700 text-xs px-2 py-0.5 rounded-full">{book.metadata.fascicle_count} fasikül</span>
            )}
            {book.metadata?.is_set === true && (
              <span className="bg-violet-100 text-violet-700 text-xs px-2 py-0.5 rounded-full">
                {typeof book.metadata.set_size_label === 'string'
                  ? book.metadata.set_size_label
                  : typeof book.metadata.book_count === 'number'
                    ? `${book.metadata.book_count} kitaplık set`
                    : 'Kitap seti'}
              </span>
            )}
          </div>

          {Array.isArray(book.metadata?.set_contents) && book.metadata.set_contents.length > 0 && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Set içeriği</h3>
              <ul className="space-y-1.5">
                {(book.metadata.set_contents as unknown[]).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{String(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Açıklama */}
          {book.description && (
            <p className="mt-4 text-sm text-gray-600 leading-relaxed whitespace-pre-line">{book.description}</p>
          )}

          {/* Teklifler */}
          {hasOffers ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Satıcılar</h3>
              <div className="space-y-2">
                {book.commerce_vendor_offers.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setSelectedOfferId(o.id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                      selectedOfferId === o.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selectedOfferId === o.id ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'}`}>
                      {selectedOfferId === o.id && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{o.commerce_vendors.name}</span>
                        <span className="text-lg font-bold text-indigo-700">{formatCommerceTry(o.price_kurus)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          Stok: {o.stock_quantity > 0 ? o.stock_quantity : 'Yok'}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          {o.shipping_days} iş günü
                        </span>
                        {o.teacher_recommended && (
                          <span className="text-xs text-yellow-600 flex items-center gap-0.5">
                            <Star className="w-3 h-3" /> Önerilen
                          </span>
                        )}
                      </div>
                      {o.compare_at_price_kurus && o.compare_at_price_kurus > o.price_kurus && (
                        <div className="text-xs text-gray-400 line-through">{formatCommerceTry(o.compare_at_price_kurus)}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Sepete Ekle */}
              <div className="mt-5 flex gap-3 flex-wrap">
                <button
                  onClick={handleAddToCart}
                  disabled={addingCart || !selectedOffer || selectedOffer.stock_quantity === 0}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {addingCart ? <Loader2 className="w-5 h-5 animate-spin" /> : cartAdded ? <CheckCircle2 className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
                  {cartAdded ? 'Sepete Eklendi' : selectedOffer?.stock_quantity === 0 ? 'Stok Yok' : 'Sepete Ekle'}
                </button>
                <button
                  onClick={handleMarkOwned}
                  disabled={markingOwned || owned}
                  className="flex items-center gap-1.5 border border-gray-300 text-gray-600 px-4 py-3 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {markingOwned ? <Loader2 className="w-4 h-4 animate-spin" /> : owned ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <BookOpen className="w-4 h-4" />}
                  {owned ? 'Kitap takibinde' : 'Bu kitap bende var'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-center">
              Bu kitap Yankı Kitapevi kataloğunda. Fiyat yayına alınınca sepete eklenebilir.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
