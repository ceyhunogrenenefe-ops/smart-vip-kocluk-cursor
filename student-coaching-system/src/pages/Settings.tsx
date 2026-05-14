// Türkçe: Ayarlar Sayfası — kurum, entegrasyonlar, veri
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { Institution, OrganizationPlan } from '../types';
import {
  Settings,
  Building,
  Save,
  Check,
  Upload,
  Image,
  Database,
  Bell,
  Download,
  Trash2,
  X,
  Plus,
  CheckCircle,
  Brain,
  Webhook,
  MessageCircle,
  Send,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  ExternalLink,
  ClipboardList
} from 'lucide-react';
import { apiFetch, getAuthToken } from '../lib/session';
import { db } from '../lib/database';
import { createInstitutionAdminUser } from '../lib/provisionInstitutionAdmin';
import { AttendanceReportHub } from '../components/attendance/AttendanceReportHub';
import { userHasAnyRole } from '../config/rolePermissions';

/** GET /api/meta/whatsapp yanıtı — sırlar içermez */
interface MetaWhatsAppServerStatus {
  configured: boolean;
  provider?: string;
  graph_api_version?: string;
  phone_number_id_suffix?: string | null;
  waba_id_suffix?: string | null;
  has_token?: boolean;
  hint?: string | null;
}

/** Telefondaki rakamlar (boşluk/tire atılır) */
function institutionPhoneDigits(phone: string | undefined | null): string {
  return String(phone || '').replace(/\D/g, '');
}

/** Online VIP ana hat — kullanıcı isteği: yalnız bu telefonlu kayıt silinmesin (0 ile veya olmadan). */
function isPrimaryOnlineVipInstitution(inst: Institution): boolean {
  const d = institutionPhoneDigits(inst.phone);
  return d === '08503034014' || d === '8503034014';
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { createOrganization } = useOrganization();
  const { institutions, addInstitution, updateInstitution, deleteInstitution, setActiveInstitution, activeInstitutionId, students, coaches, weeklyEntries } = useApp();
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'attendance'>('general');
  const [newInstSale, setNewInstSale] = useState({
    plan: 'professional' as OrganizationPlan,
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    adminPhone: ''
  });

  // Super Admin mi kontrol et
  const isSuperAdmin = user?.role === 'super_admin';
  const showAttendanceTab = userHasAnyRole(user, ['super_admin', 'admin', 'coach', 'teacher']);
  const canManageTwilio = user?.role === 'super_admin' || user?.role === 'admin';

  /** Meta WhatsApp Cloud API — GET /api/meta/whatsapp */
  const [metaWaServerStatus, setMetaWaServerStatus] = useState<MetaWhatsAppServerStatus | null>(null);
  const [metaWaStatusLoading, setMetaWaStatusLoading] = useState(false);
  const [metaWaTestPhone, setMetaWaTestPhone] = useState('');
  const [metaWaTestMessage, setMetaWaTestMessage] = useState('Meta WhatsApp test mesajı.');

  // OpenAI API (tarayıcı BYOK + isteğe bağlı model; sunucuda OPENAI_API_KEY varsa öncelik orada)
  const [openaiApiKey, setOpenaiApiKey] = useState(localStorage.getItem('openai_apiKey') || '');
  const [openaiModel, setOpenaiModel] = useState(() => localStorage.getItem('openai_model') || 'gpt-4o-mini');
  const [openaiServerConfigured, setOpenaiServerConfigured] = useState<boolean | null>(null);
  const [openaiTestLoading, setOpenaiTestLoading] = useState(false);
  const [openaiTestMsg, setOpenaiTestMsg] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingMetaWa, setTestingMetaWa] = useState(false);
  const [metaWaTestResult, setMetaWaTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [orphanPurgeCount, setOrphanPurgeCount] = useState<number | null>(null);
  const [orphanPurgeBusy, setOrphanPurgeBusy] = useState(false);

  const refreshMetaWaStatus = useCallback(async () => {
    if (!canManageTwilio || !getAuthToken()) return;
    setMetaWaStatusLoading(true);
    try {
      const res = await apiFetch('/api/meta/whatsapp');
      const payload = (await res.json().catch(() => ({}))) as { data?: MetaWhatsAppServerStatus };
      if (res.ok && payload?.data) setMetaWaServerStatus(payload.data);
      else setMetaWaServerStatus(null);
    } catch {
      setMetaWaServerStatus(null);
    } finally {
      setMetaWaStatusLoading(false);
    }
  }, [canManageTwilio]);

  useEffect(() => {
    void refreshMetaWaStatus();
  }, [refreshMetaWaStatus]);

  const refreshOpenAiServerStatus = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const res = await apiFetch('/api/ai-chat?scope=openai-status');
      const j = (await res.json().catch(() => ({}))) as { data?: { server_configured?: boolean } };
      if (res.ok && j?.data) setOpenaiServerConfigured(Boolean(j.data.server_configured));
      else setOpenaiServerConfigured(false);
    } catch {
      setOpenaiServerConfigured(false);
    }
  }, []);

  useEffect(() => {
    void refreshOpenAiServerStatus();
  }, [refreshOpenAiServerStatus]);

  // Aktif kurumu bul
  const activeInstitution = institutions.find(i => i.id === activeInstitutionId) || institutions[0];

  const [formData, setFormData] = useState({
    name: activeInstitution?.name || '',
    phone: activeInstitution?.phone || '',
    address: activeInstitution?.address || '',
    email: activeInstitution?.email || '',
    website: activeInstitution?.website || '',
    logo: activeInstitution?.logo || ''
  });

  // Kurum seçildiğinde formu güncelle
  const handleSelectInstitution = (id: string) => {
    setActiveInstitution(id);
    const inst = institutions.find(i => i.id === id);
    if (inst) {
      setFormData({
        name: inst.name,
        phone: inst.phone,
        address: inst.address,
        email: inst.email,
        website: inst.website,
        logo: inst.logo || ''
      });
    }
    setShowAddForm(false);
  };

  // Logo yükleme işlemi
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Dosya boyutu 2MB\'dan büyük olamaz!');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setFormData({ ...formData, logo: base64 });
      };
      reader.readAsDataURL(file);
    }
  };

  // Logo kaldırma
  const handleRemoveLogo = () => {
    setFormData({ ...formData, logo: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    if (activeInstitutionId) {
      updateInstitution(activeInstitutionId, { ...formData });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleAddNew = async () => {
    const name = (formData.name || 'Yeni Kurum').trim();
    const email = formData.email.trim();
    if (!email) {
      alert('Kurum e-postası zorunludur.');
      return;
    }
    if (getAuthToken()) {
      if (!newInstSale.adminName.trim()) {
        alert('Kurum yöneticisi adı soyadı zorunludur (müşteri teslimi).');
        return;
      }
      if (!newInstSale.adminEmail.trim()) {
        alert('Yönetici giriş e-postası zorunludur.');
        return;
      }
      if (newInstSale.adminPassword.trim().length < 6) {
        alert('Yönetici şifresi en az 6 karakter olmalıdır.');
        return;
      }
    }
    const newInstitution: Institution = {
      id: Date.now().toString(),
      name,
      phone: formData.phone,
      address: formData.address,
      email: email.toLowerCase(),
      website: formData.website,
      logo: formData.logo,
      isActive: false,
      createdAt: new Date().toISOString()
    };
    const created = await addInstitution(newInstitution, { plan: newInstSale.plan });
    if (!created?.id) {
      alert('Kurum oluşturulamadı. Oturum ve API erişimini kontrol edin.');
      return;
    }
    try {
      await createOrganization(
        {
          name,
          email: email.toLowerCase(),
          phone: formData.phone || '',
          address: formData.address || '',
          plan: newInstSale.plan
        },
        { reuseInstitutionId: created.id, setAsActive: true }
      );
      if (getAuthToken()) {
        await createInstitutionAdminUser({
          institutionId: created.id,
          adminName: newInstSale.adminName.trim(),
          adminEmail: newInstSale.adminEmail.trim().toLowerCase(),
          adminPassword: newInstSale.adminPassword.trim(),
          adminPhone: newInstSale.adminPhone.trim() || null,
          plan: newInstSale.plan
        });
        alert(
          `Kurum ve ilk yönetici oluşturuldu. Öğrenci/koç/öğretmen eklenmedi.\n\nMüşteri girişi:\nE-posta: ${newInstSale.adminEmail.trim().toLowerCase()}\nŞifre: kurulumda girdiğiniz değer`
        );
      } else {
        alert('Kurum kaydedildi. Oturum açılmadığı için yönetici hesabı oluşturulmadı; giriş yaptıktan sonra bu kurum için kullanıcı ekleyebilirsiniz.');
      }
      setActiveInstitution(created.id);
      setShowAddForm(false);
      setNewInstSale({
        plan: 'professional',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        adminPhone: ''
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Kurum sonrası kayıt hatası (yönetici oluşturulamadıysa Kullanıcı Yönetimi’nden ekleyin).');
    }
  };

  const handleDelete = (id: string) => {
    const inst = institutions.find((i) => i.id === id);
    if (inst && isPrimaryOnlineVipInstitution(inst)) {
      alert(
        'Bu kurum (Online VIP Dershane / 0850 303 40 14) ana kayıttır ve silinemez. Diğer kurumları silebilirsiniz.'
      );
      return;
    }
    if (!isSuperAdmin) {
      alert('Kurum silmek için Süper Admin ile oturum açmalısınız.');
      return;
    }
    if (
      confirm(
        'Bu kurumu silmek istediğinizden emin misiniz? Bu kuruma bağlı öğrenci/kullanıcı varsa silme reddedilir.'
      )
    ) {
      void deleteInstitution(id);
    }
  };

  // OpenAI API kaydet (anahtar + model — tarayıcıda)
  const saveOpenAIConfig = () => {
    localStorage.setItem('openai_apiKey', openaiApiKey);
    localStorage.setItem('openai_model', (openaiModel || 'gpt-4o-mini').trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const clearOpenAiBrowserKey = () => {
    localStorage.removeItem('openai_apiKey');
    setOpenaiApiKey('');
    setOpenaiTestMsg('Tarayıcıdaki API anahtarı silindi.');
    setTimeout(() => setOpenaiTestMsg(null), 4000);
  };

  const testOpenAiConnection = async () => {
    if (!getAuthToken()) {
      setOpenaiTestMsg('Oturum açmanız gerekir.');
      return;
    }
    setOpenaiTestLoading(true);
    setOpenaiTestMsg(null);
    try {
      const res = await apiFetch('/api/ai-chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Yalnızca şu kelimeyi yaz: tamam',
          studentContext: 'Bağlantı testi',
          openai_api_key: openaiApiKey.trim() || undefined,
          model: (openaiModel || 'gpt-4o-mini').trim()
        })
      });
      const j = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
      if (!res.ok) {
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setOpenaiTestMsg(j.content ? `Yanıt: ${String(j.content).slice(0, 120)}` : 'Bağlantı başarılı.');
      void refreshOpenAiServerStatus();
    } catch (e) {
      setOpenaiTestMsg(e instanceof Error ? e.message : 'Test başarısız');
    } finally {
      setOpenaiTestLoading(false);
    }
  };

  /** Meta test — admin/süper admin `/api/whatsapp/send` (log + Meta) */
  const testMetaWaMessage = async () => {
    const trimmed = metaWaTestPhone.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (!digits || digits.length < 10) {
      setMetaWaTestResult({
        success: false,
        message: 'Alıcı telefonu girin (örn. 0555… veya +90555…).'
      });
      return;
    }
    const msg = metaWaTestMessage.trim();
    if (!msg) {
      setMetaWaTestResult({ success: false, message: 'Mesaj metni boş olamaz.' });
      return;
    }
    setTestingMetaWa(true);
    setMetaWaTestResult(null);
    try {
      const res = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: trimmed, message: msg })
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; sid?: string; error?: string };
      if (!res.ok) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      setMetaWaTestResult({
        success: true,
        message: `Mesaj gönderildi.${payload.sid ? ` ID: ${payload.sid}` : ''}`
      });
      void refreshMetaWaStatus();
    } catch (e) {
      setMetaWaTestResult({
        success: false,
        message: e instanceof Error ? e.message : 'Gönderilemedi.'
      });
    } finally {
      setTestingMetaWa(false);
    }
  };

  // JSON Export
  const exportData = () => {
    const data = {
      students,
      coaches,
      weeklyEntries,
      institutions,
      activeInstitutionId,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Veri temizleme
  const clearAllData = () => {
    if (confirm('Tüm verileri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!')) {
      if (confirm('Bu işlem çok tehlikeli! Emin misiniz?')) {
        alert('Veri temizleme işlemi devre dışı bırakıldı. Lütfen manuel olarak veritabanını temizleyin.');
      }
    }
  };

  const handleOrphanInstitutionsPreview = async () => {
    if (!getAuthToken()) {
      alert('Önizleme için oturum açmalısınız.');
      return;
    }
    setOrphanPurgeBusy(true);
    try {
      const d = await db.institutionsPurgePreview();
      setOrphanPurgeCount(d.candidate_count);
      alert(`Silinebilecek yetim kurum sayısı: ${d.candidate_count}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Önizleme başarısız');
    } finally {
      setOrphanPurgeBusy(false);
    }
  };

  const handleOrphanInstitutionsExecute = async () => {
    if (!getAuthToken()) {
      alert('Oturum açmalısınız.');
      return;
    }
    if (orphanPurgeCount == null) {
      alert('Önce "Yetim kurumları say" ile önizleme yapın.');
      return;
    }
    if (orphanPurgeCount === 0) {
      alert('Silinecek yetim kurum yok.');
      return;
    }
    if (
      !confirm(
        `Veritabanından ${orphanPurgeCount} yetim kurumu kalıcı olarak silmek istiyor musunuz?\n\n` +
          'Yalnızca öğrenci/koç/kullanıcı kaydına bağlı olmayan kurumlar silinir. Online VIP (ad veya 0850 303 40 14) korunur.'
      )
    ) {
      return;
    }
    setOrphanPurgeBusy(true);
    try {
      const d = await db.institutionsPurgeExecute();
      alert(`${d.deleted} kurum silindi. Liste yenilenecek.`);
      setOrphanPurgeCount(null);
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Silme başarısız');
    } finally {
      setOrphanPurgeBusy(false);
    }
  };

  // Footer'da kullanılacak kurum bilgisi
  const footerInstitution = activeInstitution || institutions[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl flex items-center justify-center">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Ayarlar</h2>
            <p className="text-gray-500">Kurum ve entegrasyon ayarları</p>
          </div>
        </div>
      </div>

      {showAttendanceTab && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
          <button
            type="button"
            onClick={() => setSettingsTab('general')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              settingsTab === 'general'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Genel ayarlar
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('attendance')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              settingsTab === 'attendance'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Yoklama raporu
          </button>
        </div>
      )}

      {settingsTab === 'attendance' && showAttendanceTab ? (
        <AttendanceReportHub institutions={institutions} activeInstitutionId={activeInstitutionId} />
      ) : (
      <>
      {/* Kurum: liste + seçili kurum bilgisi + logo (tek kart) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Building className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800">Kurum ayarları</h3>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => {
                setShowAddForm(true);
                setFormData({
                  name: '',
                  phone: '',
                  address: '',
                  email: '',
                  website: '',
                  logo: ''
                });
                setNewInstSale({
                  plan: 'professional',
                  adminName: '',
                  adminEmail: '',
                  adminPassword: '',
                  adminPhone: ''
                });
              }}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Yeni Kurum Ekle
            </button>
          )}
        </div>

        {!isSuperAdmin && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Kurum ekleme yalnızca süper yönetici ile yapılabilir. Kendi kurum bilgilerinizi buradan güncelleyebilirsiniz.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {institutions.map((inst) => (
            <div
              key={inst.id}
              onClick={() => handleSelectInstitution(inst.id)}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                activeInstitutionId === inst.id || (!activeInstitutionId && inst === institutions[0])
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {inst.logo ? (
                    <img src={inst.logo} alt={inst.name} className="w-10 h-10 rounded-lg object-contain" />
                  ) : (
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                      <Building className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-slate-800">{inst.name}</p>
                    <p className="text-sm text-gray-500">{inst.phone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(activeInstitutionId === inst.id || (!activeInstitutionId && inst === institutions[0])) && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  {isSuperAdmin && !isPrimaryOnlineVipInstitution(inst) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(inst.id);
                      }}
                      className="p-1 text-red-500 hover:bg-red-100 rounded"
                      type="button"
                      title="Kurumu sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {showAddForm && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <h4 className="font-semibold text-yellow-800 mb-4">Yeni Kurum Ekle</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kurum Adı *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Kurum adını girin"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kurum e-postası *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="kurum@ornek.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Paket</label>
                <select
                  value={newInstSale.plan}
                  onChange={(e) =>
                    setNewInstSale((p) => ({
                      ...p,
                      plan: e.target.value as OrganizationPlan
                    }))
                  }
                  className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="md:col-span-2 border-t border-yellow-200 pt-3 mt-1">
                <p className="text-sm font-medium text-yellow-900 mb-2">İlk kurum yöneticisi (müşteriye vereceğiniz giriş)</p>
                <p className="text-xs text-yellow-800 mb-3">
                  Öğrenci, koç veya öğretmen oluşturulmaz; yalnızca bu yönetici hesabı eklenir.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Yönetici adı soyadı *</label>
                    <input
                      type="text"
                      value={newInstSale.adminName}
                      onChange={(e) => setNewInstSale((p) => ({ ...p, adminName: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Yönetici giriş e-postası *</label>
                    <input
                      type="email"
                      value={newInstSale.adminEmail}
                      onChange={(e) => setNewInstSale((p) => ({ ...p, adminEmail: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Yönetici telefon (opsiyonel)</label>
                    <input
                      type="tel"
                      value={newInstSale.adminPhone}
                      onChange={(e) => setNewInstSale((p) => ({ ...p, adminPhone: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">İlk şifre (min 6) *</label>
                    <input
                      type="password"
                      value={newInstSale.adminPassword}
                      onChange={(e) => setNewInstSale((p) => ({ ...p, adminPassword: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleAddNew}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Ekle ve Aktif Yap
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewInstSale({
                    plan: 'professional',
                    adminName: '',
                    adminEmail: '',
                    adminPassword: '',
                    adminPhone: ''
                  });
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-gray-100 pt-6 space-y-6">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-800">Seçili kurum — {activeInstitution?.name || '—'}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kurum Adı *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <Image className="w-5 h-5 text-slate-600" />
              <h4 className="font-semibold text-slate-800">Kurum logosu</h4>
            </div>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden">
                {formData.logo ? (
                  <img src={formData.logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Building className="w-12 h-12 text-slate-400" />
                )}
              </div>
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Logo Yükle
                  </button>
                  {formData.logo && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Kaldır
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-2">PNG, JPG veya SVG. Maksimum 2MB.</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
          >
            {saved ? (
              <>
                <Check className="w-5 h-5" />
                Kaydedildi!
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Kaydet
              </>
            )}
          </button>

          {isSuperAdmin && getAuthToken() && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/90 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-950">Yetim kurum temizliği (süper yönetici)</p>
              <p className="text-xs text-amber-900 leading-relaxed">
                Uygulama açılışında oluşan yinelenen kurumlar için: hiçbir öğrenci, koç veya kullanıcı kaydına bağlı
                olmayan kurumları veritabanından kaldırır. “Online VIP Ders ve Koçluk” adı veya 0850 303 40 14 ana hattı
                olan satır silinmez.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={orphanPurgeBusy}
                  onClick={() => void handleOrphanInstitutionsPreview()}
                  className="px-3 py-2 text-sm rounded-lg border border-amber-400 text-amber-950 hover:bg-amber-100 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {orphanPurgeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Yetim kurumları say
                </button>
                <button
                  type="button"
                  disabled={orphanPurgeBusy || orphanPurgeCount == null || orphanPurgeCount === 0}
                  onClick={() => void handleOrphanInstitutionsExecute()}
                  className="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Sayılan yetim kurumları sil
                </button>
                {orphanPurgeCount != null && (
                  <span className="text-xs text-amber-950">Son önizleme: {orphanPurgeCount} kurum</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Meta WhatsApp Cloud API — sunucu ortamı */}
      {canManageTwilio && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-green-800">Meta WhatsApp (sunucu)</h4>
                <button
                  type="button"
                  onClick={() => void refreshMetaWaStatus()}
                  className="text-xs px-2 py-1 rounded border border-green-300 text-green-800 hover:bg-green-100"
                >
                  Durumu yenile
                </button>
              </div>
              <p className="text-sm text-green-800">
                Anahtarlar tarayıcıya yazılmaz; yalnızca{' '}
                <strong>Vercel → Project → Settings → Environment Variables</strong> içinde tanımlıdır. Otomasyonlar Meta
                şablon mesajı ile gider.
              </p>
              <div className="rounded-lg bg-white/70 border border-green-100 p-3 text-sm text-green-900">
                {metaWaStatusLoading ? (
                  <p className="flex items-center gap-2 text-green-700">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sunucu yapılandırması kontrol ediliyor…
                  </p>
                ) : metaWaServerStatus?.configured ? (
                  <ul className="space-y-1">
                    <li>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">
                        Aktif
                      </span>{' '}
                      Meta WhatsApp ortamı tamam.
                    </li>
                    <li className="rounded-md border border-slate-200 bg-white/80 px-2 py-1 text-slate-900">
                      <strong>Graph API:</strong>{' '}
                      {metaWaServerStatus.graph_api_version || '—'}
                      {metaWaServerStatus.phone_number_id_suffix && (
                        <>
                          {' '}
                          · <strong>Phone number id (sonu):</strong> …{metaWaServerStatus.phone_number_id_suffix}
                        </>
                      )}
                      {metaWaServerStatus.waba_id_suffix && (
                        <>
                          {' '}
                          · <strong>WABA (sonu):</strong> …{metaWaServerStatus.waba_id_suffix}
                        </>
                      )}
                    </li>
                    {metaWaServerStatus.hint && (
                      <li className="text-xs text-slate-700">{metaWaServerStatus.hint}</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-amber-900">
                    Eksik veya okunamadı. Vercel’de şunları ekleyin (Production + redeploy):{' '}
                    <code className="rounded bg-amber-100 px-1 text-xs">META_WHATSAPP_TOKEN</code>,{' '}
                    <code className="rounded bg-amber-100 px-1 text-xs">META_PHONE_NUMBER_ID</code>,{' '}
                    <code className="rounded bg-amber-100 px-1 text-xs">META_WABA_ID</code>.
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-xs text-green-700 mb-1">Test alıcısı (+90 / 05…)</label>
                    <input
                      type="tel"
                      value={metaWaTestPhone}
                      onChange={(e) => setMetaWaTestPhone(e.target.value)}
                      placeholder="+905551112233 veya 05551112233"
                      className="w-full px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void testMetaWaMessage()}
                    disabled={testingMetaWa || !metaWaServerStatus?.configured}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 min-h-[42px]"
                  >
                    {testingMetaWa ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Test WhatsApp gönder
                  </button>
                </div>
                <div>
                  <label className="block text-xs text-green-700 mb-1">Mesaj</label>
                  <textarea
                    value={metaWaTestMessage}
                    onChange={(e) => setMetaWaTestMessage(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>
              </div>
              {metaWaTestResult && (
                <div
                  className={`p-3 rounded-lg ${metaWaTestResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                >
                  <p className="text-sm">{metaWaTestResult.message}</p>
                </div>
              )}
              <div className="bg-white/50 rounded-lg p-3 text-xs text-green-800 space-y-1">
                <p className="font-medium">Kurulum özeti</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>
                    <a
                      href="https://developers.facebook.com/docs/whatsapp/cloud-api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-green-950"
                    >
                      Meta WhatsApp Cloud API
                    </a>{' '}
                    — kalıcı token, telefon numarası kimliği ve WABA
                  </li>
                  <li>Değişkenleri Vercel’e kaydedin; <strong>Redeploy</strong> gerekebilir.</li>
                  <li>Şablon mesajları için Business Manager’da onaylı şablon ve WA şablonları ekranında eşleştirme yapın.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Otomatik WhatsApp cron özeti (Meta + Vercel) */}
      {canManageTwilio && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 space-y-2 text-sm text-amber-950">
              <h4 className="font-semibold text-amber-900">Otomatik WhatsApp — cron özeti</h4>
              <p className="rounded-md border border-amber-300 bg-amber-100/80 px-2 py-1.5 text-amber-950">
                <strong>Cron (Vercel her zaman UTC):</strong> canlı özel ders{' '}
                <code className="rounded bg-white/90 px-1">/api/cron/lesson-reminders</code> —{' '}
                <code className="rounded bg-white/90 px-1">*/5 * * * *</code>; günlük rapor{' '}
                <code className="rounded bg-white/90 px-1">/api/cron/daily-report-reminders</code> —{' '}
                <code className="rounded bg-white/90 px-1">0 19 * * *</code> UTC = her gün saat{' '}
                <strong>22:00 İstanbul</strong> (TR sabit UTC+3).{' '}
                <span className="text-amber-900">
                  UTC için <code className="rounded bg-white/80 px-1">0 22 * * *</code> kullanmayın; İstanbul’da 01:00 tetiklenir.
                </span>{' '}
                Uçlar Bearer ile de tetiklenebilir; üretimde handler yine İstanbul 22 filtresi uygular.
              </p>
              <div className="rounded-lg bg-white/80 border border-amber-100 p-3 font-mono text-xs space-y-1 break-all">
                <p className="text-amber-800 font-sans text-[11px] font-medium">Örnek uçlar (deploy sonrası):</p>
                <p>
                  <span className="text-amber-700">meeting-reminders:</span>{' '}
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/cron/meeting-reminders` : '/api/cron/meeting-reminders'}
                </p>
                <p>
                  <span className="text-amber-700">coach-whatsapp-auto:</span>{' '}
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/cron/coach-whatsapp-auto` : '/api/cron/coach-whatsapp-auto'}
                </p>
                <p>
                  <span className="text-amber-700">lesson-reminders:</span>{' '}
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/cron/lesson-reminders` : '/api/cron/lesson-reminders'}
                </p>
                <p>
                  <span className="text-amber-700">daily-report-reminders:</span>{' '}
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/cron/daily-report-reminders` : '/api/cron/daily-report-reminders'}
                </p>
                <p className="text-amber-800 pt-2 font-sans text-[11px]">
                  Vercel dışından tetiklerken:{' '}
                  <code className="bg-amber-100 px-1 rounded">Authorization: Bearer &lt;MEETING_CRON_SECRET veya CRON_SECRET&gt;</code>
                </p>
              </div>
              <p className="text-xs text-amber-900 pt-1">
                Günlük rapor ve koç otomasyonları için Vercel Cron ve ilgili SQL migration dosyaları repoda{' '}
                <code className="rounded bg-amber-100 px-1">sql/</code> klasöründedir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Ayarları */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 space-y-3">
            <h4 className="font-semibold text-purple-800">AI Koç Entegrasyonu (OpenAI)</h4>
            <p className="text-sm text-purple-700">
              Öncelik: sunucu ortamındaki <code className="text-xs bg-white/70 px-1 rounded">OPENAI_API_KEY</code>.
              Tanımlı değilse aşağıdaki anahtar (tarayıcıda saklanır) istekle birlikte kullanılır.
            </p>
            <p className="text-xs text-purple-800/90 rounded-lg bg-white/60 border border-purple-100 px-3 py-2">
              Sunucu anahtarı:{' '}
              {openaiServerConfigured === null
                ? 'Kontrol ediliyor…'
                : openaiServerConfigured
                  ? 'Tanımlı (Vercel / API sunucusu ortam değişkeni).'
                  : 'Görünmüyor — BYOK için aşağıya anahtar girebilir veya ortam değişkenini ekleyebilirsiniz.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative min-w-0">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="Tarayıcı için sk-... (isteğe bağlı BYOK)"
                  autoComplete="off"
                  className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <label className="text-sm sm:w-44 flex flex-col gap-1">
                <span className="text-xs text-purple-700">Model</span>
                <select
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                  className="px-3 py-2 border border-purple-200 rounded-lg text-sm bg-white"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                  <option value="gpt-4">gpt-4</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                  <option value="o1-mini">o1-mini</option>
                  <option value="o1-preview">o1-preview</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveOpenAIConfig}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Kaydet
              </button>
              <button
                type="button"
                onClick={() => void testOpenAiConnection()}
                disabled={openaiTestLoading}
                className="px-4 py-2 border border-purple-300 text-purple-800 rounded-lg hover:bg-purple-100/80 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
              >
                {openaiTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Bağlantıyı test et
              </button>
              <button
                type="button"
                onClick={clearOpenAiBrowserKey}
                className="px-4 py-2 text-sm text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
              >
                Tarayıcı anahtarını sil
              </button>
            </div>
            {openaiTestMsg ? (
              <p className="text-xs text-slate-700 bg-white/80 border border-purple-100 rounded-lg px-3 py-2">
                {openaiTestMsg}
              </p>
            ) : null}
            <p className="text-xs text-purple-600">
              BYOK anahtarı yalnızca bu tarayıcıda saklanır; üretimde tercihen sunucu ortamı kullanın.
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline ml-1">
                OpenAI API Keys
                <ExternalLink className="w-3 h-3 inline ml-1" />
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Webhook Ayarları */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Webhook className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-800 mb-2">Webhook Entegrasyonu</h4>
            <p className="text-sm text-blue-700 mb-3">
              Edisis veya benzeri sınav sistemlerinden otomatik veri çekmek için webhook URL'inizi alın.
            </p>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <code className="text-sm text-blue-700 break-all">
                {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/exam-results
              </code>
            </div>
            <p className="text-xs text-blue-600 mt-2">
              Bu URL'yi sınav sisteminize webhook olarak tanımlayın. Veriler otomatik olarak öğrencilere eklenecektir.
            </p>
          </div>
        </div>
      </div>

      {/* Veri Yönetimi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-800">Veri Yönetimi</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* İstatistikler */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="font-medium text-slate-800 mb-3">Mevcut Veriler</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Öğrenciler</span>
                <span className="font-medium">{students.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Eğitim Koçları</span>
                <span className="font-medium">{coaches.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Kayıtlar</span>
                <span className="font-medium">{weeklyEntries.length}</span>
              </div>
            </div>
          </div>

          {/* İşlemler */}
          <div className="space-y-3">
            <button
              onClick={exportData}
              className="w-full px-4 py-3 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Tüm Veriyi İndir (JSON)
            </button>

            <button
              onClick={clearAllData}
              className="w-full px-4 py-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              Tüm Veriyi Sil
            </button>
          </div>
        </div>
      </div>

      {/* Sürüm Bilgisi */}
      <div className="text-center text-sm text-gray-500 py-4">
        <p>Öğrenci Koçluk ve Takip Sistemi v1.1.0</p>
        <p className="mt-1">© 2024 {footerInstitution?.name || 'Sistem'}. Tüm hakları saklıdır.</p>
      </div>
    </>
      )}
    </div>
  );
}
