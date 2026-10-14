import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Link2, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  caListUnassignedOrders,
  caOwnerCandidates,
  caSetOrderOwner,
  type OwnerCandidate,
  type SahipsizSiparis,
} from '../../lib/commerceAdminApi';
import { COMMERCE_ORDER_STATUS_LABELS, formatCommerceTry } from '../../types/commerce.types';

/**
 * Sahipsiz siparişler — hiçbir kurumun Mağaza ekranından ulaşılamayanlar.
 *
 * Bir sipariş buraya düşüyorsa: öğrenciye bağlı değil, kurumu yazılmamış
 * ve müşteri e-postası/telefonu sistemdeki hiçbir öğrenci veya kullanıcıyla
 * eşleşmiyor. Sistem bunları tahminle bir kuruma yazmaz — yanlış kuruma
 * ciro yazmak olurdu. Yönetici burada elle bağlar.
 *
 * Ölçüldü: 132 siparişin 22'si böyleydi, 5'i ödenmiş/onaylı gerçek para.
 */
export default function SahipsizSiparislerPanel() {
  const [orders, setOrders] = useState<SahipsizSiparis[]>([]);
  const [paidCount, setPaidCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [acik, setAcik] = useState(false);
  const [aktifId, setAktifId] = useState<string | null>(null);
  const [arama, setArama] = useState('');
  const [adaylar, setAdaylar] = useState<OwnerCandidate[]>([]);
  const [araniyor, setAraniyor] = useState(false);
  const [bagliyor, setBagliyor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await caListUnassignedOrders();
      setOrders(r.orders || []);
      setPaidCount(r.paid_count || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sahipsiz siparişler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Arama yazarken her tuşta istek atmasın
  useEffect(() => {
    if (!aktifId || arama.trim().length < 2) {
      setAdaylar([]);
      return;
    }
    let iptal = false;
    const z = setTimeout(() => {
      setAraniyor(true);
      void caOwnerCandidates(arama.trim())
        .then((r) => {
          if (!iptal) setAdaylar(r.students || []);
        })
        .catch(() => {
          if (!iptal) setAdaylar([]);
        })
        .finally(() => {
          if (!iptal) setAraniyor(false);
        });
    }, 300);
    return () => {
      iptal = true;
      clearTimeout(z);
    };
  }, [arama, aktifId]);

  const bagla = async (siparisId: string, ogrenci: OwnerCandidate) => {
    setBagliyor(siparisId);
    try {
      await caSetOrderOwner(siparisId, ogrenci.id);
      toast.success(`Sipariş ${ogrenci.name || 'öğrenci'} kaydına bağlandı`);
      setAktifId(null);
      setArama('');
      setAdaylar([]);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bağlanamadı');
    } finally {
      setBagliyor(null);
    }
  };

  const gercekPara = useMemo(
    () => orders.filter((o) => o.status === 'paid' || o.status === 'confirmed'),
    [orders]
  );
  const tutar = useMemo(
    () => gercekPara.reduce((t, o) => t + (Number(o.total_kurus) || 0), 0),
    [gercekPara]
  );

  if (!loading && orders.length === 0) return null;

  return (
    <div
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50/60 p-4"
      data-test="sahipsiz-siparisler"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            Sahipsiz siparişler ({orders.length})
          </h3>
          <p className="mt-1 text-xs text-amber-900/80">
            Öğrenciye bağlı değil, kurumu yazılmamış ve iletişim bilgisi sistemdeki hiçbir
            öğrenci/kullanıcıyla eşleşmiyor. Bu yüzden Mağaza siparişleri ekranında görünmüyorlar.
            {paidCount > 0 ? (
              <>
                {' '}
                <strong>
                  {paidCount} tanesi ödenmiş/onaylı — toplam {formatCommerceTry(tutar)}.
                </strong>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50"
          >
            {loading ? 'Yenileniyor…' : 'Yenile'}
          </button>
          <button
            type="button"
            onClick={() => setAcik((v) => !v)}
            className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white"
            data-test="sahipsiz-ac-kapa"
          >
            {acik ? 'Listeyi kapat' : 'Listeyi aç'}
          </button>
        </div>
      </div>

      {acik ? (
        <ul className="mt-3 space-y-2">
          {orders.map((o) => (
            <li key={o.id} className="rounded-lg border border-amber-200 bg-white p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-gray-900">{o.order_number || o.id}</span>
                  <span className="ml-2 text-gray-600">{o.customer_name || 'İsimsiz müşteri'}</span>
                  {o.customer_phone ? (
                    <span className="ml-2 text-gray-500">{o.customer_phone}</span>
                  ) : null}
                  {o.customer_email ? (
                    <span className="ml-2 text-gray-500">{o.customer_email}</span>
                  ) : null}
                  {o.iletisim_yok ? (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-800">
                      İletişim bilgisi yok
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-700">
                    {COMMERCE_ORDER_STATUS_LABELS[o.status] || o.status}
                  </span>
                  <span className="font-semibold">{formatCommerceTry(o.total_kurus)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAktifId(aktifId === o.id ? null : o.id);
                      setArama('');
                      setAdaylar([]);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50"
                    data-test="sahipsiz-bagla"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Öğrenciye bağla
                  </button>
                </div>
              </div>

              {aktifId === o.id ? (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                      autoFocus
                      value={arama}
                      onChange={(e) => setArama(e.target.value)}
                      placeholder="Öğrenci adı, telefon veya e-posta ile ara…"
                      className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-xs"
                      data-test="sahipsiz-ogrenci-ara"
                    />
                  </div>
                  {araniyor ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> Aranıyor…
                    </p>
                  ) : null}
                  {!araniyor && arama.trim().length >= 2 && adaylar.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-500">Eşleşen öğrenci yok.</p>
                  ) : null}
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {adaylar.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          disabled={bagliyor === o.id}
                          onClick={() => void bagla(o.id, a)}
                          className="flex w-full items-center justify-between rounded border border-gray-200 px-2 py-1.5 text-left text-xs hover:bg-gray-50 disabled:opacity-50"
                        >
                          <span>
                            <span className="font-semibold text-gray-900">{a.name || '—'}</span>
                            {a.class_level ? (
                              <span className="ml-1.5 text-gray-500">· {a.class_level}</span>
                            ) : null}
                          </span>
                          <span className="text-gray-500">{a.parent_phone || a.phone || a.email || ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-gray-500">
                    Bağlandığında siparişin kurumu öğrencinin kurumundan alınır. Sahibi tanımlanmış
                    bir sipariş sonradan değiştirilemez.
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
