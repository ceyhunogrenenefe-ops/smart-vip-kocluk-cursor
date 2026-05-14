// Türkçe: Sistem Yönetimi Sayfası - Super Admin İçin
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, SystemUser } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useApp } from '../context/AppContext';
import { db } from '../lib/database';
import { getAuthToken } from '../lib/session';
import { userRowToSystemUser } from '../lib/userRowToSystemUser';
import {
  Settings,
  Users,
  Building2,
  Database,
  CreditCard,
  Key,
  Shield,
  Check,
  X,
  Search,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Lock,
  Globe,
  Server,
  Activity
} from 'lucide-react';
import CronSummarySection from '../components/system/CronSummarySection';

// PayTR yapılandırması
interface PayTRConfig {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  enabled: boolean;
}

function roleBadgeClasses(role: SystemUser['role']) {
  switch (role) {
    case 'super_admin':
      return 'bg-amber-100 text-amber-700';
    case 'admin':
      return 'bg-red-100 text-red-700';
    case 'coach':
      return 'bg-blue-100 text-blue-700';
    case 'teacher':
      return 'bg-violet-100 text-violet-800';
    case 'student':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function roleLabelTr(role: SystemUser['role']) {
  switch (role) {
    case 'super_admin':
      return 'Süper Admin';
    case 'admin':
      return 'Yönetici';
    case 'coach':
      return 'Koç';
    case 'teacher':
      return 'Öğretmen';
    case 'student':
      return 'Öğrenci';
    default:
      return role;
  }
}

export default function SystemManagement() {
  const { user, getAllUsers, createUser, updateUser, deleteUser } = useAuth();
  const { organizations, createOrganization } = useOrganization();
  const { students, coaches, institutions: appInstitutions, addInstitution } = useApp();

  const [apiManagedUsers, setApiManagedUsers] = useState<SystemUser[] | null>(null);

  const refreshUserDirectory = useCallback(async () => {
    if (getAuthToken()) {
      try {
        const rows = await db.getUsers();
        setApiManagedUsers(rows.map((r) => userRowToSystemUser(r, { coaches, students })));
      } catch {
        setApiManagedUsers(null);
      }
      return;
    }
    setApiManagedUsers(null);
  }, [coaches, students]);

  useEffect(() => {
    void refreshUserDirectory();
  }, [refreshUserDirectory]);

  const [activeTab, setActiveTab] = useState<'users' | 'organizations' | 'payments' | 'system'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    phone: '',
    institutionId: '',
    role: 'admin' as SystemUser['role'],
    password: ''
  });
  const [newOrgForm, setNewOrgForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    plan: 'starter' as 'starter' | 'professional' | 'enterprise'
  });

  // PayTR Ayarları
  const [paytrConfig, setPaytrConfig] = useState<PayTRConfig>({
    merchantId: localStorage.getItem('paytr_merchantId') || '',
    merchantKey: localStorage.getItem('paytr_merchantKey') || '',
    merchantSalt: localStorage.getItem('paytr_merchantSalt') || '',
    enabled: localStorage.getItem('paytr_enabled') === 'true'
  });

  // Sistem ayarları
  const [systemSettings, setSystemSettings] = useState({
    maintenanceMode: localStorage.getItem('system_maintenance') === 'true',
    registrationEnabled: localStorage.getItem('system_registration') !== 'false',
    whatsappEnabled: localStorage.getItem('system_whatsapp') === 'true',
    emailNotifications: localStorage.getItem('system_email') !== 'false',
    apiAccess: localStorage.getItem('system_api') === 'true'
  });

  const [showSecrets, setShowSecrets] = useState({
    merchantKey: false,
    merchantSalt: false
  });

  const tenantRoles: SystemUser['role'][] = ['admin', 'coach', 'teacher', 'student'];

  const dbInstitutionIdSet = new Set(appInstitutions.map((i) => i.id));

  /** Kurum kartları: veritabanı + yalnızca yerelde kalan kurumlar */
  const mergedOrgCount =
    appInstitutions.length +
    organizations.filter((o) => !dbInstitutionIdSet.has(o.id)).length;

  // Kullanıcılar: oturum + Supabase varsa API (`users` tablosu), yoksa yerel demo + managed liste
  const allUsers = apiManagedUsers ?? getAllUsers();
  const filteredUsers = allUsers.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // PayTR ayarlarını kaydet
  const savePayTRConfig = () => {
    localStorage.setItem('paytr_merchantId', paytrConfig.merchantId);
    localStorage.setItem('paytr_merchantKey', paytrConfig.merchantKey);
    localStorage.setItem('paytr_merchantSalt', paytrConfig.merchantSalt);
    localStorage.setItem('paytr_enabled', paytrConfig.enabled.toString());
    alert('PayTR ayarları kaydedildi!');
  };

  // Sistem ayarlarını kaydet
  const saveSystemSettings = () => {
    Object.entries(systemSettings).forEach(([key, value]) => {
      localStorage.setItem(`system_${key}`, value.toString());
    });
    alert('Sistem ayarları kaydedildi!');
  };

  const tabs = [
    { id: 'users' as const, label: 'Kullanıcılar', icon: Users, count: allUsers.length },
    { id: 'organizations' as const, label: 'Kurumlar', icon: Building2, count: mergedOrgCount },
    { id: 'payments' as const, label: 'Ödeme Sistemleri', icon: CreditCard, count: 0 },
    { id: 'system' as const, label: 'Sistem Ayarları', icon: Server, count: 0 }
  ];

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.name.trim() || !newUserForm.email.trim() || !newUserForm.password.trim()) {
      alert('Ad, e-posta ve şifre zorunludur.');
      return;
    }
    if (newUserForm.password.trim().length < 6) {
      alert('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    const needsInstitution =
      getAuthToken() && tenantRoles.includes(newUserForm.role);

    if (needsInstitution) {
      if (!appInstitutions.length) {
        alert('Önce Kurumlar sekmesinden veritabanına bir kurum ekleyin.');
        return;
      }
      if (!newUserForm.institutionId.trim()) {
        alert('Bu rol için kurum seçmelisiniz.');
        return;
      }
    }

    setSavingUser(true);
    try {
      if (getAuthToken()) {
        await db.createUser({
          email: newUserForm.email.trim().toLowerCase(),
          name: newUserForm.name.trim(),
          phone: newUserForm.phone.trim() || null,
          role: newUserForm.role,
          password_hash: newUserForm.password,
          institution_id: needsInstitution ? newUserForm.institutionId.trim() : null,
          is_active: true,
          package: 'trial',
          start_date: new Date().toISOString(),
          end_date: null,
          created_by: null
        });
        setShowAddUser(false);
        setNewUserForm({
          name: '',
          email: '',
          phone: '',
          institutionId: '',
          role: 'admin',
          password: ''
        });
        await refreshUserDirectory();
        alert('Kullanıcı oluşturuldu.');
      } else {
        const result = await createUser({
          name: newUserForm.name.trim(),
          email: newUserForm.email.trim().toLowerCase(),
          phone: newUserForm.phone.trim(),
          role: newUserForm.role,
          password: newUserForm.password
        });
        if (!result.success) {
          alert(result.message || 'Kullanıcı oluşturulamadı.');
          return;
        }
        setShowAddUser(false);
        setNewUserForm({
          name: '',
          email: '',
          phone: '',
          institutionId: '',
          role: 'admin',
          password: ''
        });
        await refreshUserDirectory();
        alert('Kullanıcı oluşturuldu (yerel liste). Tam senkron için giriş ve Supabase gerekir.');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgForm.name.trim() || !newOrgForm.email.trim() || !newOrgForm.phone.trim()) {
      alert('Kurum adı, e-posta ve telefon zorunludur.');
      return;
    }
    setSavingOrg(true);
    try {
      if (getAuthToken()) {
        const created = await addInstitution(
          {
            id: '',
            name: newOrgForm.name.trim(),
            email: newOrgForm.email.trim().toLowerCase(),
            phone: newOrgForm.phone.trim(),
            address: newOrgForm.address.trim(),
            website: '',
            logo: '',
            isActive: true,
            createdAt: new Date().toISOString()
          },
          { plan: newOrgForm.plan }
        );
        if (!created?.id) {
          alert('Kurum veritabanına eklenemedi. Oturum veya yetkileri kontrol edin.');
          return;
        }
        await createOrganization(
          {
            name: newOrgForm.name.trim(),
            email: newOrgForm.email.trim().toLowerCase(),
            phone: newOrgForm.phone.trim(),
            address: newOrgForm.address.trim(),
            plan: newOrgForm.plan
          },
          { reuseInstitutionId: created.id, setAsActive: false }
        );
      } else {
        await createOrganization({
          name: newOrgForm.name.trim(),
          email: newOrgForm.email.trim().toLowerCase(),
          phone: newOrgForm.phone.trim(),
          address: newOrgForm.address.trim(),
          plan: newOrgForm.plan
        });
      }
      setShowAddOrg(false);
      setNewOrgForm({ name: '', email: '', phone: '', address: '', plan: 'starter' });
      alert(
        getAuthToken()
          ? 'Kurum veritabanına ve yerel liste kaydedildi. Bu kuruma yönetici atamak için kullanıcı eklerken aynı kurumu seçin.'
          : 'Kurum yalnızca yerel kaydedildi. Veritabanı senkronu için giriş yapın.'
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kurum oluşturulamadı.');
    } finally {
      setSavingOrg(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <Settings className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Sistem Yönetimi</h2>
            <p className="text-purple-100">Tüm sistem ayarlarını buradan yönetin</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* KULLANICILAR */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Kullanıcı ara..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <button
                  onClick={() => setShowAddUser(true)}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Kullanıcı Ekle
                </button>
              </div>

              {showAddUser && (
                <form onSubmit={handleCreateUser} className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 mb-3">Yeni kullanıcı</h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Ad Soyad"
                      value={newUserForm.name}
                      onChange={(e) => setNewUserForm((p) => ({ ...p, name: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <input
                      type="email"
                      placeholder="E-posta"
                      value={newUserForm.email}
                      onChange={(e) => setNewUserForm((p) => ({ ...p, email: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Telefon"
                      value={newUserForm.phone}
                      onChange={(e) => setNewUserForm((p) => ({ ...p, phone: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <select
                      value={newUserForm.role}
                      onChange={(e) => setNewUserForm((p) => ({ ...p, role: e.target.value as SystemUser['role'] }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    >
                      <option value="admin">Yönetici</option>
                      <option value="coach">Koç</option>
                      <option value="teacher">Öğretmen</option>
                      <option value="student">Öğrenci</option>
                    </select>
                    {getAuthToken() && tenantRoles.includes(newUserForm.role) ? (
                      <select
                        value={newUserForm.institutionId}
                        onChange={(e) => setNewUserForm((p) => ({ ...p, institutionId: e.target.value }))}
                        className="px-3 py-2 border border-gray-200 rounded-lg md:col-span-2"
                      >
                        <option value="">Kurum seçin (zorunlu)</option>
                        {appInstitutions.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <input
                      type="password"
                      placeholder="Şifre"
                      value={newUserForm.password}
                      onChange={(e) => setNewUserForm((p) => ({ ...p, password: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg md:col-span-2"
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="submit"
                      disabled={savingUser}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60"
                    >
                      {savingUser ? 'Kaydediliyor...' : 'Kullanıcıyı Kaydet'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddUser(false)}
                      className="px-4 py-2 border border-gray-200 rounded-lg"
                    >
                      Vazgeç
                    </button>
                  </div>
                </form>
              )}

              {/* Kullanıcı Listesi */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kullanıcı</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-posta</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-purple-600">
                                {u.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium text-slate-800">{u.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${roleBadgeClasses(u.role)}`}
                          >
                            {roleLabelTr(u.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                        <td className="px-4 py-3">
                          {u.isActive === false ? (
                            <span className="text-red-500 text-sm">Pasif</span>
                          ) : (
                            <span className="text-green-500 text-sm">Aktif</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button className="p-1 text-blue-500 hover:bg-blue-50 rounded">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button className="p-1 text-red-500 hover:bg-red-50 rounded">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* KURUMLAR */}
          {activeTab === 'organizations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Kurumlar ({mergedOrgCount})</h3>
                <button
                  onClick={() => setShowAddOrg(true)}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Kurum Ekle
                </button>
              </div>

              {showAddOrg && (
                <form onSubmit={handleCreateOrganization} className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <h4 className="font-semibold text-slate-800 mb-3">Yeni kurum</h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Kurum adı"
                      value={newOrgForm.name}
                      onChange={(e) => setNewOrgForm((p) => ({ ...p, name: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <input
                      type="email"
                      placeholder="Kurum e-postası"
                      value={newOrgForm.email}
                      onChange={(e) => setNewOrgForm((p) => ({ ...p, email: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Telefon"
                      value={newOrgForm.phone}
                      onChange={(e) => setNewOrgForm((p) => ({ ...p, phone: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    />
                    <select
                      value={newOrgForm.plan}
                      onChange={(e) =>
                        setNewOrgForm((p) => ({ ...p, plan: e.target.value as 'starter' | 'professional' | 'enterprise' }))
                      }
                      className="px-3 py-2 border border-gray-200 rounded-lg"
                    >
                      <option value="starter">Starter</option>
                      <option value="professional">Professional</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Adres (opsiyonel)"
                      value={newOrgForm.address}
                      onChange={(e) => setNewOrgForm((p) => ({ ...p, address: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg md:col-span-2"
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="submit"
                      disabled={savingOrg}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {savingOrg ? 'Kaydediliyor...' : 'Kurumu Kaydet'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddOrg(false)}
                      className="px-4 py-2 border border-gray-200 rounded-lg"
                    >
                      Vazgeç
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {appInstitutions.map(inst => (
                  <div key={inst.id} className="bg-gray-50 rounded-xl p-4 border border-emerald-100">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{inst.name}</p>
                          <p className="text-sm text-gray-500">{inst.email}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          inst.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {inst.isActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-700 font-medium">Veritabanı</p>
                  </div>
                ))}
                {organizations
                  .filter((org) => !dbInstitutionIdSet.has(org.id))
                  .map(org => (
                  <div key={org.id} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {org.logo ? (
                          <img src={org.logo} alt={org.name} className="w-10 h-10 rounded-lg object-contain" />
                        ) : (
                          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-purple-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-slate-800">{org.name}</p>
                          <p className="text-sm text-gray-500">{org.email}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        org.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {org.isActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>{org.stats.totalStudents} öğrenci</span>
                      <span>{org.stats.totalCoaches} koç</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Yalnızca yerel</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ÖDEME SİSTEMLERİ */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-green-800 text-lg">PayTR Ödeme Entegrasyonu</h4>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paytrConfig.enabled}
                          onChange={(e) => setPaytrConfig({ ...paytrConfig, enabled: e.target.checked })}
                          className="w-5 h-5 text-green-500 rounded"
                        />
                        <span className="text-sm text-green-700 font-medium">Aktif</span>
                      </label>
                    </div>
                    <p className="text-sm text-green-700 mb-4">
                      PayTR ile kredi kartı ödemelerini aktive edin. Türkiye'nin en güvenilir ödeme altyapısı.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-green-700 mb-1">Merchant ID</label>
                        <input
                          type="text"
                          value={paytrConfig.merchantId}
                          onChange={(e) => setPaytrConfig({ ...paytrConfig, merchantId: e.target.value })}
                          placeholder="000000000"
                          className="w-full px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-green-700 mb-1">Merchant Key</label>
                        <div className="relative">
                          <input
                            type={showSecrets.merchantKey ? 'text' : 'password'}
                            value={paytrConfig.merchantKey}
                            onChange={(e) => setPaytrConfig({ ...paytrConfig, merchantKey: e.target.value })}
                            placeholder="xxxxxxxx"
                            className="w-full px-3 py-2 pr-10 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecrets({ ...showSecrets, merchantKey: !showSecrets.merchantKey })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                          >
                            {showSecrets.merchantKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-green-700 mb-1">Merchant Salt</label>
                        <div className="relative">
                          <input
                            type={showSecrets.merchantSalt ? 'text' : 'password'}
                            value={paytrConfig.merchantSalt}
                            onChange={(e) => setPaytrConfig({ ...paytrConfig, merchantSalt: e.target.value })}
                            placeholder="xxxxxxxx"
                            className="w-full px-3 py-2 pr-10 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecrets({ ...showSecrets, merchantSalt: !showSecrets.merchantSalt })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                          >
                            {showSecrets.merchantSalt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={savePayTRConfig}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        Kaydet
                      </button>
                      <a
                        href="https://www.paytr.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-white text-green-600 border border-green-300 rounded-lg hover:bg-green-50 transition-colors text-sm font-medium flex items-center gap-2"
                      >
                        <Globe className="w-4 h-4" />
                        PayTR Dashboard
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ödeme Durumu */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h4 className="font-semibold text-slate-800 mb-4">Ödeme Durumu</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">12</p>
                    <p className="text-sm text-gray-500">Aktif Abonelik</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">3</p>
                    <p className="text-sm text-gray-500">Deneme Kullanıcı</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-purple-600">₺8,450</p>
                    <p className="text-sm text-gray-500">Bu Ay Gelir</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-amber-600">1</p>
                    <p className="text-sm text-gray-500">Ödeme Bekliyor</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SİSTEM AYARLARI */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <CronSummarySection />

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Server className="w-5 h-5" />
                  Genel Sistem Ayarları
                </h4>
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5 text-amber-500" />
                      <div>
                        <p className="font-medium text-slate-800">Bakım Modu</p>
                        <p className="text-sm text-gray-500">Sistemi bakıma alır, kullanıcılar giriş yapamaz</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={systemSettings.maintenanceMode}
                      onChange={(e) => setSystemSettings({ ...systemSettings, maintenanceMode: e.target.checked })}
                      className="w-5 h-5 text-red-500 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="font-medium text-slate-800">Kayıt İzinli</p>
                        <p className="text-sm text-gray-500">Yeni kullanıcıların kayıt olmasına izin ver</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={systemSettings.registrationEnabled}
                      onChange={(e) => setSystemSettings({ ...systemSettings, registrationEnabled: e.target.checked })}
                      className="w-5 h-5 text-red-500 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Lock className="w-5 h-5 text-purple-500" />
                      <div>
                        <p className="font-medium text-slate-800">API Erişimi</p>
                        <p className="text-sm text-gray-500">Harici uygulamaların API'ye erişmesine izin ver</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={systemSettings.apiAccess}
                      onChange={(e) => setSystemSettings({ ...systemSettings, apiAccess: e.target.checked })}
                      className="w-5 h-5 text-red-500 rounded"
                    />
                  </label>
                </div>
                <button
                  onClick={saveSystemSettings}
                  className="mt-4 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Ayarları Kaydet
                </button>
              </div>

              {/* Sistem Bilgileri */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Sistem Bilgileri
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500">Toplam Kullanıcı</p>
                    <p className="text-xl font-bold text-slate-800">{allUsers.length}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500">Toplam Kurum</p>
                    <p className="text-xl font-bold text-slate-800">{mergedOrgCount}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500">Toplam Öğrenci</p>
                    <p className="text-xl font-bold text-slate-800">{students.length}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500">Toplam Koç</p>
                    <p className="text-xl font-bold text-slate-800">{coaches.length}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
