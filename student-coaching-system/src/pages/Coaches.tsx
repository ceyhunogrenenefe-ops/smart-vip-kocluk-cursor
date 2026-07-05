// Türkçe: Eğitim Koçu Yönetimi Sayfası
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth, type SystemUser } from '../context/AuthContext';
import { Coach } from '../types';
import { db } from '../lib/database';
import { isSupabaseReady } from '../lib/supabase';
import { apiFetch, getAuthToken } from '../lib/session';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Phone,
  Mail,
  BookOpen,
  ChevronDown,
  GraduationCap,
  UserCircle,
  LogIn,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { CopyableLoginCredentialsPanel } from '../components/auth/CopyableLoginCredentials';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
  AppModalForm,
  AppModalHeader
} from '../components/ui/AppModal';

type ApiUserRow = {
  id: string;
  name?: string;
  email?: string;
  phone?: string | null;
  role?: string;
  roles?: string[];
  institution_id?: string | null;
};

export default function Coaches() {
  const navigate = useNavigate();
  const { effectiveUser, impersonate, canImpersonate } = useAuth();
  const canSetCoachQuota =
    effectiveUser?.role === 'super_admin' || effectiveUser?.role === 'admin';
  const canManageLogin = canSetCoachQuota;

  const { coaches, students, addCoach, updateCoach, deleteCoach, institution, activeInstitutionId } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [coachQuotaById, setCoachQuotaById] = useState<
    Record<string, { max: number | null; assigned: number }>
  >({});
  const [quotaInputs, setQuotaInputs] = useState<Record<string, string>>({});
  const [apiUsers, setApiUsers] = useState<ApiUserRow[]>([]);
  const [loginBusyId, setLoginBusyId] = useState<string | null>(null);
  const [openQuotaCoachId, setOpenQuotaCoachId] = useState<string | null>(null);

  const userByEmail = useMemo(() => {
    const m = new Map<string, ApiUserRow>();
    for (const u of apiUsers) {
      const em = String(u.email || '').toLowerCase().trim();
      if (em) m.set(em, u);
    }
    return m;
  }, [apiUsers]);

  // Filtrelenmiş koçlar
  const filteredCoaches = coaches.filter(coach =>
    coach.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    coach.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    coach.subjects.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Form verisi
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    subjects: [] as string[],
    institutionId: ''
  });

  // Yeni kayıt sonrası gösterilecek şifre
  const [createdCredentials, setCreatedCredentials] = useState<{email: string, password: string} | null>(null);

  const availableSubjects = [
    'Matematik',
    'Fizik',
    'Kimya',
    'Biyoloji',
    'Türkçe',
    'Edebiyat',
    'Sosyal',
    'İngilizce'
  ];

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      subjects: [],
      institutionId: ''
    });
    setCreatedCredentials(null);
  };

  // Otomatik şifre oluştur
  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCoach) {
      updateCoach(editingCoach.id, formData);
      setEditingCoach(null);
    } else {
      // Yeni koç için otomatik şifre oluştur
      const autoPassword = formData.password || generatePassword();
      const newCoach: Coach = {
        id: Date.now().toString(),
        name: formData.name,
        email: formData.email,
        password: autoPassword,
        phone: formData.phone,
        subjects: formData.subjects,
        institutionId: formData.institutionId || activeInstitutionId || institution?.id || undefined,
        studentIds: [],
        createdAt: new Date().toISOString()
      };
      addCoach(newCoach);
      // Oluşturulan şifreyi göster
      setCreatedCredentials({ email: formData.email, password: autoPassword });
    }
    setShowAddModal(false);
  };

  const handleEdit = (coach: Coach) => {
    setFormData({
      name: coach.name,
      email: coach.email,
      password: coach.password || '',
      phone: coach.phone,
      subjects: coach.subjects,
      institutionId: coach.institutionId || ''
    });
    setEditingCoach(coach);
    setShowAddModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Bu eğitim koçunu silmek istediğinizden emin misiniz?')) {
      deleteCoach(id);
    }
  };

  const toggleSubject = (subject: string) => {
    if (formData.subjects.includes(subject)) {
      setFormData({
        ...formData,
        subjects: formData.subjects.filter(s => s !== subject)
      });
    } else {
      setFormData({
        ...formData,
        subjects: [...formData.subjects, subject]
      });
    }
  };

  const getStudentCount = (coachId: string) => {
    return students.filter(s => s.coachId === coachId).length;
  };

  useEffect(() => {
    if (!canManageLogin || !getAuthToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch('/api/users');
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return;
        if (!cancelled) setApiUsers(Array.isArray(j.data) ? j.data : []);
      } catch {
        /* liste yüklenemezse giriş düğmesi oluşturma moduna düşer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageLogin, coaches.length]);

  const coachToSystemUser = (coach: Coach, row?: ApiUserRow): SystemUser => {
    const roles = Array.isArray(row?.roles)
      ? (row.roles.filter(Boolean) as SystemUser['roles'])
      : undefined;
    return {
      id: row?.id || coach.id,
      name: row?.name || coach.name,
      email: row?.email || coach.email,
      phone: row?.phone || coach.phone,
      role: 'coach',
      roles: roles?.length ? roles : undefined,
      coachId: coach.id,
      institutionId: coach.institutionId,
      package: 'trial',
      isActive: true,
      startDate: coach.createdAt || new Date().toISOString(),
      endDate: new Date(Date.now() + 365 * 86400000).toISOString(),
      createdAt: coach.createdAt
    };
  };

  const findCoachLoginUser = (coach: Coach) => {
    const em = coach.email.toLowerCase().trim();
    return userByEmail.get(em);
  };

  const handleCoachLogin = async (coach: Coach) => {
    const row = findCoachLoginUser(coach);
    if (!row) {
      navigate(`/user-management?koc_giris=${encodeURIComponent(coach.id)}`);
      return;
    }
    const target = coachToSystemUser(coach, row);
    if (target.email.toLowerCase().trim() === effectiveUser?.email?.toLowerCase().trim()) {
      alert('Zaten bu hesapla oturum açmış durumdasınız.');
      return;
    }
    if (!canImpersonate(target)) {
      alert('Bu koç hesabına geçiş yetkiniz yok.');
      return;
    }
    setLoginBusyId(coach.id);
    try {
      const r = await impersonate(target);
      if (!r.success) {
        alert(r.message);
        return;
      }
      navigate('/coach-dashboard');
    } finally {
      setLoginBusyId(null);
    }
  };

  useEffect(() => {
    if (!canSetCoachQuota || !getAuthToken() || !isSupabaseReady || coaches.length === 0) return;
    let cancelled = false;
    void (async () => {
      const nextQuota: Record<string, { max: number | null; assigned: number }> = {};
      const nextInputs: Record<string, string> = {};
      for (const c of coaches) {
        try {
          const d = await db.getCoachQuota(c.id);
          nextQuota[c.id] = { max: d.max_students, assigned: d.assigned_students };
          nextInputs[c.id] =
            d.max_students != null && d.max_students >= 0 ? String(d.max_students) : '';
        } catch {
          const assigned = getStudentCount(c.id);
          nextQuota[c.id] = { max: null, assigned };
          nextInputs[c.id] = '';
        }
      }
      if (!cancelled) {
        setCoachQuotaById(nextQuota);
        setQuotaInputs(prev => ({ ...nextInputs, ...prev }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canSetCoachQuota, coaches, students]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Eğitim Koçu Yönetimi</h2>
          <p className="text-gray-500">Toplam {coaches.length} eğitim koçu kayıtlı</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingCoach(null);
            setShowAddModal(true);
          }}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Yeni Koç Ekle
        </button>
      </div>

      {/* Arama */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Koç ara (isim, branş, email)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Koç Listesi */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCoaches.map((coach) => (
          <div
            key={coach.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {coach.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{coach.name}</h3>
                  <p className="text-sm text-gray-500">
                    {getStudentCount(coach.id)} öğrenci
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canManageLogin ? (
                  <button
                    type="button"
                    title={
                      findCoachLoginUser(coach)
                        ? 'Koç hesabına gir'
                        : 'Giriş hesabı oluştur'
                    }
                    disabled={loginBusyId === coach.id}
                    onClick={() => void handleCoachLogin(coach)}
                    className="p-1.5 text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loginBusyId === coach.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogIn className="w-4 h-4" />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  title="Düzenle"
                  onClick={() => handleEdit(coach)}
                  className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Sil"
                  onClick={() => handleDelete(coach.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Branşlar */}
            <div className="flex flex-wrap gap-2 mb-4">
              {coach.subjects.map((subject) => (
                <span
                  key={subject}
                  className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-lg"
                >
                  {subject}
                </span>
              ))}
            </div>

            {/* İletişim */}
            <div className="space-y-2 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                {coach.phone}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4" />
                {coach.email || 'Belirtilmemiş'}
              </div>
            </div>

            {canSetCoachQuota && (
              <div className="mt-3 border-t border-dashed border-gray-200 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setOpenQuotaCoachId((id) => (id === coach.id ? null : coach.id))
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                      openQuotaCoachId === coach.id ? 'rotate-180' : ''
                    }`}
                  />
                  <span>Öğrenci kotası</span>
                  <span className="ml-auto font-normal text-gray-500">
                    {coachQuotaById[coach.id]?.assigned ?? getStudentCount(coach.id)}
                    {coachQuotaById[coach.id]?.max != null
                      ? ` / ${coachQuotaById[coach.id]!.max}`
                      : ''}
                  </span>
                </button>
                {openQuotaCoachId === coach.id ? (
                  <div className="space-y-2 px-1 pb-1">
                    <p className="text-xs text-gray-600">
                      Bu koça atanabilir öğrenci üst sınırı
                    </p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        min={0}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                        placeholder="Max öğrenci sayısı"
                        value={quotaInputs[coach.id] ?? ''}
                        onChange={(e) =>
                          setQuotaInputs((p) => ({
                            ...p,
                            [coach.id]: e.target.value
                          }))
                        }
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const raw = quotaInputs[coach.id];
                          const n = Math.floor(Number(raw === '' || raw == null ? '0' : raw));
                          try {
                            await db.patchCoachStudentQuota(
                              coach.id,
                              Number.isFinite(n) && n >= 0 ? n : 0
                            );
                            const d = await db.getCoachQuota(coach.id);
                            setCoachQuotaById((p) => ({
                              ...p,
                              [coach.id]: { max: d.max_students, assigned: d.assigned_students }
                            }));
                          } catch (e) {
                            alert(e instanceof Error ? e.message : 'Kota kaydedilemedi');
                          }
                        }}
                        className="shrink-0 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-900"
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredCoaches.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <UserCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Koç Bulunamadı</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm
              ? 'Arama kriterlerinize uygun koç bulunamadı.'
              : 'Henüz koç eklenmemiş.'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              İlk Koçu Ekle
            </button>
          )}
        </div>
      )}

      <AppModal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingCoach(null);
          resetForm();
        }}
        panelClassName="max-w-2xl"
      >
        <AppModalHeader>
          <h3 className="text-xl font-bold text-slate-800">
            {editingCoach ? 'Koç Düzenle' : 'Yeni Koç Ekle'}
          </h3>
          <button
            type="button"
            onClick={() => {
              setShowAddModal(false);
              setEditingCoach(null);
              resetForm();
            }}
            className="icon-tap-btn hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </AppModalHeader>

        <AppModalForm onSubmit={handleSubmit}>
          <AppModalBody className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* İsim */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Koç adı"
                  />
                </div>

                {/* Telefon */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="0555 123 45 67"
                  />
                </div>

                {/* E-posta */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-posta *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="koc@email.com"
                  />
                </div>

                {/* Şifre (sadece yeni eklemede) */}
                {!editingCoach && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Şifre (Opsiyonel)</label>
                    <input
                      type="text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Boş bırakılırsa otomatik oluşturulur"
                    />
                    <p className="text-xs text-gray-500 mt-1">Boş bırakırsanız 8 haneli otomatik şifre oluşturulur</p>
                  </div>
                )}

                {/* Kurum */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kurum</label>
                  <input
                    type="text"
                    value={formData.institutionId}
                    onChange={(e) => setFormData({ ...formData, institutionId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Kurum ID"
                  />
                </div>
              </div>

              {/* Branşlar */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Uzmanlık Alanları *</label>
                <div className="flex flex-wrap gap-2">
                  {availableSubjects.map((subject) => (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => toggleSubject(subject)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.subjects.includes(subject)
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
                {formData.subjects.length === 0 && (
                  <p className="text-sm text-red-500 mt-2">En az bir branş seçilmelidir.</p>
                )}
              </div>
          </AppModalBody>

          <AppModalFooter>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingCoach(null);
                    resetForm();
                  }}
                  className="min-h-[44px] px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={formData.subjects.length === 0}
                  className="min-h-[44px] px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  {editingCoach ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
          </AppModalFooter>
        </AppModalForm>

        {createdCredentials ? (
          <div className="shrink-0 border-t border-green-200 bg-green-50 pb-safe">
            <CopyableLoginCredentialsPanel
              data={{
                title: 'Koç kaydedildi',
                subtitle: 'Koça aşağıdaki bilgilerle giriş yapabilir.',
                email: createdCredentials.email,
                password: createdCredentials.password,
                roleLabel: 'Koç'
              }}
              onDismiss={() => {
                setCreatedCredentials(null);
                resetForm();
              }}
            />
          </div>
        ) : null}
      </AppModal>
    </div>
  );
}
