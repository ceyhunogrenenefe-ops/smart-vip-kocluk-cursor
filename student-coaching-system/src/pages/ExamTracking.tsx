// Türkçe: Deneme Sınavları Takip Sayfası - AI Koç entegrasyonu
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  ClipboardList,
  Plus,
  Search,
  Filter,
  Calendar,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  BarChart3,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  Clock,
  User,
  BookOpen,
  Edit2,
  Trash2,
  Download,
  RefreshCw,
  Brain,
  Share2,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  FileUp,
  File,
  CheckCircle as CheckCircle2,
  AlertTriangle,
  Info,
  Upload
} from 'lucide-react';

// PDF.js değişkenleri
let pdfjsLib: any = null;
let pdfjsLoaded = false;

// PDF.js'i CDN'den yükle
const loadPdfJs = async () => {
  if (pdfjsLoaded && pdfjsLib) return pdfjsLib;

  return new Promise((resolve, reject) => {
    const workerScript = document.createElement('script');
    workerScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    workerScript.onload = () => {
      const pdfjsScript = document.createElement('script');
      pdfjsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      pdfjsScript.onload = () => {
        pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerScript.src;
        pdfjsLoaded = true;
        resolve(pdfjsLib);
      };
      pdfjsScript.onerror = reject;
      document.head.appendChild(pdfjsScript);
    };
    workerScript.onerror = reject;
    document.head.appendChild(workerScript);
  });
};

interface ExamResult {
  id: string;
  studentId: string;
  examType: 'TYT' | 'AYT' | '9' | '10' | '11' | '12';
  examDate: string;
  source: 'webhook' | 'manual';
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

export default function ExamTracking() {
  const { students, examResults, addExamResult, deleteExamResult } = useApp();
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [examTypeFilter, setExamTypeFilter] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);

  // PDF Import states
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [pdfParsedResults, setPdfParsedResults] = useState<any[]>([]);
  const [pdfErrors, setPdfErrors] = useState<string[]>([]);
  const [selectedPdfResults, setSelectedPdfResults] = useState<string[]>([]);
  const [pdfStudentMap, setPdfStudentMap] = useState<Record<number, string>>({});

  // PDF Metin Ayrıştırma - TYT/AYT formatına uygun
  const parsePdfText = (text: string): any => {
    // Türkçe karakter normalizasyonu
    const normalized = text
      .replace(/İ/g, 'I').replace(/ı/g, 'i')
      .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
      .replace(/Ü/g, 'U').replace(/ü/g, 'u')
      .replace(/Ş/g, 'S').replace(/ş/g, 's')
      .replace(/Ö/g, 'O').replace(/ö/g, 'o')
      .replace(/Ç/g, 'C').replace(/ç/g, 'c');

    // Öğrenci adı çıkarma
    let studentName = '';
    const namePatterns = [
      /OGRENCI[:\s]+([A-ZİĞÜŞÖÇ\s]+?)(?=\s*(SINIF|DOGUM|D\.O\/B|TARIH|DATE|$))/i,
      /AD[:\s]+([A-ZİĞÜŞÖÇ\s]+?)(?=\s*(SOYAD|$))/i,
      /NAME[:\s]+([A-ZİĞÜŞÖÇ\s]+)/i,
      /ADI[:\s]+([A-ZİĞÜŞÖÇ\s]+)/i,
    ];
    for (const pattern of namePatterns) {
      const match = normalized.match(pattern);
      if (match) {
        studentName = match[1].trim();
        break;
      }
    }

    // Sınav tarihi çıkarma
    let examDate = '';
    const datePatterns = [
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/,
      /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,
      /(\d{1,2})\s+(OCAK|SUBAT|MART|NISAN|MAYIS|HAZIRAN|TEMMUZ|AGUSTOS|EYLUL|EKIM|KASIM|ARALIK)\s+(\d{4})/i,
    ];
    for (const pattern of datePatterns) {
      const match = normalized.match(pattern);
      if (match) {
        if (match[3].length === 4) {
          examDate = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        } else {
          examDate = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
        }
        break;
      }
    }

    // Sınav türü belirleme
    let examType = 'TYT';
    if (/AYT|SAY|EA/i.test(normalized)) {
      examType = 'AYT';
    } else if (/TYT|TEMEL|YKS/i.test(normalized)) {
      examType = 'TYT';
    }

    // Ders sonuçlarını çıkarma - Geliştirilmiş regex
    const subjects: { name: string; correct: number; wrong: number; blank: number; net: number }[] = [];

    // TYT Dersleri için kalıplar
    const tytSubjects = [
      { name: 'Turkce', patterns: [/TURKCE[:\s]*D\s*(\d+)\s*Y\s*(\d+)\s*B\s*(\d+)/i, /TURKCE[:\s]*(\d+)\/(\d+)\/(\d+)/] },
      { name: 'Matematik', patterns: [/MATEMATIK[:\s]*D\s*(\d+)\s*Y\s*(\d+)\s*B\s*(\d+)/i, /MAT[:\s]*(\d+)\/(\d+)\/(\d+)/] },
      { name: 'Sosyal', patterns: [/SOSYAL[:\s]*D\s*(\d+)\s*Y\s*(\d+)\s*B\s*(\d+)/i, /TARIH[:\s]*(\d+)\/(\d+)\/(\d+)/] },
      { name: 'Fen', patterns: [/FEN[:\s]*D\s*(\d+)\s*Y\s*(\d+)\s*B\s*(\d+)/i, /BIYOLOJI[:\s]*(\d+)\/(\d+)\/(\d+)/] },
    ];

    // AYT Dersleri için kalıplar
    const aytSubjects = [
      { name: 'Matematik', patterns: [/MATEMATIK[:\s]*D\s*(\d+)\s*Y\s*(\d+)\s*B\s*(\d+)/i, /MAT[:\s]*(\d+)\/(\d+)\/(\d+)/] },
      { name: 'Fizik', patterns: [/FIZIK[:\s]*D\s*(\d+)\s*Y\s*(\d+)\s*B\s*(\d+)/i, /FIZ[:\s]*(\d+)\/(\d+)\/(\d+)/] },
      { name: 'Kimya', patterns: [/KIMYA[:\s]*D\s*(\d+)\s*Y\s*(\d+)\s*B\s*(\d+)/i, /KIM[:\s]*(\d+)\/(\d+)\/(\d+)/] },
      { name: 'Biyoloji', patterns: [/BIYOLOJI[:\s]*D\s*(\d+)\s*Y\s*(\d+)\s*B\s*(\d+)/i, /BIY[:\s]*(\d+)\/(\d+)\/(\d+)/] },
    ];

    const subjectsToCheck = examType === 'AYT' ? aytSubjects : tytSubjects;

    for (const subject of subjectsToCheck) {
      for (const pattern of subject.patterns) {
        const match = normalized.match(pattern);
        if (match) {
          const correct = parseInt(match[1]) || 0;
          const wrong = parseInt(match[2]) || 0;
          const blank = parseInt(match[3]) || 0;
          // Net hesaplama: Doğru - (Yanlış * 0.25)
          const net = correct - (wrong * 0.25);
          subjects.push({ name: subject.name, correct, wrong, blank, net });
          break;
        }
      }
    }

    // Eğer belirli kalıplarla bulamadıysak, genel sayısal blokları dene
    if (subjects.length === 0) {
      // Sayısal blokları bul (D:Doğru Y:Yanlış B:Boş formatı)
      const numberBlocks = normalized.match(/([A-ZİĞÜŞÖÇ\s]+?)[:\s]*(\d+)[\/\s]+(\d+)[\/\s]+(\d+)/g);
      if (numberBlocks) {
        for (const block of numberBlocks) {
          const blockMatch = block.match(/([A-ZİĞÜŞÖÇ\s]+?)[:\s]*(\d+)[\/\s]+(\d+)[\/\s]+(\d+)/);
          if (blockMatch) {
            const name = blockMatch[1].trim();
            const correct = parseInt(blockMatch[2]) || 0;
            const wrong = parseInt(blockMatch[3]) || 0;
            const blank = parseInt(blockMatch[4]) || 0;
            const net = correct - (wrong * 0.25);

            // Ders adını normalize et
            let normalizedName = name;
            if (/turk|dil/i.test(name)) normalizedName = 'Turkce';
            else if (/mat|geo|analiz/i.test(name)) normalizedName = 'Matematik';
            else if (/sos|tari|psik|felsef|cog/i.test(name)) normalizedName = 'Sosyal';
            else if (/fen|fiz|kim|biy/i.test(name)) normalizedName = 'Fen';

            if (correct > 0 || wrong > 0 || blank > 0) {
              subjects.push({ name: normalizedName, correct, wrong, blank, net });
            }
          }
        }
      }
    }

    // Toplam net hesaplama
    const totalNet = subjects.reduce((sum, s) => sum + s.net, 0);

    return {
      studentName,
      examDate,
      examType,
      subjects,
      totalNet,
      rawText: text.substring(0, 1000)
    };
  };

  // PDF Dosyasını İşle
  const processPdfFile = async (file: File): Promise<any> => {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return parsePdfText(fullText);
  };

  // PDF Dosya Seçimi
  const handlePdfFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setUploadedFiles(prev => [...prev, ...newFiles]);
      setPdfErrors(prev => [...prev, ...new Array(newFiles.length).fill('')]);
    }
    e.target.value = '';
  };

  // PDF Dosyasını Kaldır
  const removePdfFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setPdfParsedResults(prev => prev.filter((_, i) => i !== index));
    setPdfErrors(prev => prev.filter((_, i) => i !== index));
    setSelectedPdfResults(prev => prev.filter(i => i !== String(index)));
    setPdfStudentMap(prev => {
      const newMap = { ...prev };
      delete newMap[index];
      return newMap;
    });
  };

  // Tüm PDF'leri İşle
  const processAllPdfs = async () => {
    if (uploadedFiles.length === 0) return;

    setPdfLoading(true);
    const results: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      try {
        const result = await processPdfFile(uploadedFiles[i]);
        results[i] = result;
        errors[i] = '';
      } catch (err) {
        errors[i] = `Dosya işlenemedi: ${uploadedFiles[i].name}`;
        results[i] = null;
      }
    }

    setPdfParsedResults(results);
    setPdfErrors(errors);
    setPdfLoading(false);

    // İşlenen sonuçları seçili yap
    const selectedIndices = results
      .map((r, i) => r ? String(i) : null)
      .filter(Boolean);
    setSelectedPdfResults(selectedIndices as string[]);
  };

  // Seçili PDF Sonuçlarını İçe Aktar
  const importSelectedPdfResults = () => {
    const selectedStudents = Object.entries(pdfStudentMap)
      .filter(([_, studentId]) => studentId)
      .map(([index, studentId]) => ({ index: parseInt(index), studentId }));

    if (selectedStudents.length === 0) {
      alert('Lütfen en az bir sonuç için öğrenci seçin!');
      return;
    }

    let importedCount = 0;
    for (const { index, studentId } of selectedStudents) {
      const result = pdfParsedResults[index];
      if (result) {
        const newExam = {
          id: `pdf-${Date.now()}-${index}`,
          studentId,
          examType: result.examType || 'TYT',
          examDate: result.examDate || new Date().toISOString().split('T')[0],
          source: 'manual' as const,
          totalNet: result.totalNet || 0,
          subjects: result.subjects || [],
          createdAt: new Date().toISOString()
        };
        addExamResult(newExam);
        importedCount++;
      }
    }

    alert(`${importedCount} deneme sonucu başarıyla içe aktarıldı!`);

    // Temizle
    setUploadedFiles([]);
    setPdfParsedResults([]);
    setPdfErrors([]);
    setSelectedPdfResults([]);
    setPdfStudentMap({});
  };

  // PDF Sonuç Seçimini Değiştir
  const togglePdfResult = (index: number) => {
    setSelectedPdfResults(prev =>
      prev.includes(String(index))
        ? prev.filter(i => i !== String(index))
        : [...prev, String(index)]
    );
  };

  // PDF İçe Aktarma Modalını Kapat
  const closePdfImport = () => {
    setShowPdfImport(false);
    setUploadedFiles([]);
    setPdfParsedResults([]);
    setPdfErrors([]);
    setSelectedPdfResults([]);
    setPdfStudentMap({});
  };

  // Varsayılan mock veriler
  const defaultExamResults: ExamResult[] = [
    {
      id: '1',
      studentId: '1',
      examType: 'TYT',
      examDate: '2024-01-15',
      source: 'webhook',
      totalNet: 28.5,
      subjects: [
        { name: 'Türkçe', net: 8.75, correct: 9, wrong: 0, blank: 1 },
        { name: 'Matematik', net: 7.25, correct: 8, wrong: 1, blank: 1 },
        { name: 'Sosyal', net: 6.0, correct: 6, wrong: 2, blank: 2 },
        { name: 'Fen', net: 6.5, correct: 7, wrong: 1, blank: 2 }
      ],
      createdAt: '2024-01-15T14:30:00Z'
    },
    {
      id: '2',
      studentId: '1',
      examType: 'TYT',
      examDate: '2024-01-08',
      source: 'manual',
      totalNet: 25.0,
      subjects: [
        { name: 'Türkçe', net: 7.0, correct: 7, wrong: 2, blank: 1 },
        { name: 'Matematik', net: 6.5, correct: 7, wrong: 2, blank: 1 },
        { name: 'Sosyal', net: 5.5, correct: 6, wrong: 3, blank: 1 },
        { name: 'Fen', net: 6.0, correct: 6, wrong: 2, blank: 2 }
      ],
      createdAt: '2024-01-08T10:00:00Z'
    },
    {
      id: '3',
      studentId: '2',
      examType: 'AYT',
      examDate: '2024-01-14',
      source: 'webhook',
      totalNet: 45.0,
      subjects: [
        { name: 'Matematik', net: 15.0, correct: 15, wrong: 2, blank: 3 },
        { name: 'Fizik', net: 10.0, correct: 10, wrong: 1, blank: 4 },
        { name: 'Kimya', net: 10.0, correct: 10, wrong: 0, blank: 5 },
        { name: 'Biyoloji', net: 10.0, correct: 10, wrong: 0, blank: 5 }
      ],
      createdAt: '2024-01-14T16:00:00Z'
    }
  ];

  // AppContext'ten gelen examResults veya varsayılan veriler
  const allExamResults = useMemo(() => {
    return examResults.length > 0 ? examResults : defaultExamResults;
  }, [examResults]);

  // PDF'den eklenenleri göstermek için kaynak etiketi
  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'webhook': return 'Webhook';
      case 'manual': return 'Manuel';
      case 'pdf': return 'PDF İçe Aktar';
      default: return source;
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'webhook': return 'bg-green-100 text-green-700';
      case 'manual': return 'bg-orange-100 text-orange-700';
      case 'pdf': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const [newExam, setNewExam] = useState<Partial<ExamResult>>({
    studentId: '',
    examType: 'TYT',
    examDate: new Date().toISOString().split('T')[0],
    subjects: [
      { name: 'Türkçe', net: 0, correct: 0, wrong: 0, blank: 0 },
      { name: 'Matematik', net: 0, correct: 0, wrong: 0, blank: 0 }
    ]
  });

  // Filtreleme
  const filteredResults = useMemo(() => {
    return allExamResults.filter(result => {
      const student = students.find(s => s.id === result.studentId);
      const matchesStudent = !selectedStudent || result.studentId === selectedStudent;
      const matchesType = examTypeFilter === 'all' || result.examType === examTypeFilter;
      const matchesSearch = !searchTerm ||
        student?.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStudent && matchesType && matchesSearch;
    }).sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  }, [allExamResults, selectedStudent, examTypeFilter, searchTerm, students]);

  // Öğrenci bazlı sonuçları grupla
  const getStudentResults = (studentId: string) => {
    return allExamResults
      .filter(r => r.studentId === studentId)
      .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  };

  // İstatistikler
  const getStats = (studentId: string) => {
    const results = getStudentResults(studentId);
    if (results.length === 0) return null;

    const latest = results[0];
    const previous = results[1];
    const avgNet = results.reduce((sum, r) => sum + r.totalNet, 0) / results.length;

    const netChange = previous ? latest.totalNet - previous.totalNet : 0;

    return {
      latestNet: latest.totalNet,
      netChange,
      avgNet: Math.round(avgNet * 10) / 10,
      examCount: results.length,
      bestNet: Math.max(...results.map(r => r.totalNet))
    };
  };

  // Toplam istatistikler
  const getTotalStats = () => {
    const tytResults = allExamResults.filter(r => r.examType === 'TYT');
    const aytResults = allExamResults.filter(r => r.examType === 'AYT');

    return {
      totalExams: allExamResults.length,
      tytAvg: tytResults.length > 0
        ? Math.round(tytResults.reduce((sum, r) => sum + r.totalNet, 0) / tytResults.length * 10) / 10
        : 0,
      aytAvg: aytResults.length > 0
        ? Math.round(aytResults.reduce((sum, r) => sum + r.totalNet, 0) / aytResults.length * 10) / 10
        : 0,
      webhookCount: allExamResults.filter(r => r.source === 'webhook').length,
      manualCount: allExamResults.filter(r => r.source === 'manual').length,
      pdfCount: allExamResults.filter(r => r.source === 'pdf').length
    };
  };

  // Deneme ekle
  const addExam = () => {
    if (!newExam.studentId || !newExam.examDate) {
      alert('Öğrenci ve tarih seçimi zorunludur.');
      return;
    }

    const totalNet = (newExam.subjects || []).reduce((sum, s) => sum + (s.net || 0), 0);

    const exam: ExamResult = {
      id: Date.now().toString(),
      studentId: newExam.studentId,
      examType: newExam.examType as 'TYT' | 'AYT' | '9' | '10' | '11' | '12',
      examDate: newExam.examDate,
      source: 'manual',
      totalNet,
      subjects: newExam.subjects || [],
      createdAt: new Date().toISOString()
    };

    addExamResult(exam);
    setShowAddForm(false);
    setNewExam({
      studentId: '',
      examType: 'TYT',
      examDate: new Date().toISOString().split('T')[0],
      subjects: [
        { name: 'Türkçe', net: 0, correct: 0, wrong: 0, blank: 0 },
        { name: 'Matematik', net: 0, correct: 0, wrong: 0, blank: 0 }
      ]
    });
  };

  // Deneme sil
  const deleteExam = (id: string) => {
    if (confirm('Bu deneme sonucunu silmek istediğinizden emin misiniz?')) {
      deleteExamResult(id);
    }
  };

  // AI Koç'a gönder
  const sendToAICoach = (studentId: string) => {
    window.location.href = `/ai-coach?student=${studentId}`;
  };


  const totalStats = getTotalStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Deneme Sınavları</h2>
            <p className="text-orange-100">TYT, AYT ve sınıf denemelerinin takibi</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
              {totalStats.totalExams} Deneme
            </span>
          </div>
        </div>
      </div>

      {/* Toplam İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <ClipboardList className="w-4 h-4" />
            <span className="text-sm">Toplam Deneme</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{totalStats.totalExams}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-blue-500 mb-2">
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm">TYT Ort.</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{totalStats.tytAvg} net</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-purple-500 mb-2">
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm">AYT Ort.</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{totalStats.aytAvg} net</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-green-500 mb-2">
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm">Webhook</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{totalStats.webhookCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-orange-500 mb-2">
            <Edit2 className="w-4 h-4" />
            <span className="text-sm">Manuel</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{totalStats.manualCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol Panel - Filtreler */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtreler
            </h3>

            {/* Arama */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Öğrenci ara..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Öğrenci Seçimi */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Öğrenci</label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Tüm Öğrenciler</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Sınav Tipi */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Sınav Türü</label>
              <div className="flex flex-wrap gap-2">
                {['all', 'TYT', 'AYT', '9', '10', '11'].map(type => (
                  <button
                    key={type}
                    onClick={() => setExamTypeFilter(type)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      examTypeFilter === type
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {type === 'all' ? 'Tümü' : type + '. Sınıf'}
                  </button>
                ))}
              </div>
            </div>

            {/* Yeni Deneme Ekle */}
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Manuel Deneme Ekle
            </button>

            {/* PDF'den İçe Aktar */}
            <button
              onClick={() => setShowPdfImport(true)}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 mt-3"
            >
              <FileUp className="w-5 h-5" />
              PDF'den İçe Aktar
            </button>
          </div>

          {/* Seçili Öğrenci İstatistikleri */}
          {selectedStudent && getStats(selectedStudent) && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Award className="w-5 h-5 text-orange-500" />
                  {students.find(s => s.id === selectedStudent)?.name}
                </h3>
                <button
                  onClick={() => sendToAICoach(selectedStudent)}
                  className="px-3 py-1 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200 transition-colors text-sm flex items-center gap-1"
                >
                  <Brain className="w-4 h-4" />
                  AI Analiz
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                  <span className="text-gray-600">Son Net</span>
                  <span className="text-xl font-bold text-orange-600">
                    {getStats(selectedStudent)?.latestNet}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Değişim</span>
                  <span className={`flex items-center gap-1 font-semibold ${
                    (getStats(selectedStudent)?.netChange || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {(getStats(selectedStudent)?.netChange || 0) >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {getStats(selectedStudent)?.netChange >= 0 ? '+' : ''}
                    {getStats(selectedStudent)?.netChange}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Ortalama</span>
                  <span className="font-semibold text-slate-800">
                    {getStats(selectedStudent)?.avgNet}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">En İyi</span>
                  <span className="font-semibold text-green-600">
                    {getStats(selectedStudent)?.bestNet}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sağ Panel - Sonuçlar */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-semibold text-slate-800">Deneme Sonuçları ({filteredResults.length})</h3>
            </div>

            <div className="divide-y divide-gray-100">
              {filteredResults.length === 0 ? (
                <div className="p-12 text-center">
                  <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Henüz deneme sonucu bulunamadı</p>
                </div>
              ) : (
                filteredResults.map(result => {
                  const student = students.find(s => s.id === result.studentId);
                  const isExpanded = expandedExam === result.id;

                  return (
                    <div key={result.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              result.examType === 'TYT' ? 'bg-blue-100 text-blue-700' :
                              result.examType === 'AYT' ? 'bg-purple-100 text-purple-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {result.examType}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSourceColor(result.source)}`}>
                              {getSourceLabel(result.source)}
                            </span>
                            <span className="text-sm text-gray-500 flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(result.examDate).toLocaleDateString('tr-TR')}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 mb-3">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="font-medium text-slate-800">{student?.name}</span>
                            </div>
                            <div className="text-xl font-bold text-orange-600">
                              {result.totalNet} net
                            </div>
                            <button
                              onClick={() => setExpandedExam(isExpanded ? null : result.id)}
                              className="ml-auto text-gray-400 hover:text-gray-600"
                            >
                              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          </div>

                          {/* Ders Bazlı Sonuçlar (Genişletilmiş) */}
                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {result.subjects.map((subject, i) => (
                                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-gray-600 font-medium">{subject.name}</span>
                                      <span className={`font-bold ${
                                        subject.net >= 8 ? 'text-green-600' :
                                        subject.net >= 5 ? 'text-yellow-600' : 'text-red-600'
                                      }`}>
                                        {subject.net} net
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 flex gap-2">
                                      <span className="text-green-600">✓{subject.correct}</span>
                                      <span className="text-red-600">✗{subject.wrong}</span>
                                      <span className="text-gray-400">—{subject.blank}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Eylemler */}
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => sendToAICoach(result.studentId)}
                                  className="px-3 py-1.5 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200 transition-colors text-sm flex items-center gap-1"
                                >
                                  <Brain className="w-4 h-4" />
                                  AI Analiz Et
                                </button>
                                <button className="px-3 py-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors text-sm flex items-center gap-1">
                                  <Share2 className="w-4 h-4" />
                                  Paylaş
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Özet (Daraltılmış) */}
                          {!isExpanded && (
                            <div className="grid grid-cols-4 gap-2 text-xs text-gray-500">
                              {result.subjects.slice(0, 4).map((subject, i) => (
                                <div key={i} className={`p-1.5 rounded ${
                                  subject.net >= 8 ? 'bg-green-100 text-green-700' :
                                  subject.net >= 5 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {subject.name}: {subject.net}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => deleteExam(result.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Yeni Deneme Formu (Modal) */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-800">Manuel Deneme Ekle</h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Öğrenci *</label>
                  <select
                    value={newExam.studentId}
                    onChange={(e) => setNewExam({ ...newExam, studentId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Seçin</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sınav Türü *</label>
                  <select
                    value={newExam.examType}
                    onChange={(e) => setNewExam({ ...newExam, examType: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="TYT">TYT</option>
                    <option value="AYT">AYT</option>
                    <option value="9">9. Sınıf</option>
                    <option value="10">10. Sınıf</option>
                    <option value="11">11. Sınıf</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sınav Tarihi *</label>
                <input
                  type="date"
                  value={newExam.examDate}
                  onChange={(e) => setNewExam({ ...newExam, examDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Ders Sonuçları */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ders Sonuçları</label>
                <div className="space-y-3">
                  {(newExam.subjects || []).map((subject, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2 items-center">
                      <input
                        type="text"
                        value={subject.name}
                        onChange={(e) => {
                          const newSubjects = [...(newExam.subjects || [])];
                          newSubjects[i] = { ...newSubjects[i], name: e.target.value };
                          setNewExam({ ...newExam, subjects: newSubjects });
                        }}
                        placeholder="Ders"
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="number"
                        value={subject.correct}
                        onChange={(e) => {
                          const newSubjects = [...(newExam.subjects || [])];
                          newSubjects[i] = { ...newSubjects[i], correct: parseInt(e.target.value) || 0 };
                          newSubjects[i].net = newSubjects[i].correct - (newSubjects[i].wrong * 0.25);
                          setNewExam({ ...newExam, subjects: newSubjects });
                        }}
                        placeholder="Doğru"
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="number"
                        value={subject.wrong}
                        onChange={(e) => {
                          const newSubjects = [...(newExam.subjects || [])];
                          newSubjects[i] = { ...newSubjects[i], wrong: parseInt(e.target.value) || 0 };
                          newSubjects[i].net = newSubjects[i].correct - (newSubjects[i].wrong * 0.25);
                          setNewExam({ ...newExam, subjects: newSubjects });
                        }}
                        placeholder="Yanlış"
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="number"
                        value={subject.blank}
                        onChange={(e) => {
                          const newSubjects = [...(newExam.subjects || [])];
                          newSubjects[i] = { ...newSubjects[i], blank: parseInt(e.target.value) || 0 };
                          setNewExam({ ...newExam, subjects: newSubjects });
                        }}
                        placeholder="Boş"
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <span className="text-center font-semibold text-green-600">
                        {subject.net?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setNewExam({
                    ...newExam,
                    subjects: [...(newExam.subjects || []), { name: '', net: 0, correct: 0, wrong: 0, blank: 0 }]
                  })}
                  className="mt-2 px-3 py-1 text-sm text-orange-600 hover:bg-orange-50 rounded-lg flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Ders Ekle
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                İptal
              </button>
              <button
                onClick={addExam}
                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:opacity-90 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF İçe Aktarma Modalı */}
      {showPdfImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-800">PDF'den Deneme Sonuçları İçe Aktar</h3>
                  <p className="text-sm text-gray-500">TYT/AYT deneme sonuçlarını içeren PDF'leri yükleyin</p>
                </div>
              </div>
              <button
                onClick={closePdfImport}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Dosya Yükleme Alanı */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
                <input
                  type="file"
                  id="pdf-upload"
                  accept=".pdf"
                  multiple
                  onChange={handlePdfFileSelect}
                  className="hidden"
                />
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">PDF dosyası yüklemek için tıklayın</p>
                  <p className="text-sm text-gray-400 mt-1">veya dosyaları buraya sürükleyin</p>
                  <p className="text-xs text-gray-400 mt-2">Desteklenen format: PDF</p>
                </label>
              </div>

              {/* Yüklenen Dosyalar */}
              {uploadedFiles.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <File className="w-4 h-4" />
                    Yüklenen Dosyalar ({uploadedFiles.length})
                  </h4>
                  <div className="space-y-2 mb-4">
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                        <div className="flex items-center gap-3">
                          <File className="w-5 h-5 text-blue-500" />
                          <span className="text-sm text-gray-700">{file.name}</span>
                          <span className="text-xs text-gray-400">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {pdfParsedResults[index] ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : pdfErrors[index] ? (
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                          ) : (
                            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                          )}
                          <button
                            onClick={() => removePdfFile(index)}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {pdfLoading && (
                    <div className="flex items-center justify-center gap-2 text-blue-600 mb-4">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">PDF'ler işleniyor...</span>
                    </div>
                  )}

                  {!pdfLoading && pdfParsedResults.length === 0 && pdfErrors.length === 0 && uploadedFiles.length > 0 && (
                    <button
                      onClick={processAllPdfs}
                      className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2"
                    >
                      <Upload className="w-5 h-5" />
                      PDF'leri İşle
                    </button>
                  )}
                </div>
              )}

              {/* Hatalar */}
              {pdfErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    İşlenemeyen Dosyalar
                  </div>
                  <ul className="text-sm text-red-600 space-y-1">
                    {pdfErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ayrıştırılan Sonuçlar */}
              {pdfParsedResults.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-700 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      Ayrıştırılan Sonuçlar ({pdfParsedResults.length})
                    </h4>
                    <button
                      onClick={importSelectedPdfResults}
                      disabled={selectedPdfResults.length === 0 || students.length === 0}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                        selectedPdfResults.length > 0 && students.length > 0
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      Seçilenleri İçe Aktar ({selectedPdfResults.length})
                    </button>
                  </div>

                  {students.length === 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 text-yellow-700 text-sm">
                        <AlertTriangle className="w-5 h-5" />
                        Öğrenci bulunamadı. Lütfen önce Öğrenciler sayfasından öğrenci ekleyin.
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {pdfParsedResults.map((result, index) => (
                      <div key={index} className={`border rounded-xl p-4 ${
                        selectedPdfResults.includes(String(index))
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 bg-white'
                      }`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <input
                                type="checkbox"
                                checked={selectedPdfResults.includes(String(index))}
                                onChange={() => togglePdfResult(index)}
                                className="w-5 h-5 text-green-600 rounded border-gray-300 focus:ring-green-500"
                              />
                              <div>
                                <h5 className="font-semibold text-slate-800">
                                  {result.studentName || 'Öğrenci Adı Bulunamadı'}
                                </h5>
                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    result.examType === 'TYT' ? 'bg-blue-100 text-blue-700' :
                                    result.examType === 'AYT' ? 'bg-purple-100 text-purple-700' :
                                    'bg-green-100 text-green-700'
                                  }`}>
                                    {result.examType}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {result.examDate || 'Tarih Bulunamadı'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-orange-600">
                              {result.totalNet?.toFixed(2) || '0.00'} net
                            </div>
                          </div>
                        </div>

                        {/* Ders Sonuçları */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                          {result.subjects?.slice(0, 8).map((subject: any, subIndex: number) => (
                            <div key={subIndex} className="bg-white rounded-lg p-2 text-sm">
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600 font-medium truncate">{subject.name}</span>
                                <span className={`font-semibold ${
                                  subject.net >= 8 ? 'text-green-600' :
                                  subject.net >= 5 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {subject.net?.toFixed(2) || '0.00'}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400 flex gap-2 mt-1">
                                <span className="text-green-600">✓{subject.correct || 0}</span>
                                <span className="text-red-600">✗{subject.wrong || 0}</span>
                                <span>—{subject.blank || 0}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Öğrenci Eşleştirme */}
                        <div className="border-t pt-3 mt-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Bu sonuçları hangi öğrenciye eklemek istiyorsunuz?
                          </label>
                          <select
                            value={pdfStudentMap[index] || ''}
                            onChange={(e) => setPdfStudentMap(prev => ({ ...prev, [index]: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            <option value="">Öğrenci Seçin...</option>
                            {students.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Ham Veri (Debug için) */}
                        {result.rawText && (
                          <details className="mt-3">
                            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                              Ham veriyi görüntüle
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600 overflow-x-auto max-h-40">
                              {result.rawText?.substring(0, 500)}...
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Boş Durum */}
              {uploadedFiles.length === 0 && (
                <div className="text-center py-12">
                  <FileUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-700 mb-2">Henüz PDF Yüklenmedi</h4>
                  <p className="text-sm text-gray-500">
                    Deneme sonuçlarını içeren PDF dosyalarınızı yükleyerek başlayın
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end">
              <button
                onClick={closePdfImport}
                className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
