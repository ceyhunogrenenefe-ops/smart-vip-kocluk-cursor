// Türkçe: Haftalık Takip Sayfası
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { WeeklyEntry, Book, formatClassLevelLabel } from '../types';
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
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { summarizeTrackingGaps, generateAiWeeklyDrafts } from '../utils/trackingCalendarAi';

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
  const {
    students,
    weeklyEntries,
    addWeeklyEntry,
    updateWeeklyEntry,
    deleteWeeklyEntry,
    getStudentStats,
    getTopics,
    markTopicCompleted,
    books,
    addBook,
    getStudentBooks
  } = useApp();
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeeklyEntry | null>(null);
  const [showQuickBookAdd, setShowQuickBookAdd] = useState(false);
  const [newBookData, setNewBookData] = useState({ title: '', author: '' });

  const now = new Date();
  const [calYearMonth, setCalYearMonth] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  const [aiFilling, setAiFilling] = useState(false);

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

    // LGS: konu havuzu 'LGS' anahtarında
    if (classLevel === 'LGS') {
      return Object.keys(topicPool).filter(
        subject => (topicPool[subject]['LGS'] || []).length > 0
      );
    }

    // Sayısal sınıf (3–12): sadece bu sınıf için tanımlı konu havuzu olan dersler
    if (typeof classLevel === 'number') {
      return Object.keys(topicPool).filter(
        subject => (topicPool[subject][classLevel] || []).length > 0
      );
    }

    return Object.keys(topicPool);
  }, [selectedStudent]);

  // Konuları al - Ders seçimine göre sadece o derse ait konuları göster
  const getTopicsForStudent = () => {
    if (!selectedStudent || !formData.subject) return [];

    const classLevel = selectedStudent.classLevel;

    // YKS sınıfları için - konuyu doğrudan derse göre al
    if (typeof classLevel === 'string' && classLevel.startsWith('YKS-')) {
      return topicPool[formData.subject]?.[classLevel] || [];
    }

    if (classLevel === 'LGS') {
      return getTopics(formData.subject, 'LGS');
    }

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
    setSelectedDate(entry.date.split('T')[0]);
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

  const gapBullets = useMemo(() => {
    if (!selectedStudentId || !selectedStudent) return [];
    return summarizeTrackingGaps(
      getStudentEntriesLocal(selectedStudentId),
      subjects,
      selectedStudent.name
    );
  }, [selectedStudentId, selectedStudent, weeklyEntries, subjects]);

  const entriesCountByDate = useMemo(() => {
    const m: Record<string, number> = {};
    if (!selectedStudentId) return m;
    getStudentEntriesLocal(selectedStudentId).forEach(e => {
      const k = e.date.split('T')[0];
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [selectedStudentId, weeklyEntries]);

  const calendarCells = useMemo(() => {
    const { y, m } = calYearMonth;
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = last.getDate();
    const cells: ({ day: number; iso: string } | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, iso });
    }
    return cells;
  }, [calYearMonth]);

  const dayModalEntries = useMemo(() => {
    if (!selectedStudentId || !dayModalDate) return [];
    return getStudentEntriesLocal(selectedStudentId).filter(
      e => e.date.split('T')[0] === dayModalDate
    );
  }, [selectedStudentId, dayModalDate, weeklyEntries]);

  const handleAiFillCalendar = async () => {
    if (!selectedStudent || !selectedStudentId) return;
    if (subjects.length === 0) {
      alert('Bu öğrenci için ders listesi boş.');
      return;
    }
    const drafts = generateAiWeeklyDrafts(
      selectedStudentId,
      selectedStudent,
      calYearMonth.y,
      calYearMonth.m,
      weeklyEntries,
      subjects,
      getTopics
    );
    if (drafts.length === 0) {
      alert('Bu ayda eklenecek boş hafta içi gün kalmadı.');
      return;
    }
    if (!confirm(`${drafts.length} adet AI taslak kayıt eklenecek. İstediğiniz gibi düzenleyebilirsiniz. Devam?`)) {
      return;
    }
    setAiFilling(true);
    try {
      for (const d of drafts) {
        await addWeeklyEntry(d);
      }
    } finally {
      setAiFilling(false);
    }
  };

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
                  {student.name} — {formatClassLevelLabel(student.classLevel)}
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

      {selectedStudentId && selectedStudent && (
        <>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Eksiklik / öneri özeti (son kayıtlara göre)
            </h3>
            <ul className="list-disc list-inside text-sm text-amber-900/90 space-y-1 mb-4">
              {gapBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            <button
              type="button"
              disabled={aiFilling || subjects.length === 0}
              onClick={handleAiFillCalendar}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {aiFilling ? 'Ekleniyor...' : 'Seçili ay için AI taslakları takvime ekle'}
            </button>
            <p className="text-xs text-amber-800/80 mt-2">
              Boş hafta içi günlere, zayıf olduğu tahmin edilen derslerden başlayarak taslak kayıt eklenir; tabloda veya
              güne tıklayarak düzenleyebilirsiniz.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-red-500" />
                Takvim — güne tıklayın
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCalYearMonth(p => {
                      if (p.m <= 1) return { y: p.y - 1, m: 12 };
                      return { y: p.y, m: p.m - 1 };
                    })
                  }
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                  aria-label="Önceki ay"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center">
                  {new Date(calYearMonth.y, calYearMonth.m - 1, 1).toLocaleDateString('tr-TR', {
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCalYearMonth(p => {
                      if (p.m >= 12) return { y: p.y + 1, m: 1 };
                      return { y: p.y, m: p.m + 1 };
                    })
                  }
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                  aria-label="Sonraki ay"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500 mb-2">
              {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'].map(d => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell, idx) =>
                cell ? (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      setSelectedDate(cell.iso);
                      setDayModalDate(cell.iso);
                    }}
                    className={`min-h-[72px] rounded-lg border p-1 text-left transition-colors ${
                      selectedDate === cell.iso
                        ? 'border-red-500 bg-red-50 ring-2 ring-red-100'
                        : 'border-gray-100 hover:border-red-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-sm font-semibold text-slate-800">{cell.day}</span>
                    {entriesCountByDate[cell.iso] ? (
                      <span className="mt-1 block text-[10px] text-white bg-red-500 rounded px-1 py-0.5 w-fit">
                        {entriesCountByDate[cell.iso]} kayıt
                      </span>
                    ) : (
                      <span className="mt-1 block text-[10px] text-gray-400">—</span>
                    )}
                  </button>
                ) : (
                  <div key={`pad-${idx}`} className="min-h-[72px]" />
                )
              )}
            </div>
          </div>
        </>
      )}

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

      {/* Güne tıklanınca — o günün kayıtları */}
      {dayModalDate && selectedStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {new Date(dayModalDate + 'T12:00:00').toLocaleDateString('tr-TR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </h3>
                <p className="text-sm text-gray-500">{selectedStudent.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setDayModalDate(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                aria-label="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {dayModalEntries.length === 0 ? (
                <p className="text-sm text-gray-500">Bu gün için henüz kayıt yok.</p>
              ) : (
                <ul className="space-y-2">
                  {dayModalEntries.map(en => (
                    <li
                      key={en.id}
                      className="flex items-start justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-gray-100"
                    >
                      <div>
                        <p className="font-medium text-slate-800 text-sm">
                          {en.subject} — {en.topic}
                        </p>
                        <p className="text-xs text-gray-500">
                          Çözülen {en.solvedQuestions} · D {en.correctAnswers} Y {en.wrongAnswers} B {en.blankAnswers}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleEdit(en);
                          setDayModalDate(null);
                        }}
                        className="text-xs text-red-600 hover:underline shrink-0"
                      >
                        Düzenle
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(dayModalDate);
                  resetForm();
                  setEditingEntry(null);
                  setShowForm(true);
                  setDayModalDate(null);
                }}
                className="w-full py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
              >
                Bu güne yeni kayıt ekle
              </button>
            </div>
          </div>
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