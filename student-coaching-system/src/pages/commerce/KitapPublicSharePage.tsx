/**
 * Veli paylaşım sayfası — giriş yok.
 * /kitap/paket/:slug | /kitap/urun/:slug
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Loader2, Package, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { csBuyNow, csGetBook, csGetPackage } from '../../lib/commerceStoreApi';
import type { CommerceBookPackage } from '../../types/commerce.types';
import { formatCommerceTry } from '../../types/commerce.types';
import BookCoverImage from '../../components/commerce/BookCoverImage';

type Mode = 'package' | 'book';

type PackageItemRow = {
  quantity?: number;
  is_required?: boolean;
  commerce_books?: {
    title?: string | null;
    cover_image_url?: string | null;
  } | null;
};

function packageItemsOf(pkg: CommerceBookPackage): PackageItemRow[] {
  return ((pkg as unknown as { commerce_book_package_items?: PackageItemRow[] }).commerce_book_package_items ?? []);
}

export default function KitapPublicSharePage({ mode }: { mode: Mode }) {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  const [pkg, setPkg] = useState<CommerceBookPackage | null>(null);
  const [book, setBook] = useState<Awaited<ReturnType<typeof csGetBook>>['book'] | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        if (mode === 'package') {
          const r = await csGetPackage(slug);
          if (!cancelled) setPkg(r.package);
        } else {
          const r = await csGetBook(slug);
          if (!cancelled) setBook(r.book);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, mode]);

  const offer = useMemo(() => {
    const offers = book?.commerce_vendor_offers ?? [];
    const approved = offers.filter((o) => o.status === 'approved' && Number(o.price_kurus) > 0);
    return approved[0] || offers[0] || null;
  }, [book]);

  const title = mode === 'package' ? pkg?.name : book?.title;
  const price =
    mode === 'package'
      ? Number(pkg?.price_kurus || 0)
      : Number(offer?.price_kurus || 0);
  const compare =
    mode === 'package'
      ? Number(pkg?.compare_at_price_kurus || 0)
      : Number(offer?.compare_at_price_kurus || 0);
  const items = pkg ? packageItemsOf(pkg) : [];
  const canBuy = Boolean(title) && price > 0 && (mode === 'package' ? Boolean(pkg?.id) : Boolean(offer?.id));

  const handleBuy = async () => {
    if (!canBuy) return;
    setBuying(true);
    try {
      const r = await csBuyNow(
        mode === 'package'
          ? { package_id: pkg!.id }
          : { vendor_offer_id: offer!.id }
      );
      if (!r.checkout_url) throw new Error('Ödeme linki oluşmadı');
      window.location.assign(r.checkout_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Satın alma başlatılamadı');
      setBuying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Online VIP Dershane</p>
            <h1 className="text-lg font-bold">Kitap Mağazası</h1>
          </div>
          <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-indigo-700">
            Giriş
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-800">
            {error}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-br from-indigo-50 to-white px-5 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                  {mode === 'package' ? <Package className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    {mode === 'package' ? 'Sınıf paketi' : 'Kitap'}
                  </p>
                  <h2 className="mt-0.5 text-xl font-bold leading-snug text-slate-900">{title}</h2>
                  {mode === 'package' && pkg?.class_level ? (
                    <p className="mt-1 text-sm text-slate-500">Kademe: {pkg.class_level}</p>
                  ) : null}
                  {mode === 'book' && book?.author ? (
                    <p className="mt-1 text-sm text-slate-500">{book.author}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              {mode === 'book' ? (
                <div className="mx-auto w-40 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                  <BookCoverImage
                    src={book?.cover_image_url}
                    alt={book?.title || 'Kitap'}
                    className="aspect-[3/4] w-full"
                    fit="contain"
                  />
                </div>
              ) : null}

              {mode === 'package' && pkg?.description ? (
                <p className="text-sm leading-relaxed text-slate-600">{pkg.description}</p>
              ) : null}

              {mode === 'package' && items.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Paket içeriği</p>
                  <ul className="space-y-2">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                        {item.commerce_books?.cover_image_url ? (
                          <img
                            src={item.commerce_books.cover_image_url}
                            alt=""
                            className="h-8 w-6 rounded object-cover"
                          />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{item.commerce_books?.title || '—'}</span>
                        {(item.quantity || 1) > 1 ? (
                          <span className="text-xs text-slate-400">×{item.quantity}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tutar</p>
                  {price > 0 ? (
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-indigo-700">{formatCommerceTry(price)}</span>
                      {compare > price ? (
                        <span className="text-sm text-slate-400 line-through">{formatCommerceTry(compare)}</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-amber-700">Fiyat yakında</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!canBuy || buying}
                  onClick={() => void handleBuy()}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {buying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  Satın Al
                </button>
              </div>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                Satın Al’a basınca güvenli ödeme sayfasına gidersiniz. Giriş gerekmez; veli bilgileri ve teslimat adresi ödeme adımında alınır.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
