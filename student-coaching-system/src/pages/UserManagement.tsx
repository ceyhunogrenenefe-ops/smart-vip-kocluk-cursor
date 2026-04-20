// Türkçe: Kullanıcı Yönetimi Sayfası - Super Admin Paneli
import React, { useState, useEffect } from 'react';
import { useAuth, SystemUser } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  AlertCircle,
  Shield,
  Calendar,
  Clock,
  UserCog,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  RefreshCw,
  UserCheck,
  GraduationCap,
  Briefcase
} from 'lucide-react';
import { UserRole, ClassLevel } from '../types';

// Paket bilgileri
const PACKAGES = {
  trial: { name: 'Deneme', color: 'bg-purple-100 text-purple-700', days: 7 },
  starter: { name: 'Başlangıç', color: 'bg-blue-100 text-blue-700', days: 30 },
  professional: { name: 'Profesyonel', color: 'bg-green-100 text-green-700', days: 365 },
  enterprise: { name: 'Kurumsal', color: 'bg-amber-100 text-amber-700', days: 365 }
};

// Rol bilgileri
const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: 'super_admin', label: 'Süper Admin', color: 'bg-amber-100 text-amber-800' },
  { value: 'admin', label: 'Yönetici', color: 'bg-red-100 text-red-700' },
  { value: 'coach', label: 'Koç', color: 'bg-blue-100 text-blue-700' },
  { value: 'student', label: 'Öğrenci', color: 'bg-green-100 text-green-700' }
];

export default function UserManagement() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { addStudent, addCoach, students, coaches } = useApp();

  useEffect(() => {
    if (!currentUser || (currentUser.role !== 'super_admin' && currentUser.role !== 'admin')) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  const { getAllUsers, createUser, updateUser, deleteUser, getUserById } = useAuth();

  // State
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'student' as UserRole,
    package: 'trial' as 'trial' | 'starter' | 'professional' | 'enterprise',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    isActive: true
  });

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setUsers(getAllUsers());
  }, []);

  // Filtrelenmiş kullanıcılar
  const filteredUsers = users.filter(user => {
    // Arama
    if (searchTerm && !user.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !user.email.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Rol filtresi
    if (filterRole !== 'all' && user.role !== filterRole) {
      return false;
    }

    // Durum filtresi
    if (filterStatus !== 'all') {
      if (filterStatus === 'active') {
        const daysLeft = getDaysLeft(user.endDate);
        if (daysLeft === null || daysLeft <= 0 || user.isActive === false) return false;
      } else if (filterStatus === 'expired') {
        const daysLeft = getDaysLeft(user.endDate);
        if (daysLeft !== null && daysLeft <= 0) return false;
        if (user.isActive === false) return false;
      } else if (filterStatus === 'inactive') {
        if (user.isActive !== false) return false;
      }
    }

    return true;
  });

  // Gün sayısını hesapla
  const getDaysLeft = (endDate?: string) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // Abonelik durumunu al
  const getSubscriptionStatus = (user: SystemUser) => {
    if (user.isActive === false) {
      return { status: 'Pasif', color: 'text-gray-500', bg: 'bg-gray-100' };
    }

    const daysLeft = getDaysLeft(user.endDate);
    if (daysLeft === null) {
      return { status: 'Süresiz', color: 'text-blue-500', bg: 'bg-blue-100' };
    }
    if (daysLeft <= 0) {
      return { status: 'Süresi Dolmuş', color: 'text-red-500', bg: 'bg-red-100' };
    }
    if (daysLeft <= 7) {
      return { status: `${daysLeft} gün kaldı`, color: 'text-amber-500', bg: 'bg-amber-100' };
    }
    return { status: `${daysLeft} gün kaldı`, color: 'text-green-500', bg: 'bg-green-100' };
  };

  // Modal aç
  const openModal = (mode: 'add' | 'edit', user?: SystemUser) => {
    setModalMode(mode);
    setSelectedUser(user || null);
    setMessage(null);

    if (mode === 'edit' && user) {
      const fullUser = getUserById(user.id);
      setFormData({
        name: fullUser?.name || user.name,
        email: fullUser?.email || user.email,
        phone: fullUser?.phone || user.phone || '',
        password: '',
        role: user.role,
        package: user.package || 'trial',
        startDate: user.startDate?.split('T')[0] || new Date().toISOString().split('T')[0],
        endDate: user.endDate?.split('T')[0] || '',
        isActive: user.isActive !== false
      });
    } else {
      // Yeni kullanıcı için
      const days = PACKAGES[formData.package].days;
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);

      setFormData({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'student',
        package: 'trial',
        startDate: new Date().toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        isActive: true
      });
    }

    setShowModal(true);
  };

  // Paket değiştiğinde bitiş tarihini güncelle
  const handlePackageChange = (pkg: typeof formData.package) => {
    const days = PACKAGES[pkg].days;
    const startDate = new Date(formData.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    setFormData(prev => ({
      ...prev,
      package: pkg,
      endDate: endDate.toISOString().split('T')[0]
    }));
  };

  // Form gönder
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const userData = {
        ...formData,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
        startDate: new Date(formData.startDate).toISOString()
      };

      if (modalMode === 'edit' && selectedUser) {
        // Şifre boşsa güncelleme
        if (!userData.password) {
          delete (userData as any).password;
        }
        const result = await updateUser(selectedUser.id, userData);
        setMessage({ type: result.success ? 'success' : 'error', text: result.message });

        if (result.success) {
          setUsers(getAllUsers());
          setShowModal(false);
        }
      } else {
        // Yeni kullanıcı oluştur
        const result = await createUser(userData);

        if (result.success) {
          setMessage({ type: 'success', text: `${formData.role === 'student' ? 'Öğrenci' : formData.role === 'coach' ? 'Koç' : 'Admin'} başarıyla oluşturuldu!` });
          setUsers(getAllUsers());

          // AppContext'e de ekle (senkronizasyon için) - AuthContext'ten gelen userId'yi kullan
          const newUserId = result.userId || `user-${Date.now()}`;
          if (formData.role === 'student') {
            addStudent({
              id: newUserId,
              name: formData.name,
              email: formData.email,
              password: formData.password || undefined,
              phone: formData.phone || '',
              parentPhone: formData.phone || '',
              classLevel: 9 as ClassLevel,
              coachId: undefined,
              createdAt: new Date().toISOString()
            });
          } else if (formData.role === 'coach') {
            addCoach({
              id: newUserId,
              name: formData.name,
              email: formData.email,
              phone: formData.phone || '',
              subjects: [],
              studentIds: [],
              createdAt: new Date().toISOString()
            });
          }

          // 1.5 saniye sonra ilgili panele yönlendir
          setTimeout(() => {
            setShowModal(false);
            if (formData.role === 'student') {
              navigate('/students');
            } else if (formData.role === 'coach') {
              navigate('/coaches');
            }
          }, 1500);
        } else {
          setMessage({ type: 'error', text: result.message });
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Bir hata oluştu' });
    }

    setLoading(false);
  };

  // Kullanıcı sil
  const handleDelete = async (userId: string) => {
    if (!confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?')) return;

    const result = await deleteUser(userId);
    setMessage({ type: result.success ? 'success' : 'error', text: result.message });
    setUsers(getAllUsers());
  };

  // İstatistikler
  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    coaches: users.filter(u => u.role === 'coach').length,
    students: users.filter(u => u.role === 'student').length,
    active: users.filter(u => {
      const daysLeft = getDaysLeft(u.endDate);
      return u.isActive !== false && daysLeft !== null && daysLeft > 0;
    }).length,
    expired: users.filter(u => {
      const daysLeft = getDaysLeft(u.endDate);
      return daysLeft !== null && daysLeft <= 0;
    }).length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-red-500" />
            Kullanıcı Yönetimi
          </h1>
          <p className="text-gray-500 mt-1">Sistem kullanıcılarını ve aboneliklerini yönetin</p>
        </div>
        <button
          onClick={() => openModal('add')}
          className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center gap-2"
        >
          <UserPlus className="w-5 h-5" />
          Yeni Kullanıcı
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
          <div className="text-sm text-gray-500">Toplam Kullanıcı</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-red-600">{stats.admins}</div>
          <div className="text-sm text-gray-500">Yönetici</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-blue-600">{stats.coaches}</div>
          <div className="text-sm text-gray-500">Koç</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-green-600">{stats.students}</div>
          <div className="text-sm text-gray-500">Öğrenci</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          <div className="text-sm text-gray-500">Aktif</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
          <div className="text-sm text-gray-500">Süresi Dolmuş</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Ad veya e-posta ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Role Filter */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as UserRole | 'all')}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Tüm Roller</option>
            {ROLES.map(role => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="expired">Süresi Dolmuş</option>
            <option value="inactive">Pasif</option>
          </select>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Kullanıcı</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Rol</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Paket</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Başlangıç</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Bitiş</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Durum</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map(user => {
                const subStatus = getSubscriptionStatus(user);
                const daysLeft = getDaysLeft(user.endDate);

                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-gray-800">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${ROLES.find(r => r.value === user.role)?.color || 'bg-gray-100 text-gray-700'}`}>
                        {ROLES.find(r => r.value === user.role)?.label || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${PACKAGES[(user.package || 'trial') as keyof typeof PACKAGES].color}`}>
                        {PACKAGES[(user.package || 'trial') as keyof typeof PACKAGES].name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.startDate ? new Date(user.startDate).toLocaleDateString('tr-TR') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.endDate ? new Date(user.endDate).toLocaleDateString('tr-TR') : 'Süresiz'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${subStatus.bg} ${subStatus.color}`}>
                        {subStatus.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openModal('edit', user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {!user.id.startsWith('demo-seed-') && (
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Kullanıcı bulunamadı</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">
                {modalMode === 'add' ? 'Yeni Kullanıcı Ekle' : 'Kullanıcı Düzenle'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <UserCog className="w-4 h-4 inline mr-1" />
                  Ad Soyad *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Adınız Soyadınız"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="w-4 h-4 inline mr-1" />
                  E-posta *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="ornek@email.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Telefon
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="0500 000 00 00"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Lock className="w-4 h-4 inline mr-1" />
                  Şifre {modalMode === 'edit' && '(boş bırakılırsa değişmez)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder={modalMode === 'add' ? 'En az 6 karakter' : 'Değiştirmek için girin'}
                    required={modalMode === 'add'}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Shield className="w-4 h-4 inline mr-1" />
                  Rol *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {(modalMode === 'add' ? ROLES.filter(r => r.value !== 'super_admin') : ROLES).map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>

              {/* Package */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paket Seçimi *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PACKAGES).map(([key, pkg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePackageChange(key as typeof formData.package)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        formData.package === key
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm">{pkg.name}</div>
                      <div className="text-xs text-gray-500">{pkg.days} gün</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Başlangıç
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => {
                      setFormData({ ...formData, startDate: e.target.value });
                      // Bitiş tarihini de güncelle
                      const start = new Date(e.target.value);
                      const end = new Date(start);
                      end.setDate(end.getDate() + PACKAGES[formData.package].days);
                      setFormData(prev => ({
                        ...prev,
                        startDate: e.target.value,
                        endDate: end.toISOString().split('T')[0]
                      }));
                    }}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Bitiş
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    formData.isActive ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    formData.isActive ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
                <span className="text-sm text-gray-700">
                  {formData.isActive ? 'Aktif' : 'Pasif'}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {modalMode === 'add' ? 'Ekle' : 'Kaydet'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
