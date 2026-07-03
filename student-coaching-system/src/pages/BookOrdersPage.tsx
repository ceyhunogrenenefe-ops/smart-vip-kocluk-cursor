import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Copy, Download, ExternalLink, Loader2, MessageCircle, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getGatewaySessionUserId } from '../lib/session';
import { useApp } from '../context/AppContext';
import { listInstitutionsForPicker, type InstitutionPickRow } from '../lib/parentSignApi';
import {
  approveBookOrder,
  BookOrderApproveError,
  cancelBookOrder,
  checkBookOrderWhatsAppTemplate,
  createBookOrder,
  createBookOrderSet,
  createBookseller,
  deleteBookOrder,
  deleteBookOrderSet,
  deleteBookseller,
  fetchBookOrderStats,
  fetchBookOrderGatewayConfig,
  ensureBooksellerPortalToken,
  listBookOrderSets,
  listBookOrders,
  listBooksellers,
  patchBookOrder,
  patchBookOrderSet,
  patchBookseller,
  processPendingBookOrders,
  resendBookOrderWhatsApp,
  type BookOrderStats,
  type BookOrderRow,
  type BookOrderSetRow,
  type BooksellerRow,
  type BookOrderGatewayConfig
} from '../lib/bookOrdersApi';
import { kitapciPortalUrl } from '../lib/kitapciPortalApi';
import WhatsAppGatewaySessionPanel from '../components/whatsapp/WhatsAppGatewaySessionPanel';
import { PageCollapsibleSection } from '../components/ui/PageCollapsibleSection';
import { userHasAnyRole } from '../config/rolePermissions';
import { exportBookOrdersToExcel } from '../lib/bookOrdersExport';
import { PLATFORM_BOOK_ORDER_INSTITUTION_ID } from '../lib/bookOrderConstants';

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Onay bekliyor';
    case 'approved':
      return 'Onaylandı';
    case 'notified':
      return 'Kitapçıya iletildi';
    case 'confirmed':
      return 'Kitapçı onayladı';
    case 'shipped':
      return 'Kargoda';
    case 'cancelled':
      return 'İptal';
    default:
      return status;
  }
}

function displayOrderStatus(order: { status: string; whatsapp_status: string }) {
  const wa = String(order.whatsapp_status || '').toLowerCase();
  const st = String(order.status || '');
  if (wa === 'delivered' || wa === 'read') {
    return { label: 'Kitapçıya iletildi', badge: 'bg-emerald-100 text-emerald-900' };
  }
  if (wa === 'sent') {
    return { label: 'Gateway ile gönderildi', badge: 'bg-emerald-100 text-emerald-900' };
  }
  if (wa === 'accepted' || wa === 'sending' || (st === 'notified' && wa !== 'failed')) {
    return { label: 'Meta kabul — teslim yok', badge: 'bg-amber-100 text-amber-900' };
  }
  return { label: statusLabel(st), badge: statusBadge(st) };
}

function metaDeliveryProgressLabel(status: string | null | undefined) {
  const st = String(status || '').toLowerCase();
  if (st === 'sent') return 'Meta iletti — teslim bekleniyor';
  if (st === 'delivered' || st === 'read') return 'Meta: teslim edildi';
  if (st === 'failed') return 'Meta: teslimat başarısız';
  return null;
}

function metaAcceptedHints(opts: {
  meta_delivery_status?: string | null;
  gatewayConnected?: boolean;
  webhookConfigured?: boolean;
}) {
  const lines: string[] = [];
  const progress = metaDeliveryProgressLabel(opts.meta_delivery_status);
  if (progress) lines.push(progress);
  else lines.push('Meta API kabul etti — henüz «teslim edildi» değil.');
  lines.push('Kitapçı WhatsApp’ta: İşletme sohbetleri / Güncellemeler (0850 hattı).');
  if (opts.gatewayConnected) {
    lines.push('Gateway bağlı — «WhatsApp tekrar» ile normal sohbete de gönderebilirsiniz.');
  } else {
    lines.push('Kalıcı çözüm: yukarıdan gateway QR bağlayın; sonraki siparişler önce oradan gider.');
  }
  if (opts.webhookConfigured === false) {
    lines.push('Webhook yok: Vercel META_WEBHOOK_VERIFY_TOKEN + Meta BM → /api/meta/webhook');
  }
  return lines;
}

function waOutcomeMessage(opts: {
  whatsapp_status?: string | null;
  phone?: string | null;
  meta_message_id?: string | null;
  hint?: string | null;
}) {
  const wa = String(opts.whatsapp_status || '').toLowerCase();
  const dest = opts.phone ? ` → ${opts.phone}` : '';
  const wamid = opts.meta_message_id ? ` (wamid …${opts.meta_message_id.slice(-8)})` : '';
  if (wa === 'delivered' || wa === 'read') {
    return `Kitapçıya teslim edildi${dest}`;
  }
  if (wa === 'sent') {
    return `Gateway üzerinden gönderildi${dest}`;
  }
  if (wa === 'accepted') {
    return `Meta kabul etti — telefona düşmedi sayılmaz${dest}${wamid}`;
  }
  return opts.hint || `WhatsApp işlendi${dest}`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'notified':
      return 'bg-emerald-100 text-emerald-900';
    case 'approved':
      return 'bg-sky-100 text-sky-900';
    case 'confirmed':
      return 'bg-indigo-100 text-indigo-900';
    case 'shipped':
      return 'bg-violet-100 text-violet-900';
    case 'cancelled':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-amber-100 text-amber-900';
  }
}

function waLabel(status: string) {
  switch (status) {
    case 'awaiting_approval':
      return 'Onay bekliyor';
    case 'pending':
      return 'Gönderim bekliyor';
    case 'sending':
      return 'Gönderiliyor…';
    case 'accepted':
      return 'Meta kabul etti';
    case 'delivered':
      return 'Teslim edildi';
    case 'sent':
      return 'Gateway gönderildi';
    case 'failed':
      return 'Hata';
    case 'skipped':
      return 'Atlandı';
    default:
      return status;
  }
}

function waErrorText(error: string) {
  const e = String(error || '').trim();
  if (!e) return '';
  if (e === 'bookseller_not_found') return 'Kitapçı bulunamadı — listeden seçip tekrar deneyin';
  if (e === 'invalid_bookseller_phone') return 'Kitapçı telefonu geçersiz — Kitapçılar bölümünden düzeltin';
  if (e === 'bookseller_inactive') return 'Kitapçı pasif — aktifleştirin veya başka seçin';
  if (e === 'bookseller_selection_required') return 'Kitapçı seçin';
  if (e === 'no_active_bookseller') return 'Aktif kitapçı yok';
  if (e.includes('template_variables_invalid')) {
    const m = e.match(/template_variables_invalid\s*\(([^)]+)\)/);
    if (m?.[1]) return `Şablon değişkeni eksik veya boş: ${m[1]}`;
    return e;
  }
  if (e.includes('unexpected error') || e.toLowerCase().includes('retry your request')) {
    return 'Meta geçici hata — birkaç saniye sonra «Tekrar gönder» deneyin.';
  }
  if (e.includes('gateway_fetch_failed') || e.includes('vps_unreachable') || e.includes('fetch failed')) {
    return 'VPS gateway kapalı veya erişilemiyor — sunucuda pm2 restart whatsapp-gateway, port 4010 açık mı kontrol edin';
  }
  if (e.includes('invalid_gateway_key') || e.includes('GATEWAY_API_KEY uyuşmuyor')) {
    return 'GATEWAY_API_KEY uyuşmuyor — VPS .env dosyasına Vercel’deki anahtarı yazın, pm2 restart';
  }
  if (e.includes('invalid_signature') || e.includes('APP_JWT_SECRET uyuşmuyor')) {
    return 'APP_JWT_SECRET uyuşmuyor — VPS gateway .env ile Vercel aynı olmalı';
  }
  if (e === 'GATEWAY_NOT_CONNECTED' || e.includes('gateway oturumu')) {
    return 'WhatsApp gateway bağlı değil — Meta yedek açıksa otomatik denenir; yoksa QR ile bağlayın';
  }
  if (e === 'GATEWAY_ENV' || e.includes('Gateway yapılandırılmamış')) return 'Gateway env eksik: WHATSAPP_GATEWAY_UPSTREAM, BOOK_ORDER_GATEWAY_SESSION_ID, APP_JWT_SECRET';
  if (e.includes('number_not_on_whatsapp')) return 'Numara WhatsApp kayıtlı değil';
  if (e.includes('META_WHATSAPP') || e.includes('missing_meta_whatsapp')) {
    return 'Meta WhatsApp ayarları eksik (yalnızca BOOK_ORDER_WHATSAPP_CHANNEL=meta ise gerekli)';
  }
  if (e.includes('granular permission') || e.includes('(#3)')) {
    return 'Meta izin hatası (#3): Vercel META_WHATSAPP_TOKEN System User token olmalı ve whatsapp_business_messaging izni + WABA/numara bağlı olmalı.';
  }
  if (e.includes('132001')) {
    return 'Meta #132001: kitap_siparisi1 bu WhatsApp numarasının hesabında yok veya dil kodu uyuşmuyor — «Şablon kontrol» butonuna basın';
  }
  if (e.includes('132018')) {
    return 'Meta #132018: şablon parametreleri uyuşmuyor — sistem pozisyonel/named otomatik dener; Meta BM’deki parametre sayısını kontrol edin';
  }
  if (e.includes('template_not_found_on_waba') || e.includes('template_not_approved')) {
    return e;
  }
  return e;
}

function waBadge(status: string) {
  switch (status) {
    case 'delivered':
      return 'text-emerald-700';
    case 'sent':
    case 'accepted':
      return 'text-sky-700';
    case 'failed':
      return 'text-red-700';
    case 'awaiting_approval':
    case 'sending':
    case 'pending':
      return 'text-amber-700';
    case 'skipped':
      return 'text-slate-500';
    default:
      return 'text-slate-500';
  }
}

function formatTrDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function BookOrdersPage() {
  const { effectiveUser, user } = useAuth();
  const { activeInstitutionId } = useApp();
  const isSuper = userHasAnyRole(effectiveUser, ['super_admin']);
  const canApproveBookOrders = userHasAnyRole(effectiveUser, ['super_admin', 'admin']);
  const personalGatewaySessionId = getGatewaySessionUserId(user?.id);

  const [institutionId, setInstitutionId] = useState('');
  const [institutionOptions, setInstitutionOptions] = useState<InstitutionPickRow[]>([]);
  const [orders, setOrders] = useState<BookOrderRow[]>([]);
  const [bookSets, setBookSets] = useState<BookOrderSetRow[]>([]);
  const [booksellers, setBooksellers] = useState<BooksellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterSinif, setFilterSinif] = useState('');
  const [filterKitapciId, setFilterKitapciId] = useState('');
  const [showBooksellerForm, setShowBooksellerForm] = useState(false);
  const [showSetForm, setShowSetForm] = useState(false);
  const [bookSetsSectionOpen, setBookSetsSectionOpen] = useState(false);
  const [setName, setSetName] = useState('');
  const [setIcerik, setSetIcerik] = useState('');
  const [setSiniflar, setSetSiniflar] = useState('');
  const [setSort, setSetSort] = useState('0');
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [bsName, setBsName] = useState('');
  const [bsPhone, setBsPhone] = useState('');
  const [bsCity, setBsCity] = useState('');
  const [bsBolge, setBsBolge] = useState('');
  const [selectedBookseller, setSelectedBookseller] = useState<Record<string, string>>({});
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [editVeli, setEditVeli] = useState('');
  const [editOgrenci, setEditOgrenci] = useState('');
  const [editSinif, setEditSinif] = useState('');
  const [editTelefon, setEditTelefon] = useState('');
  const [editKitapSetId, setEditKitapSetId] = useState('');
  const [editKitapSetIds, setEditKitapSetIds] = useState<string[]>([]);
  const [editKitaplar, setEditKitaplar] = useState('');
  const [editAdres, setEditAdres] = useState('');
  const [editIlce, setEditIlce] = useState('');
  const [editIl, setEditIl] = useState('');
  const [editUcret, setEditUcret] = useState('');
  const [editNot, setEditNot] = useState('');
  const [dbStats, setDbStats] = useState<BookOrderStats | null>(null);
  const [gatewayConfig, setGatewayConfig] = useState<BookOrderGatewayConfig | null>(null);
  const [showGatewayPanel, setShowGatewayPanel] = useState(true);
  const setEditPanelRef = useRef<HTMLDivElement | null>(null);
  const orderEditPanelRef = useRef<HTMLDivElement | null>(null);

  const showAllInstitutions = isSuper && institutionId === '__all__';

  const activeBooksellers = useMemo(
    () => booksellers.filter((b) => b.is_active !== false),
    [booksellers]
  );

  const booksellerPanelLabel = useCallback((name: string) => {
    const safe = String(name || '').trim();
    if (!safe) return 'KİTAP SİPARİŞ PANELİ';
    return `${safe.toLocaleUpperCase('tr-TR')} KİTAP SİPARİŞ PANELİ`;
  }, []);

  const effectiveInstitutionId = useMemo(() => {
    if (isSuper) {
      if (institutionId === '__all__') return '';
      if (institutionId.trim()) return institutionId.trim();
      return String(activeInstitutionId || PLATFORM_BOOK_ORDER_INSTITUTION_ID).trim();
    }
    /** Veli formu siparişleri platform kurumuna yazılır — aktif kurum farklı olsa bile burada göster */
    const userInst = String(effectiveUser?.institutionId || '').trim();
    if (userInst === PLATFORM_BOOK_ORDER_INSTITUTION_ID) return userInst;
    return PLATFORM_BOOK_ORDER_INSTITUTION_ID;
  }, [isSuper, institutionId, activeInstitutionId, effectiveUser?.institutionId]);

  const listInstitutionId = useMemo(() => {
    if (showAllInstitutions) return undefined;
    return effectiveInstitutionId || undefined;
  }, [showAllInstitutions, effectiveInstitutionId]);

  useEffect(() => {
    if (!isSuper) return;
    void listInstitutionsForPicker()
      .then(setInstitutionOptions)
      .catch(() => setInstitutionOptions([]));
  }, [isSuper]);

  useEffect(() => {
    if (!isSuper || institutionId.trim()) return;
    const fromActive = String(activeInstitutionId || '').trim();
    const vipDefault = PLATFORM_BOOK_ORDER_INSTITUTION_ID;
    const fromList =
      institutionOptions.find((i) => i.id === vipDefault)?.id || institutionOptions[0]?.id || '';
    const pick = fromActive === vipDefault ? vipDefault : vipDefault || fromList || fromActive;
    if (pick) setInstitutionId(pick);
  }, [isSuper, institutionId, activeInstitutionId, institutionOptions]);

  const loadStats = useCallback(async () => {
    if (!isSuper) return;
    try {
      const stats = await fetchBookOrderStats();
      setDbStats(stats);
    } catch {
      setDbStats(null);
    }
  }, [isSuper]);

  const loadGatewayConfig = useCallback(async () => {
    try {
      const cfg = await fetchBookOrderGatewayConfig();
      setGatewayConfig(cfg);
    } catch {
      setGatewayConfig(null);
    }
  }, []);

  const load = useCallback(async () => {
    if (!listInstitutionId && !showAllInstitutions) {
      setOrders([]);
      setBookSets([]);
      setBooksellers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [o, b, s] = await Promise.all([
        listBookOrders(listInstitutionId),
        listBooksellers(listInstitutionId),
        listBookOrderSets(listInstitutionId)
      ]);
      setOrders(o);
      setBooksellers(b);
      setBookSets(s);
      if (isSuper) await loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [listInstitutionId, showAllInstitutions, isSuper, loadStats]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadGatewayConfig();
  }, [loadGatewayConfig]);

  useEffect(() => {
    if (!editingSetId) return;
    setEditPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingSetId]);

  useEffect(() => {
    if (!editingOrderId && !showCreateOrder) return;
    orderEditPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingOrderId, showCreateOrder]);

  useEffect(() => {
    if (!activeBooksellers.length) return;
    setSelectedBookseller((prev) => {
      const next = { ...prev };
      for (const o of orders) {
        if (next[o.id] && activeBooksellers.some((b) => b.id === next[o.id])) continue;
        const savedId = o.kitapci_id && activeBooksellers.some((b) => b.id === o.kitapci_id) ? o.kitapci_id : null;
        if (savedId) {
          next[o.id] = savedId;
          continue;
        }
        const ad = String(o.kitapci_adi || '').trim();
        if (ad) {
          const byName = activeBooksellers.find(
            (b) => b.name.trim().toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')
          );
          if (byName) {
            next[o.id] = byName.id;
            continue;
          }
        }
        if (activeBooksellers.length === 1) {
          next[o.id] = activeBooksellers[0].id;
        }
      }
      return next;
    });
  }, [orders, activeBooksellers]);

  const booksellerNameForOrder = useCallback(
    (o: BookOrderRow) => {
      const selId = selectedBookseller[o.id];
      const fromSel = selId ? activeBooksellers.find((b) => b.id === selId) : null;
      if (fromSel) return fromSel.name;
      return o.kitapci_adi || '—';
    },
    [selectedBookseller, activeBooksellers]
  );

  const orderBooksellerId = useCallback(
    (o: BookOrderRow) => {
      const picked = selectedBookseller[o.id]?.trim();
      if (picked) return picked;
      const saved = String(o.kitapci_id || '').trim();
      if (saved) return saved;
      const ad = String(o.kitapci_adi || '').trim();
      if (!ad) return '';
      const byName = booksellers.find(
        (b) => String(b.name || '').trim().toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')
      );
      return byName?.id || '';
    },
    [selectedBookseller, booksellers]
  );

  const sinifFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      const s = String(o.sinif || '').trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (filterSinif) {
      list = list.filter((o) => String(o.sinif || '').trim() === filterSinif);
    }
    if (filterKitapciId) {
      if (filterKitapciId === '__none__') {
        list = list.filter((o) => !orderBooksellerId(o));
      } else {
        list = list.filter((o) => orderBooksellerId(o) === filterKitapciId);
      }
    }
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return list;
    return list.filter((o) => {
      const ogrenci = o.ogrenci_ad_soyad || o.ogrenci_adi || '';
      const veli = o.veli_ad_soyad || o.veli_adi || '';
      return (
        ogrenci.toLocaleLowerCase('tr').includes(q) ||
        veli.toLocaleLowerCase('tr').includes(q) ||
        String(o.telefon || '').includes(q) ||
        String(o.il || '').toLocaleLowerCase('tr').includes(q) ||
        String(o.ilce || '').toLocaleLowerCase('tr').includes(q)
      );
    });
  }, [orders, search, filterSinif, filterKitapciId, orderBooksellerId]);

  const hasOrderFilters = Boolean(filterSinif || filterKitapciId || search.trim());

  const downloadOrdersExcel = () => {
    if (!filteredOrders.length) {
      toast.error('İndirilecek sipariş yok');
      return;
    }
    try {
      const instName =
        institutionOptions.find((i) => i.id === effectiveInstitutionId)?.name || 'kitap-siparisleri';
      exportBookOrdersToExcel(filteredOrders, instName);
      toast.success(`${filteredOrders.length} sipariş Excel olarak indirildi`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel oluşturulamadı');
    }
  };

  const addBookseller = async () => {
    if (!effectiveInstitutionId) {
      toast.error('Kurum seçin');
      return;
    }
    if (!bsName.trim() || !bsPhone.trim()) {
      toast.error('Kitapçı adı ve telefon gerekli');
      return;
    }
    setBusy('add-bs');
    try {
      await createBookseller({
        institution_id: effectiveInstitutionId,
        name: bsName.trim(),
        phone: bsPhone.trim(),
        city: bsCity.trim() || undefined,
        bolge: bsBolge.trim() || undefined
      });
      toast.success('Kitapçı eklendi');
      setBsName('');
      setBsPhone('');
      setBsCity('');
      setBsBolge('');
      setShowBooksellerForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setBusy(null);
    }
  };

  const toggleBookseller = async (row: BooksellerRow) => {
    setBusy(`bs-${row.id}`);
    try {
      await patchBookseller(row.id, { is_active: !row.is_active });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusy(null);
    }
  };

  const resolvePortalUrl = async (b: BooksellerRow) => {
    let token = String(b.portal_token || '').trim();
    if (!token) {
      const fresh = await ensureBooksellerPortalToken(b.id);
      token = String(fresh.portal_token || '').trim();
      await load();
    }
    if (!token) return null;
    return kitapciPortalUrl(token);
  };

  const copyPortalLink = async (b: BooksellerRow) => {
    setBusy(`pl-${b.id}`);
    try {
      const url = await resolvePortalUrl(b);
      if (!url) {
        toast.error('Panel linki oluşturulamadı — Supabase’de 2026-06-24-kitapci-portal.sql çalıştırın');
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Panel linki kopyalandı — kitapçıya yapıştırıp gönderebilirsiniz');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Link kopyalanamadı');
    } finally {
      setBusy(null);
    }
  };

  const sendPortalLinkWhatsApp = async (b: BooksellerRow) => {
    setBusy(`wa-pl-${b.id}`);
    try {
      const url = await resolvePortalUrl(b);
      if (!url) {
        toast.error('Panel linki oluşturulamadı');
        return;
      }
      const digits = String(b.phone || '').replace(/\D/g, '');
      if (!digits) {
        toast.error('Kitapçı telefonu yok');
        return;
      }
      const text = [
        `Merhaba ${b.name},`,
        '',
        'Online VIP Dershane kitap sipariş paneliniz:',
        url,
        '',
        'Bu linkten size iletilen öğrenci siparişlerini görebilir, onaylayıp kargo takip numarasını girebilirsiniz.'
      ].join('\n');
      const waPhone = digits.startsWith('90') ? digits : `90${digits.replace(/^0/, '')}`;
      window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'WhatsApp açılamadı');
    } finally {
      setBusy(null);
    }
  };

  const resetSetForm = () => {
    setSetName('');
    setSetIcerik('');
    setSetSiniflar('');
    setSetSort('0');
    setEditingSetId(null);
    setShowSetForm(false);
  };

  const startEditSet = (row: BookOrderSetRow) => {
    setBookSetsSectionOpen(true);
    setEditingSetId(row.id);
    setSetName(row.name);
    setSetIcerik(row.kitap_icerigi);
    setSetSiniflar(Array.isArray(row.siniflar) ? row.siniflar.join(', ') : '');
    setSetSort(String(row.sort_order ?? 0));
    setShowSetForm(true);
  };

  const saveBookSet = async () => {
    if (!effectiveInstitutionId) {
      toast.error('Kurum seçin');
      return;
    }
    if (!setName.trim() || !setIcerik.trim() || !setSiniflar.trim()) {
      toast.error('Set adı, içerik ve sınıflar gerekli');
      return;
    }
    const siniflar = setSiniflar
      .split(/[,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    setBusy(editingSetId ? `set-edit-${editingSetId}` : 'add-set');
    try {
      if (editingSetId) {
        await patchBookOrderSet(editingSetId, {
          name: setName.trim(),
          kitap_icerigi: setSetIcerik.trim(),
          siniflar,
          sort_order: Number(setSort) || 0
        });
        toast.success('Set güncellendi');
      } else {
        await createBookOrderSet({
          institution_id: effectiveInstitutionId,
          name: setName.trim(),
          kitap_icerigi: setSetIcerik.trim(),
          siniflar,
          sort_order: Number(setSort) || 0
        });
        toast.success('Set eklendi');
      }
      resetSetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusy(null);
    }
  };

  const toggleBookSet = async (row: BookOrderSetRow) => {
    setBusy(`set-tog-${row.id}`);
    try {
      await patchBookOrderSet(row.id, { is_active: !row.is_active });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusy(null);
    }
  };

  const removeBookSet = async (id: string) => {
    if (!window.confirm('Kitap seti silinsin mi? Formda artık görünmez.')) return;
    setBusy(`set-del-${id}`);
    try {
      await deleteBookOrderSet(id);
      toast.success('Set silindi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusy(null);
    }
  };

  const removeBookseller = async (id: string) => {
    if (!window.confirm('Kitapçı kalıcı olarak silinsin mi? Siparişi varsa silinemez — Pasifleştir kullanın.')) return;
    setBusy(`del-${id}`);
    try {
      await deleteBookseller(id);
      toast.success('Silindi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusy(null);
    }
  };

  const activeBookSets = useMemo(() => bookSets.filter((s) => s.is_active !== false), [bookSets]);

  const canEditOrder = (o: BookOrderRow) => o.status !== 'cancelled' && o.status !== 'shipped';

  const resetOrderEdit = () => {
    setEditingOrderId(null);
    setShowCreateOrder(false);
    setEditVeli('');
    setEditOgrenci('');
    setEditSinif('');
    setEditTelefon('');
    setEditKitapSetId('');
    setEditKitapSetIds([]);
    setEditKitaplar('');
    setEditAdres('');
    setEditIlce('');
    setEditIl('');
    setEditUcret('');
    setEditNot('');
  };

  const startCreateOrder = () => {
    resetOrderEdit();
    setShowCreateOrder(true);
  };

  const startEditOrder = (o: BookOrderRow) => {
    if (!canEditOrder(o)) {
      toast.error('İptal veya kargodaki sipariş düzenlenemez');
      return;
    }
    setShowCreateOrder(false);
    setEditingOrderId(o.id);
    setEditVeli(o.veli_ad_soyad || o.veli_adi || '');
    setEditOgrenci(o.ogrenci_ad_soyad || o.ogrenci_adi || '');
    setEditSinif(String(o.sinif || ''));
    setEditTelefon(o.telefon === 'Belirtilmedi' ? '' : String(o.telefon || ''));
    const ids = Array.isArray(o.kitap_set_ids)
      ? o.kitap_set_ids.map((x) => String(x || '').trim()).filter(Boolean)
      : String(o.kitap_set_id || '').trim()
        ? [String(o.kitap_set_id).trim()]
        : [];
    setEditKitapSetIds(ids);
    setEditKitapSetId(ids[0] || '');
    setEditKitaplar(String(o.kitaplar || ''));
    setEditAdres(String(o.adres || ''));
    setEditIlce(String(o.ilce || ''));
    setEditIl(String(o.il || ''));
    setEditUcret(String(o.ucret_durumu || ''));
    setEditNot(String(o.siparis_notu || o.notlar || ''));
  };

  const onEditKitapSetToggle = (setId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...editKitapSetIds, setId]))
      : editKitapSetIds.filter((id) => id !== setId);
    setEditKitapSetIds(next);
    setEditKitapSetId(next[0] || '');
    if (!next.length) {
      setEditKitaplar('');
      return;
    }
    const selectedRows = activeBookSets.filter((s) => next.includes(s.id));
    const text = selectedRows
      .map((s) => {
        const detail = String(s.kitap_icerigi || '').trim();
        return detail ? `${s.name} — ${detail}` : s.name;
      })
      .join(' | ');
    setEditKitaplar(text);
  };

  const saveOrderEdit = async () => {
    if (!editingOrderId) return;
    if (!editVeli.trim() || !editOgrenci.trim()) {
      toast.error('Veli ve öğrenci adı zorunlu');
      return;
    }
    const telefonTrim = editTelefon.trim();
    if (!telefonTrim || /^belirtilmedi$/i.test(telefonTrim)) {
      toast.error('Veli telefonu zorunlu (05xx)');
      return;
    }
    setBusy(`edit-${editingOrderId}`);
    try {
      const result = await patchBookOrder(editingOrderId, {
        veli_ad_soyad: editVeli.trim(),
        ogrenci_ad_soyad: editOgrenci.trim(),
        telefon: telefonTrim,
        sinif: editSinif.trim() || null,
        kitap_set_id: editKitapSetId.trim() || null,
        kitap_set_ids: editKitapSetIds.length ? editKitapSetIds : [],
        kitaplar: editKitaplar.trim() || null,
        adres: editAdres.trim() || null,
        ilce: editIlce.trim() || null,
        il: editIl.trim() || null,
        ucret_durumu: editUcret.trim() || null,
        siparis_notu: editNot.trim() || null
      });
      toast.success('Sipariş güncellendi');
      if (result.warning === 'kitap_set_ids_missing') {
        toast.warning(
          result.hint ||
            "Not: Veritabanında çoklu set kolonu olmadığı için sadece ilk set kaydedildi. SQL migration çalıştırılmalı."
        );
      }
      resetOrderEdit();
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Güncellenemedi';
      toast.error(`Kaydetme hatası: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const saveCreateOrder = async () => {
    if (!effectiveInstitutionId) {
      toast.error('Kurum seçin');
      return;
    }
    if (!editVeli.trim() || !editOgrenci.trim()) {
      toast.error('Veli ve öğrenci adı zorunlu');
      return;
    }
    const telefonTrim = editTelefon.trim();
    if (!telefonTrim || /^belirtilmedi$/i.test(telefonTrim)) {
      toast.error('Veli telefonu zorunlu (05xx)');
      return;
    }
    setBusy('create-order');
    try {
      await createBookOrder({
        institution_id: effectiveInstitutionId,
        veli_ad_soyad: editVeli.trim(),
        ogrenci_ad_soyad: editOgrenci.trim(),
        telefon: telefonTrim,
        sinif: editSinif.trim() || null,
        kitap_set_id: editKitapSetId.trim() || null,
        kitap_set_ids: editKitapSetIds.length ? editKitapSetIds : [],
        kitaplar: editKitaplar.trim() || null,
        adres: editAdres.trim() || null,
        ilce: editIlce.trim() || null,
        il: editIl.trim() || null,
        ucret_durumu: editUcret.trim() || null,
        siparis_notu: editNot.trim() || null
      });
      toast.success('Sipariş eklendi');
      resetOrderEdit();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setBusy(null);
    }
  };

  const pickBooksellerId = (orderId: string) => {
    const id = selectedBookseller[orderId]?.trim();
    if (id) return id;
    if (activeBooksellers.length === 1) return activeBooksellers[0].id;
    return null;
  };

  const resendWa = async (id: string) => {
    const kitapciId = pickBooksellerId(id);
    if (!kitapciId && activeBooksellers.length > 1) {
      toast.error('Önce kitapçı seçin');
      return;
    }
    setBusy(`wa-${id}`);
    try {
      const wa = await resendBookOrderWhatsApp(id, kitapciId || undefined);
      const msg = waOutcomeMessage(wa);
      if (wa.whatsapp_status === 'delivered' || wa.whatsapp_status === 'read') {
        toast.success(msg);
      } else {
        toast.warning(msg);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setBusy(null);
    }
  };

  const approveOrder = async (id: string) => {
    const kitapciId = pickBooksellerId(id);
    if (!kitapciId && activeBooksellers.length > 1) {
      toast.error('Onaylamadan önce kitapçı seçin');
      return;
    }
    if (!activeBooksellers.length) {
      toast.error('Aktif kitapçı yok — önce kitapçı ekleyin');
      return;
    }
    setBusy(`ap-${id}`);
    try {
      const row = await approveBookOrder(id, kitapciId || undefined);
      const msg = waOutcomeMessage({
        whatsapp_status: row.whatsapp_status,
        phone: row.kitapci_phone,
        meta_message_id: row.meta_message_id
      });
      if (row.whatsapp_status === 'delivered' || row.whatsapp_status === 'read') {
        toast.success(msg);
      } else if (row.whatsapp_status === 'accepted' || row.whatsapp_status === 'sent') {
        toast.warning(`Onaylandı. ${msg}`);
      } else {
        toast.success('Sipariş onaylandı');
      }
      await load();
    } catch (e) {
      if (e instanceof BookOrderApproveError && e.approved) {
        toast.warning(e.message);
        await load();
      } else {
        toast.error(e instanceof Error ? e.message : 'Onaylanamadı');
      }
    } finally {
      setBusy(null);
    }
  };

  const checkWaTemplate = async () => {
    setBusy('wa-tpl');
    try {
      const d = await checkBookOrderWhatsAppTemplate();
      const gw = (d as { gateway?: { configured?: boolean; hint?: string; session_id_suffix?: string | null } }).gateway;
      if (d.ok) {
        if ((d as { send_via?: string }).send_via === 'gateway' || gw?.configured) {
          const sess = gw?.session_id_suffix ? ` · oturum …${gw.session_id_suffix}` : '';
          const health = (d as { gateway_health?: { ok?: boolean; error?: string } }).gateway_health;
          const gwLive = (d as { gateway_session?: { ok?: boolean; status?: string; error?: string } }).gateway_session;
          if (health && !health.ok) {
            toast.error(
              `VPS gateway kapalı: ${health.error || 'erişilemiyor'} — sunucuda pm2 restart whatsapp-gateway`
            );
            return;
          }
          const st = gwLive?.ok ? 'bağlı' : gwLive?.status || 'bağlı değil';
          toast.success(`WhatsApp gateway — ${st}${sess}`);
          if (!gwLive?.ok) {
            toast.error(
              gwLive?.error ||
                (d as { hint?: string }).hint ||
                'Gateway oturumu bağlı değil — aşağıdaki WhatsApp Gateway bölümünden QR ile bağlayın.'
            );
          }
          return;
        }
        const langs = (d.approved || []).map((a) => `${a.language} (${a.status})`).join(', ');
        const named = (d as { meta_named_body_parameters?: boolean }).meta_named_body_parameters
          ? ' · adlandırılmış parametre'
          : '';
        const suffix = [
          (d as { phone_number_id_suffix?: string }).phone_number_id_suffix
            ? `tel:…${(d as { phone_number_id_suffix?: string }).phone_number_id_suffix}`
            : '',
          (d as { waba_id_suffix?: string }).waba_id_suffix
            ? `WABA:…${(d as { waba_id_suffix?: string }).waba_id_suffix}`
            : ''
        ]
          .filter(Boolean)
          .join(' · ');
        const webhook = (d as { webhook?: { configured?: boolean; hint?: string } }).webhook;
        const tplMeta = (d as { template_meta?: { category?: string | null } }).template_meta;
        const cat = tplMeta?.category ? ` · kategori: ${tplMeta.category}` : '';
        toast.success(
          `Meta Cloud API — şablon aktif: ${d.template_name}${d.language ? ` · dil: ${d.language}` : ''}${named}${cat}${langs ? ` · ${langs}` : ''}${suffix ? ` · ${suffix}` : ''}`
        );
        if (webhook && !webhook.configured) {
          toast.error(webhook.hint || 'META_WEBHOOK_VERIFY_TOKEN eksik — teslimat durumu güncellenmez');
        } else if (tplMeta?.category && tplMeta.category !== 'UTILITY') {
          toast.error(`kitap_siparisi1 kategorisi ${tplMeta.category} — UTILITY olmalı`);
        }
      } else {
        const warn = (d as { sync_warning?: string }).sync_warning;
        toast.error(warn || d.hint || d.error || 'Şablon gönderim için hazır değil');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kontrol edilemedi');
    } finally {
      setBusy(null);
    }
  };

  const cancelOrder = async (id: string) => {
    if (!window.confirm('Sipariş iptal edilsin mi? Kitapçıya mesaj gitmez.')) return;
    setBusy(`ca-${id}`);
    try {
      await cancelBookOrder(id);
      toast.success('Sipariş iptal edildi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İptal edilemedi');
    } finally {
      setBusy(null);
    }
  };

  const removeOrder = async (id: string) => {
    if (!window.confirm('Sipariş kalıcı olarak silinsin mi? Bu işlem geri alınamaz.')) return;
    setBusy(`del-${id}`);
    try {
      await deleteBookOrder(id);
      toast.success('Sipariş silindi');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silinemedi');
    } finally {
      setBusy(null);
    }
  };

  const runPending = async () => {
    setBusy('pending');
    try {
      const out = await processPendingBookOrders();
      toast.success(`${out.processed} bekleyen sipariş işlendi`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlenemedi');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BookOpen className="h-6 w-6 text-indigo-600" />
            Kitap siparişleri
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Veli formu doldurur → sipariş tabloya düşer → siz onaylarsınız → kitapçıya WhatsApp gider.
            Gönderim: önce <span className="font-mono text-xs">WhatsApp gateway</span>, bağlı değilse{' '}
            <span className="font-mono text-xs">Meta şablonu</span> (kitap_siparisi1)
            <span className="text-slate-500"> · Kitapçı paneli: onay + kargo takibi</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void checkWaTemplate()}
            disabled={busy === 'wa-tpl'}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900 hover:bg-emerald-100"
          >
            {busy === 'wa-tpl' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            Gateway kontrol
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Yenile
          </button>
          {isSuper ? (
            <button
              type="button"
              onClick={() => void runPending()}
              disabled={busy === 'pending'}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm text-violet-900 hover:bg-violet-100"
            >
              {busy === 'pending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Bekleyen WhatsApp
            </button>
          ) : null}
        </div>
      </div>

      {isSuper ? (
        <label className="block max-w-md text-sm">
          <span className="text-slate-600">Kurum</span>
          <select
            value={institutionId || effectiveInstitutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          >
            <option value="">— Kurum seçin —</option>
            <option value="__all__">— Tüm kurumlar (veritabanı özeti) —</option>
            {institutionOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          {!effectiveInstitutionId && !showAllInstitutions ? (
            <p className="mt-1 text-xs text-amber-700">
              Kitapçılar ve siparişler kurum seçilince listelenir — Online VIP Dershane kurumunu seçin.
            </p>
          ) : null}
          {showAllInstitutions && dbStats ? (
            <p className="mt-1 text-xs text-slate-600">
              Veritabanında toplam {dbStats.totals.orders} sipariş, {dbStats.totals.booksellers} kitapçı
              {dbStats.totals.orders === 0 && dbStats.totals.booksellers === 0
                ? ' — kayıt yoksa Supabase yedekten geri yükleme gerekebilir.'
                : ' — kurum seçerek detayları görün.'}
            </p>
          ) : null}
        </label>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">WhatsApp Gateway (kitap siparişi)</h2>
          <button
            type="button"
            onClick={() => setShowGatewayPanel((v) => !v)}
            className="text-xs font-medium text-indigo-700 hover:underline"
          >
            {showGatewayPanel ? 'Gizle' : 'Göster'}
          </button>
        </div>
        {showGatewayPanel && personalGatewaySessionId ? (
          <WhatsAppGatewaySessionPanel
            sessionId={personalGatewaySessionId}
            title="Kitap siparişi WhatsApp hattı (sizin hesabınız)"
            description="QR yalnızca oturum açtığınız kullanıcıya bağlanır. Onaylanan siparişler Vercel BOOK_ORDER_GATEWAY_SESSION_ID ile eşleşen oturumdan gider."
            envHint={
              gatewayConfig?.hint ||
              (!gatewayConfig?.env_configured
                ? `QR bağladıktan sonra otomatik gönderim için Vercel: BOOK_ORDER_GATEWAY_SESSION_ID=${personalGatewaySessionId}`
                : gatewayConfig?.send_session_id &&
                    gatewayConfig.send_session_id !== personalGatewaySessionId
                  ? `Otomatik gönderim başka oturumu kullanıyor (…${gatewayConfig.send_session_id.slice(-8)}). Kendi hattınızı kullanmak için env değerini güncelleyin.`
                  : gatewayConfig?.gateway_session?.ok
                    ? null
                    : gatewayConfig?.gateway?.hint || null)
            }
          />
        ) : showGatewayPanel ? (
          <p className="text-xs text-amber-700">Gateway oturum bilgisi yüklenemedi — sayfayı yenileyin.</p>
        ) : null}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Kitapçılar</h2>
          <button
            type="button"
            onClick={() => setShowBooksellerForm((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Kitapçı ekle
          </button>
        </div>
        {showBooksellerForm ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input value={bsName} onChange={(e) => setBsName(e.target.value)} placeholder="Kitapçı adı" className="rounded border px-2 py-1.5 text-sm" />
            <input value={bsPhone} onChange={(e) => setBsPhone(e.target.value)} placeholder="05xx…" className="rounded border px-2 py-1.5 text-sm font-mono" />
            <input value={bsCity} onChange={(e) => setBsCity(e.target.value)} placeholder="Şehir (opsiyonel)" className="rounded border px-2 py-1.5 text-sm" />
            <input value={bsBolge} onChange={(e) => setBsBolge(e.target.value)} placeholder="Bölge (opsiyonel)" className="rounded border px-2 py-1.5 text-sm" />
            <button
              type="button"
              disabled={busy === 'add-bs'}
              onClick={() => void addBookseller()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:col-span-2 lg:col-span-1"
            >
              Kaydet
            </button>
          </div>
        ) : null}
        {!booksellers.length && effectiveInstitutionId ? (
          <p className="mt-3 text-xs text-slate-500">Bu kurumda kayıtlı kitapçı yok — yukarıdan ekleyin.</p>
        ) : null}
        {booksellers.length ? (
          <ul className="mt-3 space-y-2">
            {booksellers.map((b) => {
              const portalUrl = b.portal_token ? kitapciPortalUrl(b.portal_token) : null;
              return (
                <li key={b.id} className="rounded-lg border border-slate-100 px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="font-medium">{b.name}</span>
                      <span className="ml-2 font-mono text-xs text-slate-500">{b.phone}</span>
                      {b.city ? <span className="ml-2 text-xs text-slate-400">{b.city}</span> : null}
                      {b.is_active === false ? <span className="ml-2 text-xs text-amber-700">(pasif)</span> : null}
                    </div>
                    <span className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busy === `pl-${b.id}`}
                        onClick={() => void copyPortalLink(b)}
                        className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100"
                      >
                        {busy === `pl-${b.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                        Linki kopyala
                      </button>
                      <button
                        type="button"
                        disabled={busy === `wa-pl-${b.id}`}
                        onClick={() => void sendPortalLinkWhatsApp(b)}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        {busy === `wa-pl-${b.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
                        WhatsApp ile gönder
                      </button>
                      <button type="button" onClick={() => void toggleBookseller(b)} className="text-xs text-indigo-700 hover:underline">
                        {b.is_active === false ? 'Aktifleştir' : 'Pasifleştir'}
                      </button>
                      <button type="button" onClick={() => void removeBookseller(b.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                  {portalUrl ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                      <span className="text-[10px] text-slate-500">Panel:</span>
                      <a
                        href={portalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-[11px] font-semibold text-indigo-700 hover:underline"
                        title={portalUrl}
                      >
                        {booksellerPanelLabel(b.name)}
                      </a>
                      <a
                        href={portalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:text-indigo-800"
                        title="Paneli aç"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-slate-500">
                      Panel linki yükleniyor veya oluşturulacak — &quot;Linki kopyala&quot; ile üretin.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-amber-700">Henüz kitapçı yok — sipariş gelince WhatsApp gitmez. En az bir aktif kitapçı ekleyin.</p>
        )}
      </section>

      <PageCollapsibleSection
        title="Kitap setleri (veli formu)"
        description="Veli sınıf seçince uygun setler listelenir. Sınıflar: 9, 10, 11, 12 veya 5,6,7,8"
        open={bookSetsSectionOpen}
        onOpenChange={setBookSetsSectionOpen}
        className="border-slate-200 shadow-sm"
        badge={
          bookSets.length ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {bookSets.length} set
            </span>
          ) : null
        }
        headerActions={
          <button
            type="button"
            onClick={() => {
              setBookSetsSectionOpen(true);
              if (showSetForm && !editingSetId) {
                setShowSetForm(false);
              } else {
                resetSetForm();
                setShowSetForm(true);
              }
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            {showSetForm && !editingSetId ? 'İptal' : 'Set ekle'}
          </button>
        }
      >
        {showSetForm ? (
          <div ref={setEditPanelRef} className="grid gap-2 sm:grid-cols-2">
            <input
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              placeholder="Set adı (ör. VIP 9. Sınıf Set)"
              className="rounded border px-2 py-1.5 text-sm sm:col-span-2"
            />
            <textarea
              value={setIcerik}
              onChange={(e) => setSetIcerik(e.target.value)}
              placeholder="Kitap içeriği (Fizik, Kimya, …)"
              rows={2}
              className="rounded border px-2 py-1.5 text-sm sm:col-span-2"
            />
            <input
              value={setSiniflar}
              onChange={(e) => setSetSiniflar(e.target.value)}
              placeholder="Sınıflar: 9 veya 5,6,7,8"
              className="rounded border px-2 py-1.5 text-sm"
            />
            <input
              value={setSort}
              onChange={(e) => setSetSort(e.target.value)}
              placeholder="Sıra (0)"
              className="rounded border px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={busy === 'add-set' || Boolean(editingSetId && busy === `set-edit-${editingSetId}`)}
                onClick={() => void saveBookSet()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingSetId ? 'Güncelle' : 'Kaydet'}
              </button>
              {editingSetId ? (
                <button type="button" onClick={() => resetSetForm()} className="text-sm text-slate-600 hover:underline">
                  Vazgeç
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {bookSets.length ? (
          <ul className={`space-y-2 ${showSetForm ? 'mt-3' : ''}`}>
            {bookSets.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-100 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{s.name}</span>
                    {s.is_active === false ? <span className="ml-2 text-xs text-amber-700">(pasif)</span> : null}
                    <p className="mt-0.5 text-xs text-slate-600">{s.kitap_icerigi}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Sınıflar: {Array.isArray(s.siniflar) ? s.siniflar.join(', ') : '—'} · sıra {s.sort_order ?? 0}
                    </p>
                  </div>
                  <span className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => startEditSet(s)} className="text-xs text-indigo-700 hover:underline">
                      Düzenle
                    </button>
                    <button
                      type="button"
                      disabled={busy === `set-tog-${s.id}`}
                      onClick={() => void toggleBookSet(s)}
                      className="text-xs text-indigo-700 hover:underline"
                    >
                      {s.is_active === false ? 'Aktifleştir' : 'Pasifleştir'}
                    </button>
                    <button type="button" onClick={() => void removeBookSet(s.id)} className="text-red-600 hover:text-red-800">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-amber-700">
            Henüz kitap seti yok — Supabase&apos;de 2026-06-25-kitap-siparis-setleri.sql çalıştırın veya yukarıdan ekleyin.
          </p>
        )}
      </PageCollapsibleSection>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Siparişler</h2>
          {orders.length > 0 ? (
            <span className="text-xs text-slate-500">
              {filteredOrders.length === orders.length
                ? `${orders.length} kayıt`
                : `${filteredOrders.length} / ${orders.length} kayıt`}
            </span>
          ) : null}
          {filteredOrders.length > 0 ? (
            <button
              type="button"
              onClick={downloadOrdersExcel}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              <Download className="h-3.5 w-3.5" />
              Excel indir ({filteredOrders.length})
            </button>
          ) : null}
          {effectiveInstitutionId ? (
            <button
              type="button"
              onClick={() => (showCreateOrder ? resetOrderEdit() : startCreateOrder())}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              {showCreateOrder ? 'İptal' : 'Sipariş ekle'}
            </button>
          ) : null}
        </div>
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5">
          <label className="min-w-[7rem] flex-1 text-xs text-slate-600 sm:max-w-[10rem]">
            Sınıf
            <select
              value={filterSinif}
              onChange={(e) => setFilterSinif(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="">Tüm sınıflar</option>
              {sinifFilterOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[9rem] flex-[1.4] text-xs text-slate-600 sm:max-w-[14rem]">
            Kırtasiyeci
            <select
              value={filterKitapciId}
              onChange={(e) => setFilterKitapciId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="">Tüm kırtasiyeciler</option>
              <option value="__none__">Atanmamış</option>
              {booksellers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.is_active === false ? ' (pasif)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[10rem] flex-[2] text-xs text-slate-600">
            Ara
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Öğrenci, veli, il…"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          {hasOrderFilters ? (
            <button
              type="button"
              onClick={() => {
                setFilterSinif('');
                setFilterKitapciId('');
                setSearch('');
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Filtreleri temizle
            </button>
          ) : null}
        </div>
        {showCreateOrder ? (
          <div ref={orderEditPanelRef} className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="mb-3 text-sm font-semibold text-emerald-900">Yeni sipariş</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs text-slate-600">
                Veli ad soyad
                <input
                  value={editVeli}
                  onChange={(e) => setEditVeli(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                Öğrenci ad soyad
                <input
                  value={editOgrenci}
                  onChange={(e) => setEditOgrenci(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                Sınıf
                <input
                  value={editSinif}
                  onChange={(e) => setEditSinif(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                Telefon <span className="text-red-600">*</span>
                <input
                  value={editTelefon}
                  onChange={(e) => setEditTelefon(e.target.value)}
                  placeholder="05xx xxx xx xx"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2">
                Kitap setleri (çoklu)
                <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                  {activeBookSets.length ? (
                    <div className="space-y-1">
                      {activeBookSets.map((s) => (
                        <label key={s.id} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={editKitapSetIds.includes(s.id)}
                            onChange={(e) => onEditKitapSetToggle(s.id, e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>{s.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">Aktif set yok</span>
                  )}
                </div>
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2">
                Kitap seti metni (WhatsApp)
                <input
                  value={editKitaplar}
                  onChange={(e) => setEditKitaplar(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
                Adres
                <textarea
                  value={editAdres}
                  onChange={(e) => setEditAdres(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                İlçe
                <input
                  value={editIlce}
                  onChange={(e) => setEditIlce(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                İl
                <input
                  value={editIl}
                  onChange={(e) => setEditIl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                Ücret durumu
                <select
                  value={editUcret}
                  onChange={(e) => setEditUcret(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  <option value="Ödendi">Ödendi</option>
                  <option value="Ödenmedi">Ödenmedi</option>
                </select>
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2">
                Sipariş notu
                <input
                  value={editNot}
                  onChange={(e) => setEditNot(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === 'create-order'}
                onClick={() => void saveCreateOrder()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === 'create-order' ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              <button
                type="button"
                onClick={resetOrderEdit}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-white"
              >
                Vazgeç
              </button>
            </div>
          </div>
        ) : null}
        {editingOrderId ? (
          <div ref={orderEditPanelRef} className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
            <p className="mb-3 text-sm font-semibold text-indigo-900">Siparişi düzenle</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs text-slate-600">
                Veli ad soyad
                <input
                  value={editVeli}
                  onChange={(e) => setEditVeli(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                Öğrenci ad soyad
                <input
                  value={editOgrenci}
                  onChange={(e) => setEditOgrenci(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                Sınıf
                <input
                  value={editSinif}
                  onChange={(e) => setEditSinif(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                Telefon <span className="text-red-600">*</span>
                <input
                  value={editTelefon}
                  onChange={(e) => setEditTelefon(e.target.value)}
                  placeholder="05xx xxx xx xx"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2">
                Kitap setleri (çoklu)
                <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                  {activeBookSets.length ? (
                    <div className="space-y-1">
                      {activeBookSets.map((s) => (
                        <label key={s.id} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={editKitapSetIds.includes(s.id)}
                            onChange={(e) => onEditKitapSetToggle(s.id, e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>{s.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">Aktif set yok</span>
                  )}
                </div>
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2">
                Kitap seti metni (WhatsApp)
                <input
                  value={editKitaplar}
                  onChange={(e) => setEditKitaplar(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
                Adres
                <textarea
                  value={editAdres}
                  onChange={(e) => setEditAdres(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                İlçe
                <input
                  value={editIlce}
                  onChange={(e) => setEditIlce(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                İl
                <input
                  value={editIl}
                  onChange={(e) => setEditIl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-slate-600">
                Ücret durumu
                <select
                  value={editUcret}
                  onChange={(e) => setEditUcret(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  <option value="Ödendi">Ödendi</option>
                  <option value="Ödenmedi">Ödenmedi</option>
                </select>
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2">
                Sipariş notu
                <input
                  value={editNot}
                  onChange={(e) => setEditNot(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === `edit-${editingOrderId}`}
                onClick={() => void saveOrderEdit()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy === `edit-${editingOrderId}` ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              <button
                type="button"
                onClick={resetOrderEdit}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-white"
              >
                Vazgeç
              </button>
            </div>
          </div>
        ) : null}
        {loading ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : !effectiveInstitutionId ? (
          <p className="text-sm text-amber-700">Liste için kurum seçin.</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-sm text-slate-500">
            {orders.length === 0
              ? 'Henüz sipariş yok.'
              : hasOrderFilters
                ? 'Filtreye uyan sipariş yok — filtreleri temizleyip tekrar deneyin.'
                : 'Sipariş bulunamadı.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  <th className="py-2 pr-2">Tarih</th>
                  <th className="py-2 pr-2">Öğrenci / Veli</th>
                  <th className="py-2 pr-2">Telefon</th>
                  <th className="py-2 pr-2">Adres / Ücret</th>
                  <th className="py-2 pr-2">Kitapçı</th>
                  <th className="py-2 pr-2">Kargo</th>
                  <th className="py-2 pr-2">WA</th>
                  <th className="py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="border-b border-slate-50 align-top">
                    <td className="py-2 pr-2 text-xs text-slate-500 whitespace-nowrap">{formatTrDate(o.created_at)}</td>
                    <td className="py-2 pr-2">
                      <div className="font-medium">{o.ogrenci_ad_soyad || o.ogrenci_adi}</div>
                      <div className="text-xs text-slate-500">{o.veli_ad_soyad || o.veli_adi}</div>
                      {o.sinif ? <div className="text-xs">{o.sinif}</div> : null}
                      {o.kitaplar ? (
                        <div className="mt-0.5 text-xs font-medium text-indigo-800">{o.kitaplar}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">
                      {o.telefon && o.telefon !== 'Belirtilmedi' ? (
                        o.telefon
                      ) : (
                        <span className="text-amber-700 font-sans font-medium">Eksik</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 max-w-[200px] text-xs">
                      {o.adres ? <div className="whitespace-pre-wrap">{o.adres}</div> : null}
                      {o.ilce || o.il ? (
                        <div className="text-slate-500">
                          {[o.ilce, o.il].filter(Boolean).join(' / ')}
                        </div>
                      ) : null}
                      {o.ucret_durumu ? (
                        <div className="mt-0.5 font-medium text-indigo-800">{o.ucret_durumu}</div>
                      ) : null}
                      {o.siparis_notu || o.notlar ? (
                        <div className="mt-0.5 text-slate-500">{o.siparis_notu || o.notlar}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-xs">{booksellerNameForOrder(o)}</td>
                    <td className="py-2 pr-2 text-xs font-mono">
                      {o.kargo_takip_no || '—'}
                      {o.kitapci_notu ? <div className="font-sans text-[10px] text-slate-500">{o.kitapci_notu}</div> : null}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`text-xs font-medium ${waBadge(o.whatsapp_status)}`}>{waLabel(o.whatsapp_status)}</span>
                      {(o.whatsapp_status === 'sent' ||
                        o.whatsapp_status === 'accepted' ||
                        o.whatsapp_status === 'delivered') &&
                      o.kitapci_phone ? (
                        <div className="text-[10px] text-slate-600 font-mono">Alıcı: {o.kitapci_phone}</div>
                      ) : null}
                      {o.whatsapp_status === 'accepted' ? (
                        <div className="text-[10px] text-amber-700 space-y-0.5">
                          {metaAcceptedHints({
                            meta_delivery_status: o.meta_delivery_status,
                            gatewayConnected: gatewayConfig?.gateway_session?.ok === true,
                            webhookConfigured: gatewayConfig?.webhook?.configured
                          }).map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      ) : null}
                      {o.whatsapp_status === 'sent' ? (
                        <div className="text-[10px] text-emerald-700">
                          WhatsApp gateway üzerinden düz metin olarak gönderildi.
                        </div>
                      ) : null}
                      {o.whatsapp_status === 'failed' && o.meta_delivery_status === 'failed' ? (
                        <div className="text-[10px] text-red-700">Meta webhook: teslimat başarısız</div>
                      ) : null}
                      {o.meta_message_id ? (
                        <div className="text-[10px] text-slate-500 font-mono" title={o.meta_message_id}>
                          {o.whatsapp_status === 'sent' ? 'msg' : 'wamid'} …{o.meta_message_id.slice(-10)}
                        </div>
                      ) : o.whatsapp_status === 'delivered' || o.whatsapp_status === 'accepted' ? (
                        <div className="text-[10px] text-amber-700">Meta mesaj kimliği yok</div>
                      ) : null}
                      {o.whatsapp_error ? (
                        <div className="text-[10px] text-red-600">{waErrorText(o.whatsapp_error)}</div>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const ds = displayOrderStatus(o);
                          return (
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${ds.badge}`}>
                              {ds.label}
                            </span>
                          );
                        })()}
                        {activeBooksellers.length > 0 ? (
                          <label className="text-[10px] text-slate-500">
                            Kitapçı
                            <select
                              value={selectedBookseller[o.id] || ''}
                              onChange={(e) =>
                                setSelectedBookseller((prev) => ({ ...prev, [o.id]: e.target.value }))
                              }
                              className="mt-0.5 block w-full max-w-[180px] rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-800"
                            >
                              {activeBooksellers.length > 1 ? (
                                <option value="">— Seçin —</option>
                              ) : null}
                              {activeBooksellers.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                  {b.city ? ` (${b.city})` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {canEditOrder(o) ? (
                          <button
                            type="button"
                            disabled={busy === `edit-${o.id}`}
                            onClick={() => startEditOrder(o)}
                            className="inline-flex items-center gap-1 text-left text-[11px] text-indigo-700 hover:underline"
                          >
                            <Pencil className="h-3 w-3" />
                            Düzenle
                          </button>
                        ) : null}
                        {o.status === 'pending' ? (
                          <>
                            {canApproveBookOrders ? (
                              <button
                                type="button"
                                disabled={busy === `ap-${o.id}` || !activeBooksellers.length}
                                onClick={() => void approveOrder(o.id)}
                                className="text-left text-[11px] font-semibold text-emerald-700 hover:underline disabled:text-slate-400"
                              >
                                {busy === `ap-${o.id}` ? 'Gönderiliyor…' : 'Onayla ve kitapçıya gönder'}
                              </button>
                            ) : (
                              <span className="text-[10px] text-amber-800">Onay bekleniyor</span>
                            )}
                            <button
                              type="button"
                              disabled={busy === `ca-${o.id}`}
                              onClick={() => void cancelOrder(o.id)}
                              className="text-left text-[11px] text-red-700 hover:underline"
                            >
                              İptal
                            </button>
                          </>
                        ) : null}
                        {canApproveBookOrders && o.status !== 'pending' && o.whatsapp_status !== 'awaiting_approval' ? (
                          <button
                            type="button"
                            disabled={busy === `wa-${o.id}` || !activeBooksellers.length}
                            onClick={() => void resendWa(o.id)}
                            className="text-left text-[11px] text-indigo-700 hover:underline disabled:text-slate-400"
                          >
                            WhatsApp tekrar
                          </button>
                        ) : null}
                        {canApproveBookOrders ? (
                          <button
                            type="button"
                            disabled={busy === `del-${o.id}`}
                            onClick={() => void removeOrder(o.id)}
                            className="inline-flex items-center gap-1 text-left text-[11px] text-red-700 hover:underline disabled:text-slate-400"
                          >
                            <Trash2 className="h-3 w-3" />
                            Sil
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
        <p className="font-semibold text-slate-800">Form bağlantısı</p>
        <p>
          Mevcut formunuz kayıtları <span className="font-mono">kitap_siparisleri</span> tablosuna yazabilir veya API ile gönderebilir:
        </p>
        <pre className="overflow-x-auto rounded bg-white p-2 font-mono text-[10px]">{`POST /api/book-orders?op=public-submit
Header: X-Book-Order-Key: <BOOK_ORDER_FORM_SECRET>
Body: {
  "institution_id": "<kurum-id>",
  "veli_ad_soyad": "...",
  "ogrenci_ad_soyad": "...",
  "sinif": "12",
  "ucret_durumu": "Ödendi",
  "telefon": "05xx...",
  "adres": "...",
  "ilce": "...",
  "il": "...",
  "siparis_notu": "..."
}`}</pre>
        <p>
          Supabase formu doğrudan tabloya yazıyorsa: <span className="font-mono">status=pending</span>,{' '}
          <span className="font-mono">whatsapp_status=awaiting_approval</span>. Onay sonrası mesaj gider.
        </p>
      </section>
    </div>
  );
}
