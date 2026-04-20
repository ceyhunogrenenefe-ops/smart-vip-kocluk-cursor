// Türkçe: Öğrenci Yönetimi Sayfası
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Student, ClassLevel, CLASS_LEVELS, parseClassLevelFromForm, formatClassLevelLabel } from '../types';
import {
  GraduationCap,
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Users,
  UserX,
  ChevronDown,
  Phone,
  Mail,
  Link2,
  Eye
} from 'lucide-react';

export default function Students() {
  const { students, coaches, addStudent, updateStudent, deleteStudent, getStudentStats } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState<ClassLevel | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Filtrelenmiş öğrenciler
  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.phone.includes(searchTerm);
    const matchesClass = filterClass === 'all' || student.classLevel === filterClass;
    return matchesSearch && matchesClass;
  });

  // Yeni öğrenci formu
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    parentPhone: '',
    classLevel: 9 as ClassLevel,
    coachId: '',
    groupName: '',
    institutionId: ''
  });

  // Yeni kayıt sonrası gösterilecek şifre
  const [createdCredentials, setCreatedCredentials] = useState<{email: string, password: string} | null>(null);

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      parentPhone: '',
      classLevel: 9 as ClassLevel,
      coachId: '',
      groupName: '',
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
    if (editingStudent) {
      updateStudent(editingStudent.id, formData);
      setEditingStudent(null);
    } else {
      // Yeni öğrenci için otomatik şifre oluştur
      const autoPassword = formData.password || generatePassword();
      const newStudent: Student = {
        id: Date.now().toString(),
        name: formData.name,
        email: formData.email,
        password: autoPassword,
        phone: formData.phone,
        parentPhone: formData.parentPhone,
        classLevel: formData.classLevel,
        coachId: formData.coachId || undefined,
        groupName: formData.groupName || undefined,
        institutionId: formData.institutionId || undefined,
        createdAt: new Date().toISOString()
      };
      addStudent(newStudent);
      // Oluşturulan şifreyi göster
      setCreatedCredentials({ email: formData.email, password: autoPassword });
    }
    setShowAddModal(false);
  };

  const handleEdit = (student: Student) => {
    setFormData({
      name: student.name,
      email: student.email,
      password: student.password || '',
      phone: student.phone,
      parentPhone: student.parentPhone,
      classLevel: student.classLevel,
      coachId: student.coachId || '',
      groupName: student.groupName || '',
      institutionId: student.institutionId || ''
    });
    setEditingStudent(student);
    setShowAddModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Bu öğrenciyi silmek istediğinizden emin misiniz?')) {
      deleteStudent(id);
    }
  };

  const getTeacherName = (coachId?: string) => {
    if (!coachId) return 'Atanmadı';
    const teacher = coaches.find(t => t.id === coachId);
    return teacher ? teacher.name : 'Bilinmiyor';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Öğrenci Yönetimi</h2>
          <p className="text-gray-500">Toplam {students.length} öğrenci kayıtlı</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingStudent(null);
            setShowAddModal(true);
          }}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Yeni Öğrenci Ekle
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Arama */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Öğrenci ara (isim, email, telefon)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {/* Sınıf Filtresi */}
          <div className="relative">
            <select
              value={filterClass === 'all' ? 'all' : String(filterClass)}
              onChange={(e) =>
                setFilterClass(e.target.value === 'all' ? 'all' : parseClassLevelFromForm(e.target.value))
              }
              className="appearance-none px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
            >
              <option value="all">Tüm Sınıflar</option>
              {CLASS_LEVELS.map((level) => (
                <option key={String(level.value)} value={String(level.value)}>
                  {level.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Öğrenci Listesi */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStudents.map((student) => {
          const stats = getStudentStats(student.id);
          return (
            <div
              key={student.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{student.name}</h3>
                    <p className="text-sm text-gray-500">{formatClassLevelLabel(student.classLevel)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedStudent(student)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEdit(student)}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(student.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  {student.phone}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users className="w-4 h-4" />
                  {getTeacherName(student.coachId)}
                </div>
                {student.groupName && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Link2 className="w-4 h-4" />
                    {student.groupName}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">{stats.totalSolved}</p>
                  <p className="text-xs text-gray-500">Çözülen</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold ${
                    stats.successRate >= 70 ? 'text-green-600' :
                    stats.successRate >= 50 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    %{stats.successRate}
                  </p>
                  <p className="text-xs text-gray-500">Başarı</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800">%{stats.realizationRate}</p>
                  <p className="text-xs text-gray-500">Hedef</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredStudents.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Öğrenci Bulunamadı</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm || filterClass !== 'all'
              ? 'Arama kriterlerinize uygun öğrenci bulunamadı.'
              : 'Henüz öğrenci eklenmemiş.'}
          </p>
          {!searchTerm && filterClass === 'all' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              İlk Öğrenciyi Ekle
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
                {editingStudent ? 'Öğrenci Düzenle' : 'Yeni Öğrenci Ekle'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingStudent(null);
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
                    placeholder="Öğrenci adı"
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
                    placeholder="ogrenci@email.com"
                  />
                </div>

                {/* Şifre (sadece yeni eklemede) */}
                {!editingStudent && (
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

                {/* Telefon */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="0532 123 45 67"
                  />
                </div>

                {/* Veli Telefonu */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Veli Telefonu</label>
                  <input
                    type="tel"
                    value={formData.parentPhone}
                    onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="0533 987 65 43"
                  />
                </div>

                {/* Sınıf */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sınıf *</label>
                  <select
                    required
                    value={String(formData.classLevel)}
                    onChange={(e) =>
                      setFormData({ ...formData, classLevel: parseClassLevelFromForm(e.target.value) })
                    }
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {CLASS_LEVELS.map((level) => (
                      <option key={String(level.value)} value={String(level.value)}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Öğretmen */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen/Koç</label>
                  <select
                    value={formData.coachId}
                    onChange={(e) => setFormData({ ...formData, coachId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Öğretmen Seçin</option>
                    {coaches.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Grup */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grup Adı</label>
                  <input
                    type="text"
                    value={formData.groupName}
                    onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Sayısal A"
                  />
                </div>

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

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingStudent(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editingStudent ? 'Güncelle' : 'Kaydet'}
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
                  <h4 className="text-lg font-bold text-green-800 mb-3">Öğrenci Kaydedildi!</h4>
                  <p className="text-sm text-green-700 mb-4">
                    Öğrenciye aşağıdaki bilgilerle giriş yapabilir:
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
                    Bu bilgileri öğrenciye/veliye iletmeyi unutmayın!
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

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                    {selectedStudent.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">{selectedStudent.name}</h3>
                    <p className="text-gray-500">{formatClassLevelLabel(selectedStudent.classLevel)}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-gray-600">
                <Phone className="w-5 h-5" />
                <span>{selectedStudent.phone}</span>
              </div>
              {selectedStudent.parentPhone && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Phone className="w-5 h-5" />
                  <span>Veli: {selectedStudent.parentPhone}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-gray-600">
                <Mail className="w-5 h-5" />
                <span>{selectedStudent.email || 'Belirtilmemiş'}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-600">
                <Users className="w-5 h-5" />
                <span>Koç: {getTeacherName(selectedStudent.coachId)}</span>
              </div>
              {selectedStudent.groupName && (
                <div className="flex items-center gap-3 text-gray-600">
                  <Link2 className="w-5 h-5" />
                  <span>{selectedStudent.groupName}</span>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => {
                  setSelectedStudent(null);
                  handleEdit(selectedStudent);
                }}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Düzenle
              </button>
              <button
                onClick={() => {
                  const waUrl = `https://wa.me/${selectedStudent.parentPhone.replace(/\D/g, '')}`;
                  window.open(waUrl, '_blank');
                }}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
