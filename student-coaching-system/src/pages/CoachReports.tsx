// Türkçe: Eğitim Koçu Raporları Sayfası - Öğrenci deneme takibi ve raporlama
import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  FileText,
  Download,
  MessageCircle,
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Award,
  Calendar,
  ClipboardList,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Search,
  Eye,
  Printer,
  UserCircle
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
  Legend
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Chart.js kayıt
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface ExamResult {
  id: string;
  studentId: string;
  examType: 'TYT' | 'AYT' | '9' | '10' | '11' | '12';
  examDate: string;
  totalNet: number;
  subjects: {
    name: string;
    net: number;
    correct: number;
    wrong: number;
    blank: number;
  }[];
  notes?: string;
  createdAt: string;
}

type TabType = 'overview' | 'exams' | 'reports' | 'send';

export default function CoachReports() {
  const { user } = useAuth();
  const { students, coaches, weeklyEntries, getStudentStats } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<'student' | 'all'>('student');
  const reportRef = useRef<HTMLDivElement>(null);

  // Koçun öğrencileri
  const myStudents = useMemo(() => {
    if (!user?.coachId) return [];
    const coach = coaches.find(c => c.id === user.coachId);
    if (!coach) return [];
    return students.filter(s => coach.studentIds.includes(s.id));
  }, [user, coaches, students]);

  // Mock deneme sonuçları
  const [examResults] = useState<ExamResult[]>([
    {
      id: '1',
      studentId: '1',
      examType: 'TYT',
      examDate: '2024-03-15',
      totalNet: 28.5,
      subjects: [
        { name: 'Türkçe', net: 8.75, correct: 9, wrong: 0, blank: 1 },
        { name: 'Matematik', net: 7.25, correct: 8, wrong: 1, blank: 1 },
        { name: 'Sosyal', net: 6.0, correct: 6, wrong: 2, blank: 2 },
        { name: 'Fen', net: 6.5, correct: 7, wrong: 1, blank: 2 }
      ],
      createdAt: '2024-03-15T14:30:00Z'
    },
    {
      id: '2',
      studentId: '1',
      examType: 'TYT',
      examDate: '2024-03-08',
      totalNet: 25.0,
      subjects: [
        { name: 'Türkçe', net: 7.0, correct: 7, wrong: 2, blank: 1 },
        { name: 'Matematik', net: 6.5, correct: 7, wrong: 2, blank: 1 },
        { name: 'Sosyal', net: 5.5, correct: 6, wrong: 3, blank: 1 },
        { name: 'Fen', net: 6.0, correct: 6, wrong: 2, blank: 2 }
      ],
      createdAt: '2024-03-08T10:00:00Z'
    },
    {
      id: '3',
      studentId: '2',
      examType: 'AYT',
      examDate: '2024-03-14',
      totalNet: 45.0,
      subjects: [
        { name: 'Matematik', net: 15.0, correct: 15, wrong: 2, blank: 3 },
        { name: 'Fizik', net: 10.0, correct: 10, wrong: 1, blank: 4 },
        { name: 'Kimya', net: 10.0, correct: 10, wrong: 0, blank: 5 },
        { name: 'Biyoloji', net: 10.0, correct: 10, wrong: 0, blank: 5 }
      ],
      createdAt: '2024-03-14T16:00:00Z'
    }
  ]);

  // Koçun öğrencilerinin deneme sonuçları
  const myExamResults = useMemo(() => {
    const studentIds = myStudents.map(s => s.id);
    return examResults.filter(r => studentIds.includes(r.studentId));
  }, [examResults, myStudents]);

  // Seçili öğrencinin sonuçları
  const selectedStudentResults = useMemo(() => {
    if (!selectedStudent) return myExamResults;
    return myExamResults.filter(r => r.studentId === selectedStudent)
      .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  }, [selectedStudent, myExamResults]);

  // Genel istatistikler
  const overallStats = useMemo(() => {
    const tytResults = myExamResults.filter(r => r.examType === 'TYT');
    const aytResults = myExamResults.filter(r => r.examType === 'AYT');

    return {
      totalExams: myExamResults.length,
      studentCount: myStudents.length,
      tytAvg: tytResults.length > 0
        ? Math.round(tytResults.reduce((sum, r) => sum + r.totalNet, 0) / tytResults.length * 10) / 10
        : 0,
      aytAvg: aytResults.length > 0
        ? Math.round(aytResults.reduce((sum, r) => sum + r.totalNet, 0) / aytResults.length * 10) / 10
        : 0,
      latestResult: myExamResults[0]?.totalNet || 0
    };
  }, [myExamResults, myStudents]);

  // Öğrenci istatistikleri
  const getStudentExamStats = (studentId: string) => {
    const results = examResults.filter(r => r.studentId === studentId);
    if (results.length === 0) return null;

    const latest = results[0];
    const previous = results[1];
    const avgNet = results.reduce((sum, r) => sum + r.totalNet, 0) / results.length;

    return {
      latestNet: latest.totalNet,
      netChange: previous ? latest.totalNet - previous.totalNet : 0,
      avgNet: Math.round(avgNet * 10) / 10,
      examCount: results.length,
      bestNet: Math.max(...results.map(r => r.totalNet))
    };
  };

  // Grafik verileri
  const performanceChartData = useMemo(() => {
    const studentId = selectedStudent || myStudents[0]?.id;
    if (!studentId) return null;

    const results = examResults
      .filter(r => r.studentId === studentId)
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());

    return {
      labels: results.map(r => new Date(r.examDate).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Toplam Net',
        data: results.map(r => r.totalNet),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3
      }]
    };
  }, [selectedStudent, myStudents, examResults]);

  const subjectChartData = useMemo(() => {
    if (!selectedStudent) return null;
    const latest = selectedStudentResults[0];
    if (!latest) return null;

    return {
      labels: latest.subjects.map(s => s.name),
      datasets: [{
        label: 'Net',
        data: latest.subjects.map(s => s.net),
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(234, 179, 8, 0.8)',
          'rgba(239, 68, 68, 0.8)'
        ],
        borderWidth: 0
      }]
    };
  }, [selectedStudent, selectedStudentResults]);

  // PDF rapor oluştur
  const generatePDF = async () => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();

    // Başlık
    pdf.setFontSize(20);
    pdf.setTextColor(30, 64, 175);
    pdf.text('Deneme Sınavı Raporu', pageWidth / 2, 20, { align: 'center' });

    pdf.setFontSize(12);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, pageWidth / 2, 28, { align: 'center' });

    // Öğrenci bilgileri
    if (selectedStudent) {
      const student = students.find(s => s.id === selectedStudent);
      pdf.setFontSize(14);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Öğrenci: ${student?.name || 'Bilgi yok'}`, 20, 45);
      pdf.text(`Sınıf: ${student?.classLevel || 'Bilgi yok'}. Sınıf`, 20, 52);
    } else {
      pdf.setFontSize(14);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Tüm Öğrenciler İçin Rapor`, 20, 45);
    }

    // İstatistikler
    pdf.setFontSize(12);
    pdf.text('Genel İstatistikler:', 20, 65);
    pdf.setFontSize(10);
    pdf.text(`Toplam Deneme: ${overallStats.totalExams}`, 25, 73);
    pdf.text(`TYT ortalaması: ${overallStats.tytAvg} net`, 25, 80);
    pdf.text(`AYT ortalaması: ${overallStats.aytAvg} net`, 25, 87);

    // Deneme sonuçları
    let yPos = 100;
    pdf.setFontSize(12);
    pdf.text('Deneme Sonuçları:', 20, yPos);
    yPos += 10;

    selectedStudentResults.forEach((result, idx) => {
      if (yPos > 270) {
        pdf.addPage();
        yPos = 20;
      }

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`${idx + 1}. ${result.examType} - ${new Date(result.examDate).toLocaleDateString('tr-TR')} - ${result.totalNet} net`, 25, yPos);
      yPos += 7;

      result.subjects.forEach(subject => {
        pdf.setFontSize(9);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`  ${subject.name}: ${subject.net} net (D:${subject.correct} Y:${subject.wrong} B:${subject.blank})`, 30, yPos);
        yPos += 5;
      });

      yPos += 5;
    });

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text('Bu rapor Eğitim Koçluğu Sistemi tarafından oluşturulmuştur.', pageWidth / 2, 285, { align: 'center' });

    pdf.save(`deneme-raporu-${selectedStudent || 'genel'}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // WhatsApp mesajı oluştur
  const generateWhatsAppMessage = () => {
    const student = selectedStudent ? students.find(s => s.id === selectedStudent) : null;
    const latest = selectedStudentResults[0];

    let message = `📊 *Deneme Sınavı Raporu*\n\n`;

    if (student) {
      message += `👤 *Öğrenci:* ${student.name}\n`;
      message += `📚 *Sınıf:* ${student.classLevel}. Sınıf\n\n`;
    }

    message += `📈 *Sonuçlar:*\n`;
    message += `• Toplam Deneme: ${selectedStudentResults.length}\n`;

    if (latest) {
      message += `• Son Net: ${latest.totalNet}\n`;
      message += `• Sınav Türü: ${latest.examType}\n`;
      message += `• Tarih: ${new Date(latest.examDate).toLocaleDateString('tr-TR')}\n\n`;

      message += `📚 *Ders Bazlı:*\n`;
      latest.subjects.forEach(s => {
        message += `• ${s.name}: ${s.net} net\n`;
      });
    }

    message += `\n💬 *Koç Yorumu:*\n`;
    message += `Öğrencinin performansı değerlendiriliyor. Bireysel görüşme için tarih belirlenebilir.`;

    return encodeURIComponent(message);
  };

  const tabs = [
    { id: 'overview' as TabType, label: 'Genel Bakış', icon: BarChart3 },
    { id: 'exams' as TabType, label: 'Deneme Takibi', icon: ClipboardList },
    { id: 'reports' as TabType, label: 'Rapor Oluştur', icon: FileText },
    { id: 'send' as TabType, label: 'WhatsApp Gönder', icon: MessageCircle }
  ];

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Eğitim Koçu Raporları</h1>
          <p className="text-slate-500">Öğrenci deneme takibi ve raporlama</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setReportType('student'); setShowReportModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Rapor Oluştur
          </button>
          <a
            href={`https://wa.me/?text=${generateWhatsAppMessage()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </a>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-500">Öğrenci</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{overallStats.studentCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="w-5 h-5 text-orange-600" />
            <span className="text-sm text-gray-500">Deneme</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{overallStats.totalExams}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-500">TYT ort.</span>
          </div>
          <p className="text-3xl font-bold text-blue-600">{overallStats.tytAvg}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-purple-600" />
            <span className="text-sm text-gray-500">AYT ort.</span>
          </div>
          <p className="text-3xl font-bold text-purple-600">{overallStats.aytAvg}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">Son Net</span>
          </div>
          <p className="text-3xl font-bold text-slate-800">{overallStats.latestResult}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Genel Bakış */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Öğrenci Seçin</label>
                  <select
                    value={selectedStudent}
                    onChange={(e) => setSelectedStudent(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Tüm Öğrenciler</option>
                    {myStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Performans Grafiği */}
              {performanceChartData && (
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Performans Trendi</h3>
                  <div className="h-72">
                    <Line
                      data={performanceChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom' } },
                        scales: { y: { beginAtZero: true } }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Ders Dağılımı */}
              {subjectChartData && (
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Ders Bazlı Net Dağılımı</h3>
                  <div className="h-72">
                    <Doughnut
                      data={subjectChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'right' } }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deneme Takibi */}
          {activeTab === 'exams' && (
            <div className="space-y-6">
              {/* Filtreler */}
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Öğrenci ara..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Tüm Öğrenciler</option>
                  {myStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Deneme Listesi */}
              <div className="space-y-4">
                {selectedStudentResults.length === 0 ? (
                  <div className="text-center py-12">
                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Henüz deneme sonucu bulunamadı.</p>
                  </div>
                ) : (
                  selectedStudentResults.map(result => {
                    const student = students.find(s => s.id === result.studentId);
                    const prevResult = selectedStudentResults.find(r =>
                      new Date(r.examDate) < new Date(result.examDate)
                    );
                    const netChange = prevResult ? result.totalNet - prevResult.totalNet : 0;

                    return (
                      <div key={result.id} className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                result.examType === 'TYT' ? 'bg-blue-100 text-blue-700' :
                                result.examType === 'AYT' ? 'bg-purple-100 text-purple-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {result.examType}
                              </span>
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {new Date(result.examDate).toLocaleDateString('tr-TR')}
                              </span>
                            </div>
                            <p className="font-medium text-slate-800">{student?.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-blue-600">{result.totalNet} net</p>
                            {netChange !== 0 && (
                              <span className={`flex items-center justify-end gap-1 text-sm ${
                                netChange >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {netChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                {netChange >= 0 ? '+' : ''}{netChange}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Ders Bazlı Sonuçlar */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {result.subjects.map((subject, i) => (
                            <div key={i} className="bg-white rounded-lg p-3 text-sm">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-gray-600">{subject.name}</span>
                                <span className={`font-semibold ${
                                  subject.net >= 5 ? 'text-green-600' :
                                  subject.net >= 3 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {subject.net}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="text-green-600">D:{subject.correct}</span>
                                <span className="text-red-600">Y:{subject.wrong}</span>
                                <span>B:{subject.blank}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Rapor Oluştur */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                <div className="flex items-center gap-4">
                  <FileText className="w-12 h-12" />
                  <div>
                    <h3 className="text-xl font-bold">PDF Rapor Oluştur</h3>
                    <p className="text-blue-100">Seçili öğrencinin veya tüm öğrencilerin deneme raporunu indirin</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">Rapor Seçenekleri</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Öğrenci Seçin</label>
                      <select
                        value={selectedStudent}
                        onChange={(e) => setSelectedStudent(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Tüm Öğrenciler</option>
                        {myStudents.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-white rounded-lg p-4">
                      <h4 className="font-medium text-slate-800 mb-2">Rapor İçeriği</h4>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          Öğrenci bilgileri
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          Tüm deneme sonuçları
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          Ders bazlı net dağılımı
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          İstatistikler ve trendler
                        </li>
                      </ul>
                    </div>
                  </div>

                  <button
                    onClick={generatePDF}
                    className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Printer className="w-5 h-5" />
                    PDF İndir
                  </button>
                </div>

                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">Önizleme</h3>
                  <div className="bg-white rounded-lg p-4 border-2 border-dashed border-gray-300">
                    <div className="text-center">
                      <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">
                        {selectedStudent
                          ? `${students.find(s => s.id === selectedStudent)?.name} için rapor`
                          : 'Tüm öğrenciler için rapor'
                        }
                      </p>
                      <p className="text-sm text-gray-400 mt-2">
                        {selectedStudentResults.length} deneme sonucu
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp Gönder */}
          {activeTab === 'send' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
                <div className="flex items-center gap-4">
                  <MessageCircle className="w-12 h-12" />
                  <div>
                    <h3 className="text-xl font-bold">WhatsApp ile Gönder</h3>
                    <p className="text-green-100">Raporu veli veya öğrenci ile anında paylaşın</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">Alıcı Seçin</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Öğrenci Seçin</label>
                    <select
                      value={selectedStudent}
                      onChange={(e) => setSelectedStudent(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Tüm Öğrenciler</option>
                      {myStudents.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-6 bg-white rounded-lg p-4">
                    <h4 className="font-medium text-slate-800 mb-2">Mesaj İçeriği</h4>
                    <div className="text-sm text-gray-600 space-y-2">
                      <p>• Deneme sınavı sonuçları</p>
                      <p>• Ders bazlı performans</p>
                      <p>• Koç yorumu</p>
                      <p>• Tarih ve istatistikler</p>
                    </div>
                  </div>

                  <a
                    href={`https://wa.me/?text=${generateWhatsAppMessage()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-5 h-5" />
                    WhatsApp'ta Aç
                  </a>
                </div>

                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="font-semibold text-slate-800 mb-4">Mesaj Önizleme</h3>
                  <div className="bg-green-50 rounded-lg p-4">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                      {decodeURIComponent(generateWhatsAppMessage())}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Öğrenci Listesi */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Öğrencilerimin Sonuçları</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Öğrenci</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Deneme</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Son Net</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600"> Değişim</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Ortalama</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">En İyi</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {myStudents.map(student => {
                const stats = getStudentExamStats(student.id);
                return (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{student.name}</p>
                          <p className="text-xs text-gray-500">{student.classLevel}. Sınıf</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">{stats?.examCount || 0}</td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{stats?.latestNet || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {stats?.netChange !== undefined && stats.netChange !== 0 ? (
                        <span className={`flex items-center justify-center gap-1 text-sm ${
                          stats.netChange >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {stats.netChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          {stats.netChange >= 0 ? '+' : ''}{stats.netChange}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">{stats?.avgNet || '-'}</td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-green-600">{stats?.bestNet || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => { setSelectedStudent(student.id); setActiveTab('reports'); }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Rapor Oluştur"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
