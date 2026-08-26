/**
 * Süper Admin — Kitap Pazaryeri yönetim paneli
 * Sekmeler: Satıcılar | Onay Bekleyenler | Kitaplar | Teklifler | Siparişler | Hakedişler | Kuponlar | Raporlar | Ayarlar
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  caApproveOffer,
  caCreateVendor,
  caCreateVendorAccount,
  caDeleteVendor,
  caGetSettings,
  caListBooks,
  caListCoupons,
  caListOffers,
  caListOrders,
  caListPayouts,
  caListVendorUsers,
  caListVendors,
  caRejectOffer,
  caReportLowStock,
  caReportSales,
  caRemoveVendorUser,
  caRequestCorrection,
  caResetVendorPassword,
  caToggleVendorActive,
  caUpdateSettings,
  caUpdateVendor,
  type VendorUserRow,
} from '../../lib/commerceAdminApi';
import type {
  CommerceBook,
  CommerceCoupon,
  CommerceOrder,
  CommerceSettings,
  CommerceVendor,
  CommerceVendorOffer,
  CommerceVendorPayout,
} from '../../types/commerce.types';
import { formatCommerceTry, COMMERCE_OFFER_STATUS_LABELS, COMMERCE_ORDER_STATUS_LABELS } from '../../types/commerce.types';
import { useAuth } from '../../context/AuthContext';
import BookOrdersPage from '../BookOrdersPage';

type Tab =
  | 'kurum-siparis'
  | 'saticilar'
  | 'onaylar'
  | 'kitaplar'
  | 'teklifler'
  | 'siparisler'
  | 'hakedisler'
  | 'kuponlar'
  | 'raporlar'
  | 'ayarlar';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'kurum-siparis', label: 'Sipariş formu', icon: <ClipboardList className="w-4 h-4" /> },
  { key: 'saticilar', label: 'Satıcılar', icon: <Store className="w-4 h-4" /> },
  { key: 'onaylar', label: 'Onay Bekleyenler', icon: <AlertCircle className="w-4 h-4" /> },
  { key: 'kitaplar', label: 'Kitaplar', icon: <Package className="w-4 h-4" /> },
  { key: 'teklifler', label: 'Tüm Teklifler', icon: <Eye className="w-4 h-4" /> },
  { key: 'siparisler', label: 'Mağaza siparişleri', icon: <ShoppingBag className="w-4 h-4" /> },
  { key: 'hakedisler', label: 'Hakedişler', icon: <Wallet className="w-4 h-4" /> },
  { key: 'kuponlar', label: 'Kuponlar', icon: <CheckCircle2 className="w-4 h-4" /> },
  { key: 'raporlar', label: 'Raporlar', icon: <ChevronDown className="w-4 h-4" /> },
  { key: 'ayarlar', label: 'Ayarlar', icon: <Settings className="w-4 h-4" /> },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: 'bg-green-100 text-green-800',
    pending_approval: 'bg-yellow-100 text-yellow-800',
    draft: 'bg-gray-100 text-gray-600',
    rejected: 'bg-red-100 text-red-700',
    inactive: 'bg-gray-100 text-gray-500',
    correction_requested: 'bg-orange-100 text-orange-700',
    paid: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-teal-100 text-teal-800',
    preparing: 'bg-indigo-100 text-indigo-800',
    shipped: 'bg-purple-100 text-purple-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-800',
    pending_payment: 'bg-yellow-100 text-yellow-800',
    refunded: 'bg-red-50 text-red-600',
  };
  const label = COMMERCE_OFFER_STATUS_LABELS[status as keyof typeof COMMERCE_OFFER_STATUS_LABELS]
    ?? COMMERCE_ORDER_STATUS_LABELS[status as keyof typeof COMMERCE_ORDER_STATUS_LABELS]
    ?? status;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Satıcı oluşturma / düzenleme modalı
// ──────────────────────────────────────────────────────────────────────
type VendorFormData = {
  name: string;
  contact_email: string;
  contact_phone: string;
  city: string;
  address_line1: string;
  commission_rate: string;
  payout_iban: string;
  description: string;
  is_active: boolean;
};

const EMPTY_VENDOR_FORM: VendorFormData = {
  name: '', contact_email: '', contact_phone: '',
  city: '', address_line1: '', commission_rate: '15',
  payout_iban: '', description: '', is_active: true,
};

function VendorModal({
  vendor,
  onClose,
  onSave,
}: {
  vendor: CommerceVendor | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = Boolean(vendor);
  const [form, setForm] = useState<VendorFormData>(
    vendor
      ? {
          name: vendor.name,
          contact_email: vendor.contact_email ?? '',
          contact_phone: vendor.contact_phone ?? '',
          city: vendor.city ?? '',
          address_line1: vendor.address_line1 ?? '',
          commission_rate: String(vendor.commission_rate),
          payout_iban: vendor.payout_iban ?? '',
          description: vendor.description ?? '',
          is_active: vendor.is_active,
        }
      : EMPTY_VENDOR_FORM
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof VendorFormData, string>>>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Satıcı adı zorunlu';
    const comm = parseFloat(form.commission_rate);
    if (isNaN(comm) || comm < 0 || comm > 100) e.commission_rate = '0–100 arası olmalı';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        contact_email: form.contact_email.trim() || undefined,
        contact_phone: form.contact_phone.trim() || undefined,
        city: form.city.trim() || undefined,
        address_line1: form.address_line1.trim() || undefined,
        commission_rate: parseFloat(form.commission_rate),
        payout_iban: form.payout_iban.trim() || undefined,
        description: form.description.trim() || undefined,
        is_active: form.is_active,
      };
      if (isEdit && vendor) {
        await caUpdateVendor(vendor.id, payload);
        toast.success('Satıcı güncellendi');
      } else {
        await caCreateVendor(payload);
        toast.success('Satıcı oluşturuldu');
      }
      onSave();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = (
    key: keyof VendorFormData,
    label: string,
    opts?: { type?: string; placeholder?: string; required?: boolean }
  ) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label} {opts?.required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={opts?.type ?? 'text'}
        placeholder={opts?.placeholder}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errors[key] ? 'border-red-400' : 'border-gray-300'}`}
        value={form[key] as string}
        onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setErrors({ ...errors, [key]: undefined }); }}
      />
      {errors[key] && <p className="text-xs text-red-500 mt-0.5">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold">{isEdit ? 'Satıcıyı Düzenle' : 'Yeni Satıcı Ekle'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {field('name', 'Satıcı / Kitapçı Adı', { required: true, placeholder: 'Örnek: ABC Kitapevi' })}
          <div className="grid grid-cols-2 gap-3">
            {field('contact_email', 'E-posta', { type: 'email', placeholder: 'info@kitapevi.com' })}
            {field('contact_phone', 'Telefon', { placeholder: '05xx xxx xx xx' })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('city', 'Şehir', { placeholder: 'İstanbul' })}
            {field('commission_rate', 'Komisyon (%)', { type: 'number', required: true, placeholder: '15' })}
          </div>
          {field('address_line1', 'Adres', { placeholder: 'Mahalle, cadde, kapı no' })}
          {field('payout_iban', 'Ödeme IBAN', { placeholder: 'TR00 0000 0000 0000 0000 0000 00' })}
          {field('description', 'Notlar', { placeholder: 'İsteğe bağlı not' })}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Satıcı aktif (sipariş kabul edebilir)
          </label>
        </div>
        <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">İptal</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 text-sm bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Güncelle' : 'Oluştur'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Satıcı Panel Kullanıcıları — Hesap Oluşturma / Şifre
// ──────────────────────────────────────────────────────────────────────
function VendorUsersPanel({ vendor, onClose }: { vendor: CommerceVendor; onClose: () => void }) {
  const [users, setUsers] = useState<VendorUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [newPass, setNewPass] = useState('');
  const [resetting, setResetting] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await caListVendorUsers(vendor.id);
      setUsers(r.users);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [vendor.id]);
  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      toast.error('Ad, e-posta ve şifre zorunlu'); return;
    }
    setSaving(true);
    try {
      const r = await caCreateVendorAccount(vendor.id, { name: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone.trim() || undefined });
      setLastCreated({ name: r.user.name, email: r.user.email, password: r.password_set });
      setForm({ name: '', email: '', password: '', phone: '' });
      setShowCreate(false);
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!resetTarget || !newPass) return;
    setResetting(true);
    try {
      await caResetVendorPassword(resetTarget, newPass);
      toast.success('Şifre güncellendi');
      setResetTarget(null); setNewPass('');
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setResetting(false); }
  };

  const handleToggle = async (userId: string, current: boolean) => {
    try {
      await caToggleVendorActive(userId, !current);
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Bu kullanıcıyı satıcı panelinden çıkarmak istediğinize emin misiniz?')) return;
    try {
      await caRemoveVendorUser(id);
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Kopyalandı'); };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <UserCog className="w-5 h-5 text-indigo-600" />
              {vendor.name} — Panel Erişimi
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Bu satıcının panel kullanıcıları ve giriş bilgileri</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Giriş URL */}
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
            <div className="flex-1">
              <div className="text-xs text-indigo-600 font-medium mb-0.5">Panel Giriş Adresi</div>
              <div className="text-sm font-mono font-semibold text-indigo-800">
                {window.location.origin}/login
              </div>
              <div className="text-xs text-indigo-500 mt-0.5">→ Giriş sonrası /vendor-panel'e yönlendirilir</div>
            </div>
            <button onClick={() => copy(`${window.location.origin}/login`)} className="text-indigo-400 hover:text-indigo-600">
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {/* Başarıyla oluşturuldu bildirimi */}
          {lastCreated && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="font-semibold text-green-800 text-sm">Hesap oluşturuldu!</span>
                <button onClick={() => setLastCreated(null)} className="ml-auto text-green-400 hover:text-green-600"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Ad:</span>
                  <span className="font-medium">{lastCreated.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">E-posta:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs">{lastCreated.email}</span>
                    <button onClick={() => copy(lastCreated.email)}><Copy className="w-3 h-3 text-gray-400" /></button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Şifre:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-sm font-bold text-indigo-700">{lastCreated.password}</span>
                    <button onClick={() => copy(lastCreated.password)}><Copy className="w-3 h-3 text-gray-400" /></button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-green-600 mt-2">📋 Bu bilgileri satıcıya iletin. Şifre güvenlik için sonradan gösterilmez.</p>
            </div>
          )}

          {/* Mevcut kullanıcılar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1"><Users className="w-4 h-4" /> Panel Kullanıcıları</h4>
              <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700">
                <UserPlus className="w-3.5 h-3.5" /> Yeni Hesap
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin w-5 h-5 text-gray-400" /></div>
            ) : users.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
                Henüz panel kullanıcısı yok.<br />
                <button onClick={() => setShowCreate(true)} className="text-indigo-600 mt-1">İlk hesabı oluştur →</button>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((vu) => {
                  const u = vu.users;
                  return (
                    <div key={vu.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-indigo-700 text-sm font-bold">{u?.name?.[0]?.toUpperCase() ?? '?'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u?.name ?? '—'}</div>
                        <div className="text-xs text-gray-400 truncate">{u?.email ?? '—'}</div>
                        {u?.last_login_at && (
                          <div className="text-xs text-gray-300">Son giriş: {new Date(u.last_login_at).toLocaleDateString('tr-TR')}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${u?.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {u?.is_active ? 'Aktif' : 'Pasif'}
                        </span>
                        {u?.id && (
                          <>
                            <button
                              onClick={() => { setResetTarget(u.id); setNewPass(''); }}
                              title="Şifre Sıfırla"
                              className="text-gray-400 hover:text-amber-500"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggle(u.id, u.is_active)}
                              title={u.is_active ? 'Devre Dışı Bırak' : 'Aktif Et'}
                              className={`text-xs px-1.5 py-0.5 rounded border ${u.is_active ? 'border-red-300 text-red-500 hover:bg-red-50' : 'border-green-300 text-green-600 hover:bg-green-50'}`}
                            >
                              {u.is_active ? 'Durdur' : 'Aktif Et'}
                            </button>
                          </>
                        )}
                        <button onClick={() => handleRemove(vu.id)} title="Panelden çıkar" className="text-gray-300 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Yeni hesap formu */}
          {showCreate && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold">Yeni Panel Hesabı</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Ad Soyad *</label>
                  <input className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Yankı Hanım" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Telefon</label>
                  <input className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    placeholder="05xx..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">E-posta * <span className="text-gray-400">(giriş yapacak adres)</span></label>
                <input type="email" className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="yanki@kitapevi.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Şifre * <span className="text-gray-400">(en az 6 karakter)</span></label>
                <div className="relative mt-0.5">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Güçlü bir şifre belirleyin"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowCreate(false)} className="text-sm text-gray-500 px-3 py-1.5">İptal</button>
                <button onClick={handleCreate} disabled={saving} className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Hesap Oluştur
                </button>
              </div>
            </div>
          )}

          {/* Şifre sıfırlama */}
          {resetTarget && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> Şifre Sıfırla</h4>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="w-full border border-amber-300 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Yeni şifre (en az 6 karakter)"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={handleReset} disabled={resetting || !newPass} className="flex items-center gap-1 text-sm bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Güncelle'}
                </button>
                <button onClick={() => setResetTarget(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
          Satıcı bu hesapla {window.location.origin}/login adresine giriş yapar, otomatik olarak Satıcı Paneli'ne yönlendirilir.
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Satıcılar sekmesi
// ──────────────────────────────────────────────────────────────────────
function VendorTab() {
  const [vendors, setVendors] = useState<CommerceVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVendor, setModalVendor] = useState<CommerceVendor | null | 'new'>(null);
  const [usersPanel, setUsersPanel] = useState<CommerceVendor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await caListVendors();
      setVendors(r.vendors);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (v: CommerceVendor) => {
    if (!confirm(`"${v.name}" satıcısını silmek istediğinize emin misiniz?`)) return;
    try {
      await caDeleteVendor(v.id);
      toast.success('Satıcı silindi');
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Satıcılar ({vendors.length})</h2>
        <button
          onClick={() => setModalVendor('new')}
          className="flex items-center gap-1 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> Yeni Satıcı
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Satıcı</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium">Şehir</th>
              <th className="px-4 py-3 font-medium">Komisyon</th>
              <th className="px-4 py-3 font-medium">Durum</th>
              <th className="px-4 py-3 font-medium">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{v.name}</div>
                  <div className="text-xs text-gray-500">{v.contact_email ?? '—'}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{v.contact_phone ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{v.city ?? '—'}</td>
                <td className="px-4 py-3">%{v.commission_rate}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {v.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => setUsersPanel(v)}
                      className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-100 font-medium"
                      title="Panel Erişimi & Şifre"
                    >
                      <UserCog className="w-3.5 h-3.5" /> Panel
                    </button>
                    <button
                      onClick={() => setModalVendor(v)}
                      className="text-gray-400 hover:text-indigo-600"
                      title="Düzenle"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(v)}
                      className="text-gray-400 hover:text-red-500"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {vendors.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  <Store className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Henüz satıcı yok. "Yeni Satıcı" ile başlayın.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Düzenle / Yeni Satıcı modal */}
      {modalVendor !== null && (
        <VendorModal
          vendor={modalVendor === 'new' ? null : modalVendor}
          onClose={() => setModalVendor(null)}
          onSave={load}
        />
      )}

      {/* Panel erişimi & şifre paneli */}
      {usersPanel && (
        <VendorUsersPanel
          vendor={usersPanel}
          onClose={() => setUsersPanel(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Onay bekleyenler sekmesi
// ──────────────────────────────────────────────────────────────────────
function OnaylarTab() {
  const [offers, setOffers] = useState<CommerceVendorOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejModal, setRejModal] = useState<{ id: string; mode: 'reject' | 'correction' } | null>(null);
  const [rejReason, setRejReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await caListOffers({ status: 'pending_approval', limit: 100 });
      setOffers(r.offers);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    try {
      await caApproveOffer(id);
      toast.success('Teklif onaylandı ve yayına alındı');
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const handleReject = async () => {
    if (!rejModal || !rejReason.trim()) return;
    try {
      if (rejModal.mode === 'reject') await caRejectOffer(rejModal.id, rejReason);
      else await caRequestCorrection(rejModal.id, rejReason);
      toast.success(rejModal.mode === 'reject' ? 'Teklif reddedildi' : 'Düzeltme istendi');
      setRejModal(null);
      setRejReason('');
      load();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-yellow-700">Onay Bekleyen Teklifler ({offers.length})</h2>
        <button onClick={load} className="text-gray-400 hover:text-gray-600"><RefreshCw className="w-4 h-4" /></button>
      </div>
      {offers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>Onay bekleyen teklif yok</p>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((o) => {
            const book = o.book as { title: string; isbn: string | null; cover_image_url: string | null } | null;
            const vendor = o.vendor as { name: string } | null;
            return (
              <div key={o.id} className="border border-yellow-200 bg-yellow-50 rounded-xl p-4">
                <div className="flex gap-4">
                  {book?.cover_image_url && (
                    <img src={book.cover_image_url} alt={book?.title} className="w-14 h-20 object-cover rounded shadow-sm flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{book?.title ?? '—'}</div>
                    <div className="text-sm text-gray-500">ISBN: {book?.isbn ?? '—'} · {vendor?.name ?? '—'}</div>
                    <div className="mt-2 flex gap-4 text-sm">
                      <div><span className="text-gray-500">Fiyat:</span> <strong>{formatCommerceTry(o.price_kurus)}</strong></div>
                      <div><span className="text-gray-500">Stok:</span> <strong>{o.stock_quantity}</strong></div>
                      <div><span className="text-gray-500">Kargo:</span> <strong>{o.shipping_days} gün</strong></div>
                    </div>
                    {o.pending_snapshot && (
                      <div className="mt-1 text-xs text-orange-700 bg-orange-100 px-2 py-1 rounded">
                        Fiyat değişikliği isteği: {formatCommerceTry((o.pending_snapshot as { price_kurus?: number }).price_kurus ?? 0)}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleApprove(o.id)}
                        className="flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Onayla
                      </button>
                      <button
                        onClick={() => { setRejModal({ id: o.id, mode: 'correction' }); setRejReason(''); }}
                        className="flex items-center gap-1 text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Düzeltme İste
                      </button>
                      <button
                        onClick={() => { setRejModal({ id: o.id, mode: 'reject' }); setRejReason(''); }}
                        className="flex items-center gap-1 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reddet
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ret / Düzeltme Modal */}
      {rejModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">
              {rejModal.mode === 'reject' ? 'Teklifi Reddet' : 'Düzeltme İste'}
            </h3>
            <label className="block text-sm text-gray-600 mb-1">
              {rejModal.mode === 'reject' ? 'Red nedeni' : 'Satıcıya not'}
            </label>
            <textarea
              className="w-full border rounded-lg p-2 text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Satıcıya gösterilecek açıklama..."
              value={rejReason}
              onChange={(e) => setRejReason(e.target.value)}
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setRejModal(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">İptal</button>
              <button
                disabled={!rejReason.trim()}
                onClick={handleReject}
                className="text-sm bg-red-600 text-white px-4 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejModal.mode === 'reject' ? 'Reddet' : 'Düzeltme İste'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Kitaplar sekmesi
// ──────────────────────────────────────────────────────────────────────
function KitaplarTab() {
  const [books, setBooks] = useState<CommerceBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await caListBooks({ search: search || undefined, limit: 100 });
      setBooks(r.books);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 350); return () => clearTimeout(t); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="pl-9 pr-3 py-2 border rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Kitap ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-1 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Yeni Kitap
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Kitap</th>
                <th className="px-4 py-3 font-medium">ISBN</th>
                <th className="px-4 py-3 font-medium">Yayınevi</th>
                <th className="px-4 py-3 font-medium">Sınıf</th>
                <th className="px-4 py-3 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {b.cover_image_url ? (
                        <img src={b.cover_image_url} alt={b.title} className="w-8 h-11 object-cover rounded" />
                      ) : (
                        <div className="w-8 h-11 bg-gray-100 rounded" />
                      )}
                      <div>
                        <div className="font-medium">{b.title}</div>
                        <div className="text-xs text-gray-400">{b.author}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{b.isbn ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.publisher ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{(b.class_levels ?? []).join(', ') || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${b.is_catalog_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {b.is_catalog_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                </tr>
              ))}
              {books.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Kitap bulunamadı</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Siparişler sekmesi
// ──────────────────────────────────────────────────────────────────────
function SiparislerTab() {
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await caListOrders({ status: filterStatus || undefined, limit: 100 });
      setOrders(r.orders);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [filterStatus]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-3">
        <h2 className="text-lg font-semibold">Siparişler</h2>
        <select
          className="border rounded-lg text-sm px-2 py-1.5 focus:outline-none"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Tüm durumlar</option>
          {Object.entries(COMMERCE_ORDER_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Sipariş No</th>
                <th className="px-4 py-3 font-medium">Müşteri</th>
                <th className="px-4 py-3 font-medium">Toplam</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{o.order_number}</td>
                  <td className="px-4 py-3">{o.customer_name ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{formatCommerceTry(o.total_kurus)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(o.created_at).toLocaleDateString('tr-TR')}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sipariş bulunamadı</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Hakedişler sekmesi
// ──────────────────────────────────────────────────────────────────────
function HakedislerTab() {
  const [payouts, setPayouts] = useState<CommerceVendorPayout[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await caListPayouts();
      setPayouts(r.payouts);
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Satıcı Hakedişleri</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Satıcı</th>
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
                <td className="px-4 py-3">{(p as unknown as { commerce_vendors?: { name: string } }).commerce_vendors?.name ?? p.vendor_id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-xs">{p.period_start} – {p.period_end}</td>
                <td className="px-4 py-3">{formatCommerceTry(p.gross_sales_kurus)}</td>
                <td className="px-4 py-3 text-red-600">-{formatCommerceTry(p.commission_kurus)}</td>
                <td className="px-4 py-3 font-semibold text-green-700">{formatCommerceTry(p.net_payout_kurus)}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Hakediş kaydı yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Ayarlar sekmesi
// ──────────────────────────────────────────────────────────────────────
function AyarlarTab() {
  const [settings, setSettings] = useState<CommerceSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    caGetSettings().then((r) => setSettings(r.settings)).catch((e: Error) => toast.error(e.message));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await caUpdateSettings({
        commerce_mode: settings.commerce_mode,
        default_commission_rate: settings.default_commission_rate,
        free_shipping_threshold_kurus: settings.free_shipping_threshold_kurus,
        default_shipping_kurus: settings.default_shipping_kurus,
        order_number_prefix: settings.order_number_prefix,
        public_store_enabled: settings.public_store_enabled,
        student_store_enabled: settings.student_store_enabled,
        payment_sandbox: settings.payment_sandbox,
      });
      toast.success('Ayarlar kaydedildi');
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  if (!settings) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold mb-6">Mağaza Ayarları</h2>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ticari Model</label>
          <select
            className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={settings.commerce_mode}
            onChange={(e) => setSettings({ ...settings, commerce_mode: e.target.value as 'reseller' | 'marketplace' })}
          >
            <option value="reseller">Reseller (OVD satıcı, kitapçı tedarikçi)</option>
            <option value="marketplace">Marketplace (çok satıcılı, tam pazaryeri)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Varsayılan Komisyon (%)</label>
          <input
            type="number" min={0} max={100} step={0.5}
            className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={settings.default_commission_rate}
            onChange={(e) => setSettings({ ...settings, default_commission_rate: parseFloat(e.target.value) })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ücretsiz Kargo Eşiği (₺)</label>
            <input
              type="number" min={0}
              className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
              value={settings.free_shipping_threshold_kurus / 100}
              onChange={(e) => setSettings({ ...settings, free_shipping_threshold_kurus: Math.round(parseFloat(e.target.value) * 100) })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kargo Ücreti (₺)</label>
            <input
              type="number" min={0}
              className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
              value={settings.default_shipping_kurus / 100}
              onChange={(e) => setSettings({ ...settings, default_shipping_kurus: Math.round(parseFloat(e.target.value) * 100) })}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sipariş No Ön Eki</label>
          <input
            type="text"
            className="border rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
            value={settings.order_number_prefix}
            onChange={(e) => setSettings({ ...settings, order_number_prefix: e.target.value.toUpperCase().trim() })}
          />
          <p className="text-xs text-gray-400 mt-1">Örnek: {settings.order_number_prefix}-2026-000001</p>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded" checked={settings.public_store_enabled}
              onChange={(e) => setSettings({ ...settings, public_store_enabled: e.target.checked })} />
            Genel mağaza açık
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded" checked={settings.student_store_enabled}
              onChange={(e) => setSettings({ ...settings, student_store_enabled: e.target.checked })} />
            Öğrenci mağazası açık
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded" checked={settings.payment_sandbox}
              onChange={(e) => setSettings({ ...settings, payment_sandbox: e.target.checked })} />
            Test modu
          </label>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Ayarları Kaydet
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Raporlar sekmesi
// ──────────────────────────────────────────────────────────────────────
function RaporlarTab() {
  const [salesData, setSalesData] = useState<{ total_kurus: number; count: number } | null>(null);
  const [lowStock, setLowStock] = useState<CommerceVendorOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([caReportSales(), caReportLowStock()])
      .then(([s, ls]) => {
        setSalesData({ total_kurus: s.total_kurus, count: s.count });
        setLowStock(ls.offers);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
          <div className="text-sm text-indigo-600 font-medium mb-1">Toplam Satış</div>
          <div className="text-2xl font-bold text-indigo-800">{formatCommerceTry(salesData?.total_kurus ?? 0)}</div>
          <div className="text-xs text-indigo-500 mt-1">{salesData?.count ?? 0} sipariş</div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <div className="text-sm text-red-600 font-medium mb-1">Düşük Stok Uyarısı</div>
          <div className="text-2xl font-bold text-red-700">{lowStock.length}</div>
          <div className="text-xs text-red-500 mt-1">teklif stok eşiğinin altında</div>
        </div>
      </div>
      {lowStock.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-red-700">Düşük Stoklu Teklifler</h3>
          <div className="space-y-2">
            {lowStock.map((o) => {
              const book = o.book as { title?: string } | null;
              const vendor = o.vendor as { name?: string } | null;
              return (
                <div key={o.id} className="flex justify-between items-center bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
                  <div>
                    <span className="font-medium">{book?.title ?? '—'}</span>
                    <span className="text-gray-500 ml-2">· {vendor?.name ?? '—'}</span>
                  </div>
                  <span className="font-bold text-red-700">Stok: {o.stock_quantity}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Placeholder sekmeler
// ──────────────────────────────────────────────────────────────────────
function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <ShoppingBag className="w-10 h-10 mb-3 opacity-40" />
      <p className="text-sm">{label} sekmesi yakında</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Ana sayfa
// ──────────────────────────────────────────────────────────────────────
export default function KitapPazaryeriPage() {
  const { effectiveUser } = useAuth();
  const [tab, setTab] = useState<Tab>('kurum-siparis');

  // URL hash ile sekme senkronizasyonu
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.replace('#', '') as Tab;
      if (TABS.some((t) => t.key === hash)) setTab(hash);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const isSuperAdmin = effectiveUser?.role === 'super_admin' || (effectiveUser as { roles?: string[] })?.roles?.includes('super_admin');
  const isAdmin = effectiveUser?.role === 'admin' || (effectiveUser as { roles?: string[] })?.roles?.includes('admin');
  if (!isSuperAdmin && !isAdmin) {
    return <div className="p-6 text-gray-500">Bu sayfaya erişim yetkiniz yok.</div>;
  }

  const renderTab = () => {
    switch (tab) {
      case 'kurum-siparis': return <BookOrdersPage embedded />;
      case 'saticilar': return <VendorTab />;
      case 'onaylar': return <OnaylarTab />;
      case 'kitaplar': return <KitaplarTab />;
      case 'siparisler': return <SiparislerTab />;
      case 'hakedisler': return <HakedislerTab />;
      case 'raporlar': return <RaporlarTab />;
      case 'ayarlar': return <AyarlarTab />;
      default: return <PlaceholderTab label={TABS.find((t) => t.key === tab)?.label ?? tab} />;
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center gap-3 mb-6">
        <ShoppingBag className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Kitap Pazaryeri</h1>
          <p className="text-sm text-gray-500">Sipariş formu · Satıcılar · Onay · Mağaza siparişleri · Hakedişler</p>
        </div>
      </div>

      {/* Sekme navigasyonu */}
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
            {t.key === 'onaylar' && <PendingBadge />}
          </button>
        ))}
      </div>

      {/* İçerik */}
      <div>{renderTab()}</div>
    </div>
  );
}

function PendingBadge() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    caListOffers({ status: 'pending_approval', limit: 1 })
      .then((r) => setCount(r.offers.length))
      .catch(() => null);
  }, []);
  if (!count) return null;
  return <span className="ml-1 bg-yellow-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{count}</span>;
}
