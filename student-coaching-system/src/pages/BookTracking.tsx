// Türkçe: Kitap Okuma Takip Sistemi - Admin ve Koç Paneli
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveCoachRecordId } from '../lib/coachResolve';
import { Book, ReadingLog, formatClassLevelLabel } from '../types';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Clock,
  Target,
  TrendingUp,
  Award,
  Calendar,
  Users,
  AlertCircle,
  CheckCircle,
  Info,
  Star,
  Flame,
  BookMarked,
  Timer,
  ChevronLeft,
  ChevronRight,
  Save
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export default function BookTracking() {
  const { effectiveUser } = useAuth();
  const {
    students,
    coaches,
    weeklyEntries,
    books,
    readingLogs,
    addBook,
    updateBook,
    deleteBook,
    addReadingLog,
    getStudentBooks,
    getStudentReadingLogs,
    getReadingStats,
    getReadingHeatmap,
    getReadingComments,
    getReadingBadges,
    getBookReadingTime
  } = useApp();

  // State
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [showAddBook, setShowAddBook] = useState(false);
  const [showAddLog, setShowAddLog] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Form states
  const [newBook, setNewBook] = useState({
    title: '',
    author: '',
    totalPages: '',
    startDate: new Date().toISOString().split('T')[0],
    status: 'reading' as 'reading' | 'completed' | 'planned'
  });

  const [newLog, setNewLog] = useState({
    date: new Date().toISOString().split('T')[0],
    minutesRead: '',
    pagesRead: '',
    bookId: '',
    notes: ''
  });

  // Seçili öğrencinin verileri
  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const studentBooks = selectedStudentId ? getStudentBooks(selectedStudentId) : [];
  const studentLogs = selectedStudentId ? getStudentReadingLogs(selectedStudentId) : [];
  const studentWeeklyEntries = selectedStudentId ? weeklyEntries.filter(e => e.studentId === selectedStudentId && e.readingMinutes && e.readingMinutes > 0) : [];
  const stats = selectedStudentId ? getReadingStats(selectedStudentId) : null;
  const comments = selectedStudentId ? getReadingComments(selectedStudentId) : [];
  const badges = selectedStudentId ? getReadingBadges(selectedStudentId) : [];
  const heatmapData = selectedStudentId ? getReadingHeatmap(selectedStudentId, selectedYear, selectedMonth) : {};

  // Hibrit Okuma Verileri - Hem haftalık kayıtlardan hem de okuma loglarından
  const hybridReadingLogs = useMemo(() => {
    // Haftalık kayıtlardan okuma verilerini dönüştür
    const weeklyReading = studentWeeklyEntries.map(entry => ({
      id: `weekly-${entry.id}`,
      studentId: entry.studentId,
      bookId: entry.bookId,
      date: entry.date,
      // Haftalık Takip'te kaydedilen değer sayfa sayısıdır.
      minutesRead: entry.readingMinutes || 0,
      pagesRead: entry.readingMinutes || 0,
      notes: undefined,
      source: 'weekly' as const,
      bookTitle: entry.bookTitle,
      createdAt: entry.createdAt
    }));

    // Standalone okuma logları
    const standaloneReading = studentLogs.map(log => ({
      ...log,
      // Sayfa boş bırakıldıysa mevcut değerle uyumlu kalsın.
      pagesRead: log.pagesRead ?? log.minutesRead,
      source: 'log' as const
    }));

    // Birleştir ve tarihe göre sırala
    return [...weeklyReading, ...standaloneReading].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [studentWeeklyEntries, studentLogs]);

  // Koçun öğrencileri (taklit oturumunda effectiveUser koç olmalı)
  const resolvedCoachId = resolveCoachRecordId(
    effectiveUser?.role,
    effectiveUser?.coachId,
    effectiveUser?.email,
    coaches
  );
  const coachStudents =
    effectiveUser?.role === 'coach' && resolvedCoachId
      ? students.filter((s) => s.coachId === resolvedCoachId)
      : students;

  // Yeni kitap ekle
  const handleAddBook = () => {
    if (!newBook.title || !newBook.author || !selectedStudentId) return;

    const book: Book = {
      id: `book-${Date.now()}`,
      studentId: selectedStudentId,
      title: newBook.title,
      author: newBook.author,
      totalPages: newBook.totalPages ? parseInt(newBook.totalPages) : undefined,
      startDate: newBook.startDate,
      status: newBook.status,
      createdAt: new Date().toISOString()
    };

    addBook(book);
    setNewBook({ title: '', author: '', totalPages: '', startDate: new Date().toISOString().split('T')[0], status: 'reading' });
    setShowAddBook(false);
  };

  // Kitap güncelle
  const handleUpdateBook = (bookId: string, updates: Partial<Book>) => {
    updateBook(bookId, updates);
    setEditingBookId(null);
  };

  // Yeni okuma kaydı ekle
  const handleAddLog = () => {
    if (!newLog.date || !newLog.minutesRead || !selectedStudentId) return;

    const log: ReadingLog = {
      id: `log-${Date.now()}`,
      studentId: selectedStudentId,
      bookId: newLog.bookId || undefined,
      date: newLog.date,
      minutesRead: parseInt(newLog.minutesRead),
      pagesRead: newLog.pagesRead ? parseInt(newLog.pagesRead) : undefined,
      notes: newLog.notes || undefined,
      createdAt: new Date().toISOString()
    };

    addReadingLog(log);
    setNewLog({ date: new Date().toISOString().split('T')[0], minutesRead: '', pagesRead: '', bookId: '', notes: '' });
    setShowAddLog(false);
  };

  // Isı haritası için renk hesaplama
  const getHeatmapColor = (minutes: number) => {
    if (minutes === 0) return 'bg-gray-100';
    if (minutes < 15) return 'bg-green-200';
    if (minutes < 30) return 'bg-green-300';
    if (minutes < 45) return 'bg-green-400';
    if (minutes < 60) return 'bg-green-500';
    return 'bg-green-600';
  };

  // Grafik verileri
  const lineChartData = useMemo(() => {
    if (!selectedStudentId) return null;

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayLogs = hybridReadingLogs.filter(l => l.date === dateStr);
      const totalPages = dayLogs.reduce((sum, l) => sum + (l.pagesRead ?? l.minutesRead), 0);
      last7Days.push({
        date: date.toLocaleDateString('tr-TR', { weekday: 'short' }),
        pages: totalPages
      });
    }

    return {
      labels: last7Days.map(d => d.date),
      datasets: [{
        label: 'Okunan Sayfa',
        data: last7Days.map(d => d.pages),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4
      }]
    };
  }, [selectedStudentId, hybridReadingLogs]);

  const barChartData = useMemo(() => {
    if (!selectedStudentId || studentBooks.length === 0) return null;

    const bookStats = studentBooks.slice(0, 5).map(book => ({
      title: book.title.length > 20 ? book.title.substring(0, 20) + '...' : book.title,
      pages: getBookReadingTime(book.id)
    }));

    return {
      labels: bookStats.map(b => b.title),
      datasets: [{
        label: 'Okunan Sayfa',
        data: bookStats.map(b => b.pages),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(139, 92, 246, 0.8)',
          'rgba(236, 72, 153, 0.8)'
        ],
        borderRadius: 8
      }]
    };
  }, [selectedStudentId, studentBooks, readingLogs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <BookMarked className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Kitap Okuma Takibi</h2>
              <p className="text-gray-500">Öğrencilerin okuma alışkanlıklarını takip edin</p>
            </div>
          </div>
          <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            Hibrit Mod: Haftalık Kayıt + Okuma Logları
          </div>
        </div>
        {/* Bilgi Notu */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <strong>Not:</strong> Okuma verileri iki kaynaktan alınır: (1) <strong>Haftalık Takip</strong> sayfasından eklenen kayıtlar ve (2) buradan eklenen doğrudan okuma logları.
            Öğrenciler okuma bilgilerini <strong>Haftalık Takip</strong> sayfasından da girebilir.
          </div>
        </div>
      </div>

      {/* Öğrenci Seçimi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-4 mb-4">
          <Users className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-800">Öğrenci Seçimi</h3>
        </div>
        <select
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
          className="w-full md:w-1/3 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Öğrenci seçin...</option>
          {coachStudents.map(student => (
            <option key={student.id} value={student.id}>
              {student.name} - {formatClassLevelLabel(student.classLevel)}
            </option>
          ))}
        </select>
      </div>

      {selectedStudentId && stats && (
        <>
          {/* İstatistik Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Toplam Okuma</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.totalMinutes} sayfa</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Okuma Serisi</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.readingStreak} gün 🔥</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Flame className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Tamamlanan Kitap</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.completedBooks}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Günlük Ortalama</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.averageDailyMinutes} sayfa</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Rozetler */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Award className="w-5 h-5 text-yellow-500" />
              <h3 className="text-lg font-semibold text-slate-800">Başarı Rozetleri</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {badges.map(badge => (
                <div
                  key={badge.id}
                  className={`p-4 rounded-xl text-center transition-all ${
                    badge.earned
                      ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300'
                      : 'bg-gray-50 border-2 border-gray-200 opacity-50'
                  }`}
                >
                  <div className="text-3xl mb-1">{badge.icon}</div>
                  <p className="text-sm font-medium text-slate-700">{badge.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{badge.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Yorumları */}
          {comments.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Info className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-semibold text-slate-800">AI Koç Yorumu</h3>
              </div>
              <div className="space-y-3">
                {comments.map((comment, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border-l-4 ${
                      comment.type === 'warning' ? 'bg-yellow-50 border-yellow-400' :
                      comment.type === 'success' ? 'bg-green-50 border-green-400' :
                      comment.type === 'improvement' ? 'bg-blue-50 border-blue-400' :
                      'bg-gray-50 border-gray-400'
                    }`}
                  >
                    <p className="font-medium text-slate-800">{comment.title}</p>
                    <p className="text-sm text-gray-600 mt-1">{comment.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Grafikler */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Son 7 Gün Okuma</h3>
              {lineChartData && (
                <Line
                  data={lineChartData}
                  options={{
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, title: { display: true, text: 'Sayfa' } }
                    }
                  }}
                />
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Kitap Bazlı Okunan Sayfa</h3>
              {barChartData && (
                <Bar
                  data={barChartData}
                  options={{
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, title: { display: true, text: 'Sayfa' } }
                    }
                  }}
                />
              )}
            </div>
          </div>

          {/* Isı Haritası */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Aylık Okuma Takvimi</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (selectedMonth === 0) {
                      setSelectedMonth(11);
                      setSelectedYear(selectedYear - 1);
                    } else {
                      setSelectedMonth(selectedMonth - 1);
                    }
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="font-medium min-w-[140px] text-center">
                  {MONTHS_TR[selectedMonth]} {selectedYear}
                </span>
                <button
                  onClick={() => {
                    if (selectedMonth === 11) {
                      setSelectedMonth(0);
                      setSelectedYear(selectedYear + 1);
                    } else {
                      setSelectedMonth(selectedMonth + 1);
                    }
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(day => (
                <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}
              {/* Boş hücreler */}
              {Array.from({ length: new Date(selectedYear, selectedMonth, 1).getDay() === 0 ? 6 : new Date(selectedYear, selectedMonth, 1).getDay() - 1 }).map((_, idx) => (
                <div key={`empty-${idx}`} className="aspect-square" />
              ))}
              {/* Gün hücreleri */}
              {Array.from({ length: new Date(selectedYear, selectedMonth + 1, 0).getDate() }).map((_, idx) => {
                const day = (idx + 1).toString().padStart(2, '0');
                const pages = heatmapData[day] || 0;
                return (
                  <div
                    key={day}
                    className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium cursor-pointer hover:ring-2 hover:ring-green-400 transition-all ${getHeatmapColor(pages)}`}
                    title={`${day} ${MONTHS_TR[selectedMonth]}: ${pages} sayfa`}
                  >
                    {idx + 1}
                  </div>
                );
              })}
            </div>

            {/* Isı haritası açıklaması */}
            <div className="flex items-center justify-end gap-2 mt-4 text-xs text-gray-500">
              <span>0 sayfa</span>
              <div className="flex gap-1">
                <div className="w-4 h-4 bg-gray-100 rounded" />
                <div className="w-4 h-4 bg-green-200 rounded" />
                <div className="w-4 h-4 bg-green-300 rounded" />
                <div className="w-4 h-4 bg-green-400 rounded" />
                <div className="w-4 h-4 bg-green-500 rounded" />
                <div className="w-4 h-4 bg-green-600 rounded" />
              </div>
              <span>60+ sayfa</span>
            </div>
          </div>

          {/* Kitap Listesi */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-800">Kitap Listesi</h3>
              </div>
              <button
                onClick={() => setShowAddBook(!showAddBook)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Yeni Kitap
              </button>
            </div>

            {/* Yeni Kitap Formu */}
            {showAddBook && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <h4 className="font-medium text-green-800 mb-3">Yeni Kitap Ekle</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input
                    type="text"
                    placeholder="Kitap Adı"
                    value={newBook.title}
                    onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                    className="px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="text"
                    placeholder="Yazar"
                    value={newBook.author}
                    onChange={(e) => setNewBook({ ...newBook, author: e.target.value })}
                    className="px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="number"
                    placeholder="Sayfa Sayısı (opsiyonel)"
                    value={newBook.totalPages}
                    onChange={(e) => setNewBook({ ...newBook, totalPages: e.target.value })}
                    className="px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <select
                    value={newBook.status}
                    onChange={(e) => setNewBook({ ...newBook, status: e.target.value as any })}
                    className="px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="reading">Okuyor</option>
                    <option value="completed">Tamamlandı</option>
                    <option value="planned">Planlandı</option>
                  </select>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleAddBook}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    Ekle
                  </button>
                  <button
                    onClick={() => setShowAddBook(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}

            {/* Kitap Tablosu */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">#</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Kitap Adı</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Yazar</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Başlangıç</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Bitiş</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Süre</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Durum</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Puan</th>
                  </tr>
                </thead>
                <tbody>
                  {studentBooks.map((book, idx) => (
                    <tr key={book.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-500">{idx + 1}</td>
                      <td className="py-3 px-4 text-sm font-medium text-slate-800">{book.title}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{book.author}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">{book.startDate}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">{book.endDate || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">{getBookReadingTime(book.id)} sayfa</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          book.status === 'completed' ? 'bg-green-100 text-green-700' :
                          book.status === 'reading' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {book.status === 'completed' ? 'Tamamlandı' : book.status === 'reading' ? 'Okuyor' : 'Planlandı'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {book.rating ? (
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${i < book.rating! ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {studentBooks.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500">
                        Henüz kitap eklenmemiş.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Okuma Kayıtları */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Timer className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-800">Günlük Okuma Kayıtları</h3>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  {hybridReadingLogs.length} kayıt
                </span>
              </div>
              <button
                onClick={() => setShowAddLog(!showAddLog)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Yeni Kayıt
              </button>
            </div>

            {/* Yeni Kayıt Formu */}
            {showAddLog && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <h4 className="font-medium text-green-800 mb-3">Günlük Okuma Ekle</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input
                    type="date"
                    value={newLog.date}
                    onChange={(e) => setNewLog({ ...newLog, date: e.target.value })}
                    className="px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="number"
                    placeholder="Okunan Sayfa *"
                    value={newLog.minutesRead}
                    onChange={(e) => setNewLog({ ...newLog, minutesRead: e.target.value })}
                    className="px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <input
                    type="number"
                    placeholder="Sayfa (opsiyonel)"
                    value={newLog.pagesRead}
                    onChange={(e) => setNewLog({ ...newLog, pagesRead: e.target.value })}
                    className="px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <select
                    value={newLog.bookId}
                    onChange={(e) => setNewLog({ ...newLog, bookId: e.target.value })}
                    className="px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Genel Okuma</option>
                    {studentBooks.map(book => (
                      <option key={book.id} value={book.id}>{book.title}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  placeholder="Not (opsiyonel)"
                  value={newLog.notes}
                  onChange={(e) => setNewLog({ ...newLog, notes: e.target.value })}
                  className="w-full mt-3 px-3 py-2 border border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows={2}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleAddLog}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    Kaydet
                  </button>
                  <button
                    onClick={() => setShowAddLog(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}

            {/* Kaynak Açıklaması */}
            <div className="flex items-center gap-4 mb-4 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-green-500 rounded"></span>
                Haftalık Kayıt
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-blue-500 rounded"></span>
                Okuma Logu
              </span>
            </div>

            {/* Hibrit Kayıt Listesi */}
            <div className="space-y-2">
              {hybridReadingLogs.slice(0, 15).map(log => {
                const book = books.find(b => b.id === log.bookId);
                const displayTitle = ('bookTitle' in log && log.bookTitle) || (book ? book.title : 'Genel Okuma');
                const sourceColor = log.source === 'weekly' ? 'bg-green-500' : 'bg-blue-500';
                return (
                  <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 ${sourceColor} rounded-lg flex items-center justify-center`}>
                        <Clock className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{log.pagesRead ?? log.minutesRead} sayfa</p>
                        <p className="text-sm text-gray-500">
                          {new Date(log.date).toLocaleDateString('tr-TR')} • {displayTitle}
                        </p>
                        {log.notes && <p className="text-xs text-gray-400 mt-1">{log.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.pagesRead && (
                        <span className="text-sm text-gray-500">{log.pagesRead} sayfa</span>
                      )}
                      <span className={`px-2 py-0.5 ${sourceColor} text-white rounded-full text-xs`}>
                        {log.source === 'weekly' ? 'Haftalık' : 'Log'}
                      </span>
                    </div>
                  </div>
                );
              })}
              {hybridReadingLogs.length === 0 && (
                <p className="text-center text-gray-500 py-4">Henüz okuma kaydı yok.</p>
              )}
            </div>
          </div>
        </>
      )}

      {!selectedStudentId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <BookMarked className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">Öğrenci Seçin</h3>
          <p className="text-gray-500">Kitap okuma takibini görüntülemek için yukarıdan bir öğrenci seçin.</p>
        </div>
      )}
    </div>
  );
}
