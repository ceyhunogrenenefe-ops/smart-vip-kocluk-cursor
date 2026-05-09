// Türkçe: Öğrenci Yönetimi Sayfası
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  Student,
  ClassLevel,
  CLASS_LEVELS,
  PROGRAM_OPTIONS,
  ProgramName,
  parseClassLevelFromForm,
  formatClassLevelLabel,
  inferProgramName,
  StudentTeacherLessonQuota
} from '../types';
import { resolveCoachRecordId } from '../lib/coachResolve';
import { db } from '../lib/database';
import {
  GraduationCap,
  Search,
  Edit2,
  Trash2,
  X,
  Check,
  Users,
  ChevronDown,
  Phone,
  Mail,
  Link2,
  Eye,
  Plus,
  Loader2
} from 'lucide-react';

export default function Students() {
  const { effectiveUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    students,
    coaches,
    addStudent,
    updateStudent,
    deleteStudent,
    getStudentStats,
    institution,
    activeInstitutionId
  } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState<ClassLevel | 'all'>('all');
  const [filterProgram, setFilterProgram] = useState<ProgramName | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);

  const [lessonQuotas, setLessonQuotas] = useState<StudentTeacherLessonQuota[]>([]);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [platformStaff, setPlatformStaff] = useState<{ id: string; name: string; role: string }[]>([]);
  const [quotaTeacherId, setQuotaTeacherId] = useState('');
  const [quotaCreditsInput, setQuotaCreditsInput] = useState('');
  const [quotaSaving, setQuotaSaving] = useState(false);

  // Filtrelenmiş öğrenciler
  const filteredStudents = students.filter(student => {
    const name = (student.name || '').toLowerCase();
    const email = (student.email || '').toLowerCase();
    const phone = student.phone || '';
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      name.includes(q) || email.includes(q) || phone.includes(searchTerm);
    const matchesClass = filterClass === 'all' || student.classLevel === filterClass;
    const studentProgram = student.programName || inferProgramName(student.classLevel);
    const matchesProgram = filterProgram === 'all' || studentProgram === filterProgram;
    return matchesSearch && matchesClass && matchesProgram;
  });

  // Yeni öğrenci formu
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    parentPhone: '',
    classLevel: 9 as ClassLevel,
    programName: 'tyt' as ProgramName,
    coachId: '',
    groupName: '',
    institutionId: ''
  });

  // Yeni kayıt sonrası gösterilecek şifre
  const canEditStudents =
    !!effectiveUser &&
    (effectiveUser.role === 'super_admin' || effectiveUser.role === 'admin' || effectiveUser.role === 'coach');

  useEffect(() => {
    if (!selectedStudent) {
      setLessonQuotas([]);
      setPlatformStaff([]);
      setQuotaTeacherId('');
      setQuotaCreditsInput('');
      return;
    }
    let cancelled = false;
    (async () => {
      setQuotaLoading(true);
      try {
        const [users, qrows] = await Promise.all([
          db.getUsers(),
          db.getStudentTeacherLessonQuotas(selectedStudent.id)
        ]);
        if (cancelled) return;
        const inst = selectedStudent.institutionId;
        const staff = users.filter((u) => {
          if (!['teacher', 'coach', 'admin'].includes(String(u.role))) return false;
          if (effectiveUser?.role === 'super_admin') return true;
          if (!inst) return true;
          return u.institution_id === inst || u.institution_id == null;
        });
        setPlatformStaff(
          staff
            .map((u) => ({ id: u.id, name: u.name || u.email || u.id, role: String(u.role) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
        );
        setLessonQuotas(qrows);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setLessonQuotas([]);
          setPlatformStaff([]);
        }
      } finally {
        if (!cancelled) setQuotaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent?.id, selectedStudent?.institutionId, effectiveUser?.role]);

  useEffect(() => {
    if (!searchParams.has('add') || searchParams.get('add') !== '1' || !canEditStudents) return;
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      parentPhone: '',
      classLevel: 9 as ClassLevel,
      programName: 'tyt' as ProgramName,
      coachId: '',
      groupName: '',
      institutionId: ''
    });
    setEditingStudent(null);
    setShowAddModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete('add');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, canEditStudents]);

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      parentPhone: '',
      classLevel: 9 as ClassLevel,
      programName: 'tyt' as ProgramName,
      coachId: '',
      groupName: '',
      institutionId: ''
    });
  };

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      if (error.message && error.message !== '[object Object]') return error.message;
      const maybeAny = error as unknown as { detail?: unknown; error?: unknown };
      if (typeof maybeAny.detail === 'string') return maybeAny.detail;
      if (typeof maybeAny.error === 'string') return maybeAny.error;
    }
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      const rec = error as Record<string, unknown>;
      if (typeof rec.message === 'string') return rec.message;
      if (typeof rec.detail === 'string') return rec.detail;
      if (typeof rec.error === 'string') return rec.error;
      try {
        return JSON.stringify(error);
      } catch {
        return 'Beklenmeyen bir hata oluştu.';
      }
    }
    return 'Beklenmeyen bir hata oluştu.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const normalizedEmail = formData.email.trim().toLowerCase();
      const duplicate = students.some(
        (s) => s.email.trim().toLowerCase() === normalizedEmail && (!editingStudent || s.id !== editingStudent.id)
      );
      if (duplicate) {
        alert('Bu e-posta ile kayıtlı bir öğrenci zaten var. Lütfen farklı bir e-posta girin.');
        return;
      }

      if (editingStudent) {
        setSaving(true);
        await updateStudent(editingStudent.id, {
          ...formData,
          programId: formData.programName,
          ...(formData.password.trim().length >= 6 ? { password: formData.password.trim() } : {})
        });
        setEditingStudent(null);
      } else {
        const resolvedCoach =
          effectiveUser?.role === 'coach'
            ? resolveCoachRecordId(
                effectiveUser.role,
                effectiveUser.coachId,
                effectiveUser.email,
                coaches
              )
            : formData.coachId.trim();
        if (!resolvedCoach) {
          alert(
            effectiveUser?.role === 'coach'
              ? 'Profilinize koç bağlantısı atanmamış. Yönetici ile iletişime geçin.'
              : 'Yeni öğrenciyi bir koça atamalısınız.'
          );
          return;
        }
        if (formData.password.trim().length < 6) {
          alert('Giriş şifresi en az 6 karakter olmalıdır.');
          return;
        }
        const resolvedInstitution =
          formData.institutionId.trim() ||
          activeInstitutionId ||
          institution?.id ||
          effectiveUser?.institutionId ||
          undefined;
        if (!resolvedInstitution) {
          alert('Kurum bilgisi bulunamadı. Aktif kurumu seçin veya destek ile iletişime geçin.');
          return;
        }
        setSaving(true);
        await addStudent({
          id: '',
          name: formData.name.trim(),
          email: normalizedEmail,
          password: formData.password.trim(),
          phone: formData.phone.trim(),
          parentPhone: formData.parentPhone.trim(),
          classLevel: formData.classLevel,
          coachId: resolvedCoach || undefined,
          institutionId: resolvedInstitution,
          programId: formData.programName,
          groupName: formData.groupName.trim() || undefined,
          createdAt: new Date().toISOString()
        });
        alert(
          `Öğrenci eklendi.\n\nE-posta: ${normalizedEmail}\nŞifre: ${formData.password.trim()}`
        );
      }
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      alert(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (student: Student) => {
    if (!canEditStudents) return;
    setFormData({
      name: student.name,
      email: student.email,
      password: student.password || '',
      phone: student.phone,
      parentPhone: student.parentPhone,
      classLevel: student.classLevel,
      programName: student.programName || inferProgramName(student.classLevel),
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

  const platformUserLabel = (userId: string) =>
    platformStaff.find((s) => s.id === userId)?.name || userId;

  const handleSaveLessonQuota = async () => {
    if (!selectedStudent || !quotaTeacherId.trim()) {
      alert('Öğretmen seçin.');
      return;
    }
    const raw = quotaCreditsInput.trim();
    const credits_total = raw === '' ? null : Number(raw);
    if (credits_total !== null && (Number.isNaN(credits_total) || credits_total < 0)) {
      alert('Ders kotası boş (sınırsız) veya 0 ve üzeri bir tam sayı olmalıdır.');
      return;
    }
    setQuotaSaving(true);
    try {
      const row = await db.upsertStudentTeacherLessonQuota({
        student_id: selectedStudent.id,
        teacher_id: quotaTeacherId.trim(),
        credits_total
      });
      setLessonQuotas((prev) => {
        const rest = prev.filter((p) => p.teacher_id !== row.teacher_id);
        return [...rest, row];
      });
      setQuotaTeacherId('');
      setQuotaCreditsInput('');
    } catch (e) {
      alert(getErrorMessage(e));
    } finally {
      setQuotaSaving(false);
    }
  };

  const handleDeleteLessonQuota = async (teacherId: string) => {
    if (!selectedStudent) return;
    if (!confirm('Bu öğretmen için ders kotasını kaldırmak istiyor musunuz?')) return;
    try {
      await db.deleteStudentTeacherLessonQuota(selectedStudent.id, teacherId);
      setLessonQuotas((prev) => prev.filter((p) => p.teacher_id !== teacherId));
    } catch (e) {
      alert(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Öğrenci Yönetimi</h2>
          <p className="text-gray-500">Toplam {students.length} öğrenci kayıtlı</p>
          <p className="text-sm text-gray-500 mt-1">
            Koç hesapları buradan şifre belirleyerek öğrenci ekleyebilir; müdür ve süper admin tüm süreci kullanıcı veya öğrenci üzerinden yönetir.
          </p>
        </div>
        {canEditStudents && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setEditingStudent(null);
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Öğrenci ekle
          </button>
        )}
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

          <div className="relative">
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value as ProgramName | 'all')}
              className="appearance-none px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
            >
              <option value="all">Tüm Programlar</option>
              {PROGRAM_OPTIONS.map((program) => (
                <option key={program.value} value={program.value}>
                  {program.label}
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
                    <p className="text-xs text-indigo-600 font-medium">{(student.programName || inferProgramName(student.classLevel)).toUpperCase()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedStudent(student)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {canEditStudents ? (
                    <>
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
                    </>
                  ) : null}
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
          {!searchTerm && filterClass === 'all' && canEditStudents && (
            <p className="text-sm text-gray-600">
              Henüz kayıt yoksa{' '}
              <span className="font-semibold text-slate-700">Öğrenci ekle</span> ile giriş e-postası ve şifreyi oluşturun.
            </p>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-slate-800">
                {editingStudent ? 'Öğrenci düzenle' : 'Öğrenci ekle'}
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
                  <p className="text-xs text-gray-500 mt-1">
                    Öğrenci bu e-posta ve aşağıdaki şifre ile giriş yapar (giriş ekranı ile aynı).
                  </p>
                </div>

                {/* Şifre (giriş) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Giriş şifresi {editingStudent ? '(isteğe bağlı)' : '*'}
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required={!editingStudent}
                    minLength={editingStudent ? 0 : 6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder={editingStudent ? 'Değiştirmek için yazın (en az 6 karakter)' : 'En az 6 karakter'}
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

                {/* Program */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Program *</label>
                  <select
                    required
                    value={formData.programName}
                    onChange={(e) => setFormData({ ...formData, programName: e.target.value as ProgramName })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {PROGRAM_OPTIONS.map((program) => (
                      <option key={program.value} value={program.value}>
                        {program.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Öğretmen */}
                {effectiveUser?.role === 'coach' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen/Koç</label>
                    <input
                      type="text"
                      value={
                        coaches.find(
                          c =>
                            c.id ===
                            (resolveCoachRecordId(
                              effectiveUser?.role,
                              effectiveUser?.coachId,
                              effectiveUser?.email,
                              coaches
                            ) || formData.coachId)
                        )?.name || 'Siz'
                      }
                      readOnly
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Öğretmen/Koç</label>
                    <select
                      value={formData.coachId}
                      onChange={(e) => setFormData({ ...formData, coachId: e.target.value })}
                      required={!editingStudent}
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
                )}

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

                {/* Kurum — yöneticiler doğrudan id girebilir; koçta oturum kurumu kullanılır */}
                {effectiveUser?.role !== 'coach' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kurum ID (isteğe bağlı)
                    </label>
                    <input
                      type="text"
                      value={formData.institutionId}
                      onChange={e => setFormData({ ...formData, institutionId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder={
                        activeInstitutionId ||
                        institution?.id ||
                        effectiveUser?.institutionId ||
                        'Boş bırakırsanız oturumdaki kurum kullanılır'
                      }
                    />
                  </div>
                )}
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
                  disabled={saving}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {editingStudent ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 mt-2">
                <h4 className="text-sm font-semibold text-slate-800 mb-1">Canlı özel ders paketi (öğretmen başına)</h4>
                <p className="text-xs text-slate-500 mb-3">
                  Kota <strong>ders birimi</strong> cinsindendir; yalnızca <strong>tamamlanan</strong> (Ders yapıldı) derslerin süresine
                  göre düşer (örn. 1–45 dk → 1 birim). Boş = sınırsız. Tablolar:{' '}
                  <code className="text-[11px] bg-white px-1 rounded">2026-05-09-student-teacher-lesson-quota.sql</code>, süre sütunu:{' '}
                  <code className="text-[11px] bg-white px-1 rounded">2026-05-11-teacher-lessons-duration-units.sql</code>.
                </p>
                {quotaLoading ? (
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
                  </p>
                ) : (
                  <>
                    {lessonQuotas.length > 0 && (
                      <ul className="space-y-2 mb-4">
                        {lessonQuotas.map((q) => {
                          const unlimited = q.unlimited ?? q.credits_total == null;
                          const used = q.units_used ?? q.lessons_used ?? 0;
                          const rem = q.remaining;
                          const exhausted = q.exhausted ?? (!unlimited && rem === 0);
                          const low =
                            !unlimited &&
                            typeof rem === 'number' &&
                            rem > 0 &&
                            rem <= 1 &&
                            !exhausted;
                          return (
                            <li
                              key={q.teacher_id}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                                exhausted
                                  ? 'bg-red-50 border border-red-200 text-red-900'
                                  : low
                                    ? 'bg-amber-50 border border-amber-200 text-amber-950'
                                    : 'bg-white border border-slate-100 text-slate-800'
                              }`}
                            >
                              <span className="font-medium">{platformUserLabel(q.teacher_id)}</span>
                              <span className="text-xs sm:text-sm">
                                {unlimited ? (
                                  <>Paket: sınırsız · kullanılan birim: {used}</>
                                ) : (
                                  <>
                                    Kalan birim: <strong>{rem}</strong> / {q.credits_total} · kullanılan: {used}
                                  </>
                                )}
                              </span>
                              {canEditStudents && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteLessonQuota(q.teacher_id)}
                                  className="ml-auto p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  aria-label="Kotayı kaldır"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {canEditStudents && (
                      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 items-stretch sm:items-end">
                        <label className="flex flex-col gap-1 text-xs flex-1 min-w-[140px]">
                          <span className="text-slate-600">Öğretmen (platform kullanıcısı)</span>
                          <select
                            value={quotaTeacherId}
                            onChange={(e) => setQuotaTeacherId(e.target.value)}
                            className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white"
                          >
                            <option value="">Seçin</option>
                            {platformStaff.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.role})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs flex-1 min-w-[100px]">
                          <span className="text-slate-600">Paket birimi — üst limit (boş = sınırsız)</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="örn. 10"
                            value={quotaCreditsInput}
                            onChange={(e) => setQuotaCreditsInput(e.target.value)}
                            className="border border-slate-200 rounded-lg px-2 py-2 text-sm bg-white"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={quotaSaving || !quotaTeacherId}
                          onClick={() => void handleSaveLessonQuota()}
                          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                        >
                          {quotaSaving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} Kaydet
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
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
                type="button"
                onClick={() => {
                  const digits = (selectedStudent.parentPhone || '').replace(/\D/g, '');
                  if (!digits) return;
                  window.open(`https://wa.me/${digits}`, '_blank');
                }}
                disabled={!(selectedStudent.parentPhone || '').replace(/\D/g, '')}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
