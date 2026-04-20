// Türkçe: Eğitim Koçu Yönetimi Sayfası
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Coach } from '../types';
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
  UserCircle
} from 'lucide-react';

export default function Coaches() {
  const { coaches, students, addCoach, updateCoach, deleteCoach } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);

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
        institutionId: formData.institutionId || undefined,
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
                <button
                  onClick={() => handleEdit(coach)}
                  className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
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

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-slate-800">
                {editingCoach ? 'Koç Düzenle' : 'Yeni Koç Ekle'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingCoach(null);
                  resetForm();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingCoach(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={formData.subjects.length === 0}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  {editingCoach ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </form>

            {/* Oluşturulan Şifre Gösterimi */}
            {createdCredentials && (
              <div className="p-6 bg-green-50 border-t border-green-200">
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="text-lg font-bold text-green-800 mb-3">Koç Kaydedildi!</h4>
                  <p className="text-sm text-green-700 mb-4">
                    Koça aşağıdaki bilgilerle giriş yapabilir:
                  </p>
                  <div className="bg-white rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">E-posta:</span>
                      <span className="font-mono font-bold text-slate-800">{createdCredentials.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Şifre:</span>
                      <span className="font-mono font-bold text-red-600">{createdCredentials.password}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    Bu bilgileri koça iletmeyi unutmayın!
                  </p>
                  <button
                    onClick={() => {
                      setCreatedCredentials(null);
                      resetForm();
                    }}
                    className="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    Tamam
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
