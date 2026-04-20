// Türkçe: Haftalık Takip Sayfası
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { WeeklyEntry, Book } from '../types';
import { topicPool } from '../data/mockData';
import {
  Calendar,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  AlertTriangle,
  ChevronDown,
  BookOpen,
  GraduationCap,
  Filter,
  Save,
  Clock,
  BookMarked,
  PlusCircle
} from 'lucide-react';

// YKS sınıfları için uygun dersleri tanımla - mockData topicPool ile uyumlu
const YKS_SUBJECTS: Record<string, string[]> = {
  'YKS-Sayısal': [
    'TYT TÜRKÇE',
    'TYT MATEMATİK',
    'TYT GEOMETRİ',
    'TYT FİZİK',
    'TYT KİMYA',
    'TYT BİYOLOJİ',
    'TYT TARİH',
    'TYT COĞRAFYA',
    'AYT MATEMATİK',
    'AYT FİZİK',
    'AYT KİMYA',
    'AYT BİYOLOJİ'
  ],
  'YKS-Eşit Ağırlık': [
    'TYT TÜRKÇE',
    'TYT MATEMATİK',
    'TYT GEOMETRİ',
    'TYT TARİH',
    'TYT COĞRAFYA',
    'TYT FELSEFE',
    'TYT DİN KÜLTÜRÜ',
    'AYT MATEMATİK',
    'AYT EDEBİYAT',
    'AYT TARİH',
    'AYT COĞRAFYA',
    'AYT FELSEFE'
  ],
  'YKS-Sözel': [
    'TYT TÜRKÇE',
    'TYT MATEMATİK',
    'TYT GEOMETRİ',
    'TYT TARİH',
    'TYT COĞRAFYA',
    'TYT FELSEFE',
    'TYT DİN KÜLTÜRÜ',
    'AYT EDEBİYAT',
    'AYT TARİH',
    'AYT COĞRAFYA',
    'AYT FELSEFE',
    'AYT DİN KÜLTÜRÜ',
    'AYT PSİKOLOJİ',
    'AYT SOSYOLOJİ',
    'AYT MANTIK'
  ]
};

// TYT alt konuları
const TYT_SUBJECTS = ['TYT TÜRKÇE', 'TYT MATEMATİK', 'TYT GEOMETRİ', 'TYT FİZİK', 'TYT KİMYA', 'TYT BİYOLOJİ', 'TYT TARİH', 'TYT COĞRAFYA', 'TYT FELSEFE', 'TYT DİN KÜLTÜRÜ'];

// Konu eşleştirmesi - topicPool'dan doğru konuları almak için
const SUBJECT_TOPIC_MAP: Record<string, string> = {
  // TYT Dersleri
  'TYT TÜRKÇE': 'TYT TÜRKÇE',
  'TYT MATEMATİK': 'TYT MATEMATİK',
  'TYT GEOMETRİ': 'TYT GEOMETRİ',
  'TYT FİZİK': 'TYT FİZİK',
  'TYT KİMYA': 'TYT KİMYA',
  'TYT BİYOLOJİ': 'TYT BİYOLOJİ',
  'TYT TARİH': 'TARİH',
  'TYT COĞRAFYA': 'COĞRAFYA',
  'TYT FELSEFE': 'FELSEFE',
  'TYT DİN KÜLTÜRÜ': 'DİN KÜLTÜRÜ',
  // AYT Sayısal Dersleri
  'AYT MATEMATİK': 'AYT MATEMATİK',
  'AYT FİZİK': 'AYT FİZİK',
  'AYT KİMYA': 'AYT KİMYA',
  'AYT BİYOLOJİ': 'AYT BİYOLOJİ',
  // AYT Eşit Ağırlık Dersleri
  'AYT EDEBİYAT': 'AYT EDEBİYAT',
  'AYT TARİH': 'AYT TARİH',
  'AYT COĞRAFYA': 'AYT COĞRAFYA',
  'AYT FELSEFE': 'AYT FELSEFE',
  // AYT Sözel Dersleri
  'AYT DİN KÜLTÜRÜ': 'AYT DİN KÜLTÜRÜ',
  'AYT PSİKOLOJİ': 'AYT PSİKOLOJİ',
  'AYT SOSYOLOJİ': 'AYT SOSYOLOJİ',
  'AYT MANTIK': 'AYT MANTIK'
};

export default function Tracking() {
  const { students, weeklyEntries, addWeeklyEntry, updateWeeklyEntry, deleteWeeklyEntry, getStudentStats, getTopics, markTopicCompleted, books, addBook, getStudentBooks } = useApp();
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeeklyEntry | null>(null);
  const [showQuickBookAdd, setShowQuickBookAdd] = useState(false);
  const [newBookData, setNewBookData] = useState({ title: '', author: '' });

  // Seçili öğrencinin kayıtlarını al
  const getStudentEntriesLocal = (studentId: string): WeeklyEntry[] => {
    return weeklyEntries.filter(e => e.studentId === studentId);
  };

  // Form verisi
  const [formData, setFormData] = useState({
    subject: '',
    topic: '',
    targetQuestions: 0,
    solvedQuestions: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    blankAnswers: 0,
    coachComment: '',
    readingMinutes: 0,
    bookId: ''
  });

  // Seçili öğrenci
  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Seçili öğrencinin kitapları
  const studentBooks = useMemo(() => {
    return selectedStudentId ? getStudentBooks(selectedStudentId) : [];
  }, [selectedStudentId, books, getStudentBooks]);

  // Dersleri seçili öğrencinin sınıfına göre filtrele
  const subjects = useMemo(() => {
    if (!selectedStudent) return Object.keys(topicPool);

    const classLevel = selectedStudent.classLevel;

    // YKS sınıfları için sadece ilgili dersleri göster
    if (typeof classLevel === 'string' && YKS_SUBJECTS[classLevel]) {
      return YKS_SUBJECTS[classLevel];
    }

    // Normal sınıflar için tüm dersleri göster
    return Object.keys(topicPool);
  }, [selectedStudent]);

  // Konuları al - Ders seçimine göre sadece o derse ait konuları göster
  const getTopicsForStudent = () => {
    if (!selectedStudent || !formData.subject) return [];

    const classLevel = selectedStudent.classLevel;

    // YKS sınıfları için - konuyu doğrudan derse göre al
    if (typeof classLevel === 'string' && classLevel.startsWith('YKS-')) {
      // TYT ve AYT konularını doğrudan subject key'inde ara
      return topicPool[formData.subject]?.[classLevel] || [];
    }

    // Normal sınıflar (9, 10, 11, 12)
    if (typeof classLevel === 'number') {
      return getTopics(formData.subject, classLevel);
    }

    return [];
  };

  const topics = getTopicsForStudent();

  // Validasyon kontrolü
  const validationError = () => {
    const { solvedQuestions, correctAnswers, wrongAnswers, blankAnswers } = formData;
    const total = correctAnswers + wrongAnswers + blankAnswers;
    if (total !== solvedQuestions) {
      return `Doğru + Yanlış + Boş (${total}) = Çözülen olmalı (${solvedQuestions})`;
    }
    if (solvedQuestions > formData.targetQuestions + 10) {
      return 'Çözülen soru sayısı hedef + 10\'dan fazla olamaz';
    }
    return null;
  };

  const error = validationError();

  // Başarı rengi
  const getSuccessColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600 bg-green-50';
    if (rate >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const resetForm = () => {
    setFormData({
      subject: '',
      topic: '',
      targetQuestions: 0,
      solvedQuestions: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      blankAnswers: 0,
      coachComment: '',
      readingMinutes: 0,
      bookId: ''
    });
    setEditingEntry(null);
    setNewBookData({ title: '', author: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || error) return;

    // Seçili kitabın adını al
    const selectedBook = studentBooks.find(b => b.id === formData.bookId);

    const entryData = {
      studentId: selectedStudentId,
      date: selectedDate,
      subject: formData.subject,
      topic: formData.topic,
      targetQuestions: formData.targetQuestions,
      solvedQuestions: formData.solvedQuestions,
      correctAnswers: formData.correctAnswers,
      wrongAnswers: formData.wrongAnswers,
      blankAnswers: formData.blankAnswers,
      coachComment: formData.coachComment,
      readingMinutes: formData.readingMinutes || undefined,
      bookId: formData.bookId || undefined,
      bookTitle: selectedBook?.title || undefined
    };

    if (editingEntry) {
      updateWeeklyEntry(editingEntry.id, entryData);
    } else {
      const newEntry: WeeklyEntry = {
        id: Date.now().toString(),
        ...entryData,
        createdAt: new Date().toISOString()
      };
      addWeeklyEntry(newEntry);
    }

    setShowForm(false);
    resetForm();
  };

  // Hızlı kitap ekleme
  const handleQuickAddBook = () => {
    if (!newBookData.title || !selectedStudentId) return;

    const newBook: Book = {
      id: `book-${Date.now()}`,
      studentId: selectedStudentId,
      title: newBookData.title,
      author: newBookData.author || 'Bilinmiyor',
      startDate: new Date().toISOString().split('T')[0],
      status: 'reading',
      createdAt: new Date().toISOString()
    };

    addBook(newBook);
    setFormData({ ...formData, bookId: newBook.id });
    setShowQuickBookAdd(false);
    setNewBookData({ title: '', author: '' });
  };

  const handleEdit = (entry: WeeklyEntry) => {
    setFormData({
      subject: entry.subject,
      topic: entry.topic,
      targetQuestions: entry.targetQuestions,
      solvedQuestions: entry.solvedQuestions,
      correctAnswers: entry.correctAnswers,
      wrongAnswers: entry.wrongAnswers,
      blankAnswers: entry.blankAnswers,
      coachComment: entry.coachComment || '',
      readingMinutes: entry.readingMinutes || 0,
      bookId: entry.bookId || ''
    });
    setEditingEntry(entry);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Bu kaydı silmek istediğinizden emin misiniz?')) {
      deleteWeeklyEntry(id);
    }
  };

  // Seçili öğrencinin kayıtları
  const studentEntries = selectedStudentId
    ? getStudentEntriesLocal(selectedStudentId).sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    : [];

  // Haftalık istatistikler
  const weekStats = selectedStudentId && selectedStudent
    ? getStudentStats(selectedStudentId)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Haftalık Takip</h2>
          <p className="text-gray-500">Öğrenci günlük performans takibi</p>
        </div>
        <button
          onClick={() => {
            if (!selectedStudentId) {
              alert('Lütfen önce bir öğrenci seçin.');
              return;
            }
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Yeni Kayıt Ekle
        </button>
      </div>

      {/* Öğrenci ve Tarih Seçimi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Öğrenci Seçimi */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <GraduationCap className="w-4 h-4 inline mr-1" />
              Öğrenci Seçin *
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Öğrenci Seçin</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} - {student.classLevel}
                </option>
              ))}
            </select>
          </div>

          {/* Tarih Seçimi */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Tarih Seçin
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* İstatistikler */}
          {weekStats && weekStats.totalSolved > 0 && (
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-500 mb-2">Haftalık Özet</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-2xl font-bold text-slate-800">%{weekStats.successRate}</p>
                  <p className="text-xs text-gray-500">Başarı</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">%{weekStats.realizationRate}</p>
                  <p className="text-xs text-gray-500">Hedef</p>
                </div>
                {weekStats.totalReadingMinutes > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-green-600">{weekStats.totalReadingMinutes}</p>
                    <p className="text-xs text-gray-500">Okuma dk</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Kayıt Tablosu */}
      {selectedStudentId ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tarih</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ders</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Konu</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Hedef</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Çözülen</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Doğru</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Yanlış</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Boş</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Başarı %</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Okuma</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {studentEntries.length > 0 ? (
                  studentEntries.map((entry) => {
                    const successRate = entry.solvedQuestions > 0
                      ? Math.round((entry.correctAnswers / entry.solvedQuestions) * 100)
                      : 0;

                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(entry.date).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">
                          {entry.subject}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {entry.topic}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-center">
                          {entry.targetQuestions}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-center">
                          {entry.solvedQuestions}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-600 text-center font-medium">
                          {entry.correctAnswers}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600 text-center font-medium">
                          {entry.wrongAnswers}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 text-center">
                          {entry.blankAnswers}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded-lg text-sm font-medium ${getSuccessColor(successRate)}`}>
                            %{successRate}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {entry.readingMinutes ? (
                            <div className="flex items-center justify-center gap-1 text-green-600">
                              <Clock className="w-4 h-4" />
                              <span className="text-sm font-medium">{entry.readingMinutes} dk</span>
                              {entry.bookTitle && (
                                <BookMarked className="w-3 h-3" title={entry.bookTitle} />
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleEdit(entry)}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center">
                      <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">Bu öğrenci için henüz kayıt bulunmuyor.</p>
                      <button
                        onClick={() => setShowForm(true)}
                        className="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors inline-flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        İlk Kaydı Ekle
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Öğrenci Seçin</h3>
          <p className="text-gray-500">Takip etmek istediğiniz öğrenciyi seçin.</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-slate-800">
                {editingEntry ? 'Kayıt Düzenle' : 'Yeni Kayıt'} - {selectedStudent.name}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ders */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ders *</label>
                  <select
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value, topic: '' })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Ders Seçin</option>
                    {subjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Konu */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Konu *</label>
                  <select
                    required
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    disabled={!formData.subject}
                  >
                    <option value="">Konu Seçin</option>
                    {topics.length > 0 ? (
                      topics.map((topic) => (
                        <option key={topic} value={topic}>
                          {topic}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>Bu ders için konu bulunamadı</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Soru Sayıları */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Soru Sayıları</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Hedef Soru *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.targetQuestions}
                      onChange={(e) => setFormData({ ...formData, targetQuestions: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Çözülen *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.solvedQuestions}
                      onChange={(e) => setFormData({ ...formData, solvedQuestions: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Doğru *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.correctAnswers}
                      onChange={(e) => setFormData({ ...formData, correctAnswers: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Yanlış *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.wrongAnswers}
                      onChange={(e) => setFormData({ ...formData, wrongAnswers: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Boş *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.blankAnswers}
                      onChange={(e) => setFormData({ ...formData, blankAnswers: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>

                {/* Validasyon Uyarısı */}
                {error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>
                )}

                {/* Otomatik Hesaplamalar */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500">Başarı %</p>
                    <p className="text-xl font-bold text-slate-800">
                      {formData.solvedQuestions > 0
                        ? Math.round((formData.correctAnswers / formData.solvedQuestions) * 100)
                        : 0}%
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500">Gerçekleşme %</p>
                    <p className="text-xl font-bold text-slate-800">
                      {formData.targetQuestions > 0
                        ? Math.round((formData.solvedQuestions / formData.targetQuestions) * 100)
                        : 0}%
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500">Toplam</p>
                    <p className="text-xl font-bold text-slate-800">
                      {formData.correctAnswers + formData.wrongAnswers + formData.blankAnswers}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500">Kalan</p>
                    <p className="text-xl font-bold text-slate-800">
                      {formData.targetQuestions - formData.solvedQuestions > 0
                        ? formData.targetQuestions - formData.solvedQuestions
                        : 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Koç Yorumu */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Koç Yorumu</label>
                <textarea
                  value={formData.coachComment}
                  onChange={(e) => setFormData({ ...formData, coachComment: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Öğrenci hakkında notlar..."
                />
              </div>

              {/* Kitap Okuma */}
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-green-800 flex items-center gap-2">
                    <BookMarked className="w-4 h-4" />
                    Kitap Okuma (Opsiyonel)
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Okuma Süresi */}
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-1">
                      <Clock className="w-4 h-4 inline mr-1" />
                      Okuma Süresi (dakika)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.readingMinutes || ''}
                      onChange={(e) => setFormData({ ...formData, readingMinutes: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="0"
                    />
                  </div>

                  {/* Kitap Seçimi */}
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-1">
                      <BookOpen className="w-4 h-4 inline mr-1" />
                      Okunan Kitap
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={formData.bookId}
                        onChange={(e) => setFormData({ ...formData, bookId: e.target.value })}
                        className="flex-1 px-4 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Genel Okuma</option>
                        {studentBooks.map((book) => (
                          <option key={book.id} value={book.id}>
                            {book.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowQuickBookAdd(true)}
                        className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                        title="Yeni Kitap Ekle"
                      >
                        <PlusCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Hızlı Kitap Ekleme Popup */}
                {showQuickBookAdd && (
                  <div className="mt-4 p-4 bg-white rounded-lg border border-green-300">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="font-medium text-green-800">Hızlı Kitap Ekle</h5>
                      <button
                        type="button"
                        onClick={() => setShowQuickBookAdd(false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={newBookData.title}
                        onChange={(e) => setNewBookData({ ...newBookData, title: e.target.value })}
                        placeholder="Kitap Adı *"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <input
                        type="text"
                        value={newBookData.author}
                        onChange={(e) => setNewBookData({ ...newBookData, author: e.target.value })}
                        placeholder="Yazar (opsiyonel)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <button
                        type="button"
                        onClick={handleQuickAddBook}
                        disabled={!newBookData.title}
                        className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                      >
                        Kitap Ekle ve Seç
                      </button>
                    </div>
                  </div>
                )}

                {/* Okuma Özeti */}
                {formData.readingMinutes > 0 && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-green-200">
                    <p className="text-sm text-green-700">
                      <strong>{formData.readingMinutes} dakika</strong> okuma kaydedilecek.
                      {formData.bookId && studentBooks.find(b => b.id === formData.bookId) && (
                        <span> • <strong>{studentBooks.find(b => b.id === formData.bookId)?.title}</strong> kitabı</span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={!!error}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {editingEntry ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}