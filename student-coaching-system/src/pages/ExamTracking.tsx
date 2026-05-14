// Türkçe: Deneme Sınavları Takip Sayfası - AI Koç entegrasyonu
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { mergeYosMatematikGenelSubjects } from '../lib/mergeYosExamSubjects';
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
  examType: '3' | '4' | '5' | '6' | '7' | 'LGS' | 'YOS' | 'TYT' | 'YKS-EA' | 'YKS-SAY' | 'AYT';
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

type ExamType = ExamResult['examType'];

const EXAM_TYPE_OPTIONS: ExamType[] = ['3', '4', '5', '6', '7', 'LGS', 'YOS', 'TYT', 'YKS-EA', 'YKS-SAY'];

const SUBJECT_TEMPLATES: Record<ExamType, string[]> = {
  '3': ['Türkçe', 'Matematik', 'Hayat Bilgisi', 'İngilizce', 'Fen Bilimleri'],
  '4': ['Türkçe', 'Matematik', 'Sosyal Bilgiler', 'İngilizce', 'Fen Bilimleri'],
  '5': ['LGS-Türkçe', 'LGS-Sosyal Bilimler', 'LGS-Din Kültürü', 'LGS-İngilizce', 'LGS-Matematik', 'LGS-Fen Bilimleri'],
  '6': ['LGS-Türkçe', 'LGS-Sosyal Bilimler', 'LGS-Din Kültürü', 'LGS-İngilizce', 'LGS-Matematik', 'LGS-Fen Bilimleri'],
  '7': ['LGS-Türkçe', 'LGS-Sosyal Bilimler', 'LGS-Din Kültürü', 'LGS-İngilizce', 'LGS-Matematik', 'LGS-Fen Bilimleri'],
  LGS: ['LGS-Türkçe', 'LGS-İnkılap Tarihi', 'LGS-Din Kültürü', 'LGS-İngilizce', 'LGS-Matematik', 'LGS-Fen Bilimleri'],
  YOS: ['YÖS Matematik Genel', 'YÖS IQ'],
  TYT: [
    'TYT-Türkçe',
    'TYT-Sosyal Bilimler',
    'Tarih',
    'Coğrafya',
    'Felsefe',
    'Din Kültürü',
    'TYT-Matematik',
    'TYT-Fen Bilimleri',
    'Fizik',
    'Kimya',
    'Biyoloji',
  ],
  'YKS-EA': ['AYT-Edebiyat-Sosyal', 'AYT-Matematik'],
  'YKS-SAY': ['AYT-Matematik', 'AYT-Fen Bilimleri', 'Fizik', 'Kimya', 'Biyoloji'],
  AYT: ['AYT-Matematik', 'AYT-Fen Bilimleri'],
};

const normalizeText = (v: string) =>
  v
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c');

const getWrongPenalty = (examType?: ExamType) =>
  examType === '3' || examType === '4' || examType === '5' || examType === '6' || examType === '7' || examType === 'LGS'
    ? 1 / 3
    : 1 / 4;

const netFromCounts = (correct: number, wrong: number, examType?: ExamType) =>
  Math.round((correct - wrong * getWrongPenalty(examType)) * 100) / 100;

const hasStrongParsedData = (parsed: any) =>
  Boolean(parsed?.studentName && parsed?.subjects?.length && parsed?.totalNet > 0);

const normalizeSubjectName = (name: string) => {
  const n = normalizeText(name).replace(/\s+/g, ' ').trim();
  if (/\bMatematik\s+Genel\b/i.test(name)) return 'YÖS Matematik Genel';
  if (n.includes('LGS-DIN KULTURU')) return 'LGS-DIN KULTURU VE AHLAK BILGISI';
  if (n === 'DIN KULTURU') return 'LGS-DIN KULTURU VE AHLAK BILGISI';
  if (n.includes('YOS-SAYISAL YETENEK') || n === 'IQ') return 'YÖS IQ';
  if (n.includes('YOS-TEMEL MATEMATIK') || n.includes('YOS-TEMEL MATEMETIK')) return 'YÖS MATEMATİK';
  if (n === 'MATEMATIK') return 'YÖS MATEMATİK';
  if (n === 'GEOMETRI') return 'YÖS GEOMETRİ';
  return n;
};

const AUX_SUBJECTS_EXCLUDED_FROM_TOTAL = new Set([
  'TARIH',
  'COGRAFYA',
  'FELSEFE',
  'DIN KULTURU',
  'FIZIK',
  'KIMYA',
  'BIYOLOJI',
]);

const shouldExcludeFromTotalNet = (subjectName: string) =>
  AUX_SUBJECTS_EXCLUDED_FROM_TOTAL.has(normalizeText(subjectName));

const calculateTotalNetFromSubjects = (subjects: Array<{ name: string; net: number }>) =>
  Math.round(
    subjects.reduce((sum, s) => sum + (shouldExcludeFromTotalNet(s.name) ? 0 : Number(s.net || 0)), 0) * 100
  ) / 100;

const createDraftResult = (label: string) => ({
  studentName: label || 'Bilinmeyen Ogrenci',
  examDate: new Date().toISOString().split('T')[0],
  examType: 'TYT' as ExamType,
  subjects: [],
  totalNet: 0,
  extractionMethod: 'draft',
  parseError: 'Otomatik parse basarisiz. Koc manuel duzenleyebilir.',
  rawText: '',
});

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

  const buildTemplateSubjects = useCallback((examType: ExamType) => {
    const names = SUBJECT_TEMPLATES[examType] || [];
    return names.map((name) => ({ name, net: 0, correct: 0, wrong: 0, blank: 0 }));
  }, []);

  const isStudentCompatibleWithExam = useCallback((studentId: string, examType: ExamType) => {
    const st = students.find((s) => s.id === studentId);
    if (!st) return false;
    const lvl = st.classLevel;
    if (examType === '3' || examType === '4' || examType === '5' || examType === '6' || examType === '7') {
      return String(lvl) === examType;
    }
    if (examType === 'LGS') return String(lvl) === 'LGS' || String(lvl) === '8';
    if (examType === 'YOS') return String(lvl) === 'YOS';
    if (examType === 'TYT') return ['9', '10', '11', '12', 'YKS-Sayısal', 'YKS-Eşit Ağırlık', 'YKS-Sözel'].includes(String(lvl));
    if (examType === 'YKS-EA') return String(lvl) === 'YKS-Eşit Ağırlık' || String(lvl) === '12';
    if (examType === 'YKS-SAY' || examType === 'AYT') return String(lvl) === 'YKS-Sayısal' || String(lvl) === '12';
    return true;
  }, [students]);

  // PDF Metin Ayrıştırma - TYT/AYT formatına uygun
  const parsePdfText = (text: string): any => {
    const normalized = normalizeText(text);

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
      /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/,
      /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/,
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

    // Sınav türü belirleme (yeni sınıf/grup yapısı)
    let examType: ExamType = 'TYT';
    if (/LGS|LGS-/i.test(normalized)) {
      const classMatch = normalized.match(/SINIF[^\d]*(\d+)/i);
      const cls = classMatch?.[1];
      if (cls === '3' || cls === '4' || cls === '5' || cls === '6' || cls === '7') {
        examType = cls;
      } else {
        examType = 'LGS';
      }
    } else if (/YOS|YÖS/i.test(normalized)) {
      examType = 'YOS';
    } else if (/TYT/i.test(normalized)) {
      examType = 'TYT';
    } else if (/AYT/i.test(normalized) && /EDEBIYAT|EA/i.test(normalized)) {
      examType = 'YKS-EA';
    } else if (/AYT/i.test(normalized) && /FIZIK|KIMYA|BIYOLOJI|SAY/i.test(normalized)) {
      examType = 'YKS-SAY';
    } else if (/SAY/i.test(normalized)) {
      examType = 'YKS-SAY';
    } else if (/EA/i.test(normalized)) {
      examType = 'YKS-EA';
    }

    let subjects: { name: string; questions?: number; correct: number; wrong: number; blank: number; net: number }[] = [];
    const compact = normalized.replace(/\s+/g, ' ').trim();
    let declaredTotals: { questions: number; correct: number; wrong: number; blank: number; net: number } | null = null;

    const totalRow = compact.match(/TOPLAM\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+[.,]?\d*)/i);
    if (totalRow) {
      declaredTotals = {
        questions: parseInt(totalRow[1], 10) || 0,
        correct: parseInt(totalRow[2], 10) || 0,
        wrong: parseInt(totalRow[3], 10) || 0,
        blank: parseInt(totalRow[4], 10) || 0,
        net: parseFloat(totalRow[5].replace(',', '.')) || 0,
      };
    }

    // Global ders satırı yakalama: LGS/TYT/AYT ve alt kırılımlar
    const subjectRegex =
      /(LGS-[A-Z ÇĞİÖŞÜ]+(?: VE AHLAK BILGISI)?|TYT-[A-Z ÇĞİÖŞÜ]+|AYT-[A-Z ÇĞİÖŞÜ]+|YOS-[A-Z ÇĞİÖŞÜ]+|MATEMATIK|GEOMETRI|IQ|INKILAP TARIHI|SOSYAL BILIMLER(?:I)?|DIN KULTURU(?: VE AHLAK BILGISI)?|INGILIZCE|TARIH|COGRAFYA|FELSEFE|FIZIK|KIMYA|BIYOLOJI|EDEBIYAT)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?\s+(-?\d+[.,]?\d*)/gi;
    for (const match of compact.matchAll(subjectRegex)) {
      const subjectName = normalizeSubjectName(String(match[1] || '').trim());
      const questionCount = parseInt(String(match[2] || '0'), 10) || 0;
      const correct = parseInt(String(match[3] || '0'), 10) || 0;
      const wrong = parseInt(String(match[4] || '0'), 10) || 0;
      // Bazı PDF'lerde boş sütunu düşüyor; bu durumda doğru+yanlıştan hesapla
      const parsedBlank = parseInt(String(match[5] || '0'), 10) || 0;
      const blank = match[5] ? parsedBlank : Math.max(questionCount - correct - wrong, 0);
      if (!questionCount) continue;
      subjects.push({
        name: subjectName,
        questions: questionCount,
        correct,
        wrong,
        blank,
        net: netFromCounts(correct, wrong, examType),
      });
    }

    // LGS özel fallback: Din Kültürü gibi kaçan dersleri tekil desenle tamamla
    if (examType === 'LGS' || examType === '5' || examType === '6' || examType === '7') {
      const hasDin = subjects.some((s) => normalizeSubjectName(s.name).includes('LGS-DIN KULTURU VE AHLAK BILGISI'));
      if (!hasDin) {
        const dinMatch = compact.match(/LGS-DIN KULTURU(?: VE AHLAK BILGISI)?\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?\s+(-?\d+[.,]?\d*)/i);
        if (dinMatch) {
          const questionCount = parseInt(dinMatch[1], 10) || 0;
          const correct = parseInt(dinMatch[2], 10) || 0;
          const wrong = parseInt(dinMatch[3], 10) || 0;
          const blank = dinMatch[4] ? (parseInt(dinMatch[4], 10) || 0) : Math.max(questionCount - correct - wrong, 0);
          subjects.push({
            name: 'LGS-DIN KULTURU VE AHLAK BILGISI',
            questions: questionCount,
            correct,
            wrong,
            blank,
            net: netFromCounts(correct, wrong, examType),
          });
        }
      }
    }

    if (examType === 'YOS' && subjects.length > 0) {
      subjects = mergeYosMatematikGenelSubjects(examType, subjects, (c, w) =>
        netFromCounts(c, w, examType)
      );
    }

    // Toplam net hesaplama
    const totalNet = calculateTotalNetFromSubjects(subjects as Array<{ name: string; net: number }>);

    return {
      studentName,
      examDate,
      examType,
      subjects,
      totalNet,
      declaredTotals,
      rawText: text.substring(0, 1000)
    };
  };

  // PDF/Gorsel Dosyasını İşle
  const processPdfFile = async (file: File): Promise<any> => {
    // Fotoğraf yükleme: doğrudan OCR
    if (file.type.startsWith('image/')) {
      try {
        const tesseract = await import('tesseract.js');
        const imgDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const ocr = await tesseract.recognize(imgDataUrl, 'tur+eng');
        const parsed = parsePdfText(ocr.data.text || '');
        if (hasStrongParsedData(parsed)) {
          return {
            ...parsed,
            extractionMethod: 'ocr-image',
            ocrConfidence: typeof ocr.data?.confidence === 'number' ? Math.round(ocr.data.confidence) : null,
            rawText: String(ocr.data.text || '').substring(0, 3000),
          };
        }
        return {
          ...createDraftResult(file.name),
          extractionMethod: 'ocr-image',
          ocrConfidence: typeof ocr.data?.confidence === 'number' ? Math.round(ocr.data.confidence) : null,
          rawText: String(ocr.data.text || '').substring(0, 3000),
        };
      } catch {
        return createDraftResult(file.name);
      }
    }

    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    const pageCanvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';

      // OCR fallback için sayfa raster çıktısı da hazırla
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;
        pageCanvases.push(canvas);
      }
    }

    const parsed = parsePdfText(fullText);
    if (hasStrongParsedData(parsed)) {
      return {
        ...parsed,
        extractionMethod: 'text',
        rawText: fullText.substring(0, 3000),
      };
    }

    // Hibrit fallback: OCR ile tekrar oku
    try {
      const tesseract = await import('tesseract.js');
      let ocrText = '';
      let confidenceTotal = 0;
      let confidenceCount = 0;
      for (const canvas of pageCanvases) {
        const ocr = await tesseract.recognize(canvas, 'tur+eng');
        ocrText += `${ocr.data.text || ''}\n`;
        if (typeof ocr.data?.confidence === 'number') {
          confidenceTotal += ocr.data.confidence;
          confidenceCount++;
        }
      }
      const ocrParsed = parsePdfText(ocrText);
      const ocrConfidence = confidenceCount > 0 ? Math.round(confidenceTotal / confidenceCount) : null;
      if (!hasStrongParsedData(ocrParsed)) {
        return {
          ...createDraftResult(file.name),
          extractionMethod: 'ocr',
          ocrConfidence,
          rawText: (ocrText || fullText).substring(0, 3000),
        };
      }
      return {
        ...ocrParsed,
        extractionMethod: 'ocr',
        ocrConfidence,
        rawText: (ocrText || fullText).substring(0, 3000),
      };
    } catch {
      if (hasStrongParsedData(parsed)) {
        return {
          ...parsed,
          extractionMethod: 'text',
          rawText: fullText.substring(0, 3000),
        };
      }
      return {
        ...createDraftResult(file.name),
        extractionMethod: 'draft',
        rawText: fullText.substring(0, 3000),
      };
    }
  };

  // PDF Dosya Seçimi
  const handlePdfFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setUploadedFiles(prev => [...prev, ...newFiles]);
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
        errors[i] = `Otomatik parse basarisiz: ${uploadedFiles[i].name} (manuel duzenleme acik)`;
        results[i] = createDraftResult(uploadedFiles[i].name);
      }
    }

    setPdfParsedResults(results);
    setPdfErrors(errors);
    setPdfLoading(false);

    // İşlenen sonuçları seçili yap
    const selectedIndices = results
      .map((r, i) => (r ? String(i) : null))
      .filter(Boolean);
    setSelectedPdfResults(selectedIndices as string[]);
  };

  // Seçili PDF Sonuçlarını İçe Aktar
  const importSelectedPdfResults = async () => {
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
        const currentExamType = (result.examType || 'TYT') as ExamType;
        const effectiveSubjects =
          (result.subjects && result.subjects.length > 0)
            ? result.subjects.map((s: any) => ({
                ...s,
                net: netFromCounts(Number(s.correct || 0), Number(s.wrong || 0), currentExamType),
              }))
            : buildTemplateSubjects(currentExamType);
        const recalculatedTotal = calculateTotalNetFromSubjects(
          effectiveSubjects.map((s: any) => ({
            name: s.name,
            net: Number(s.net || netFromCounts(Number(s.correct || 0), Number(s.wrong || 0), currentExamType)),
          }))
        );
        const newExam = {
          id: `pdf-${Date.now()}-${index}`,
          studentId,
          examType: currentExamType,
          examDate: result.examDate || new Date().toISOString().split('T')[0],
          source: 'pdf' as const,
          totalNet: recalculatedTotal,
          subjects: effectiveSubjects,
          notes: result.parseError ? `Parse Notu: ${result.parseError}` : undefined,
          createdAt: new Date().toISOString()
        };
        await addExamResult(newExam);
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

  const updatePdfResultMeta = (index: number, key: 'studentName' | 'examDate' | 'examType', value: string) => {
    setPdfParsedResults((prev) =>
      prev.map((r, i) => {
        if (i !== index || !r) return r;
        return { ...r, [key]: value };
      })
    );
  };

  const updatePdfSubject = (resultIndex: number, subjectIndex: number, key: 'name' | 'questions' | 'correct' | 'wrong' | 'blank', value: string) => {
    setPdfParsedResults((prev) =>
      prev.map((r, i) => {
        if (i !== resultIndex || !r) return r;
        const subjects = [...(r.subjects || [])];
        const subject = { ...subjects[subjectIndex] };
        if (key === 'name') {
          subject.name = value;
        } else {
          subject[key] = Number(value) || 0;
          if (key === 'questions') {
            subject.blank = Math.max((subject.questions || 0) - (subject.correct || 0) - (subject.wrong || 0), 0);
          }
          subject.net = netFromCounts(subject.correct || 0, subject.wrong || 0, r.examType as ExamType);
        }
        subjects[subjectIndex] = subject;
        const totalNet = calculateTotalNetFromSubjects(
          subjects.map((s: any) => ({ name: s.name, net: Number(s.net || 0) }))
        );
        return { ...r, subjects, totalNet };
      })
    );
  };

  const validatePdfResult = (result: any) => {
    const issues: string[] = [];
    const agg = { questions: 0, correct: 0, wrong: 0, blank: 0, net: 0 };
    for (const s of result.subjects || []) {
      const q = Number(s.questions || 0);
      const c = Number(s.correct || 0);
      const w = Number(s.wrong || 0);
      const b = Number(s.blank || 0);
      const n = Number(s.net || 0);
      agg.questions += q;
      agg.correct += c;
      agg.wrong += w;
      agg.blank += b;
      agg.net += n;
      if (q > 0 && c + w + b !== q) {
        issues.push(`${s.name}: soru toplamı (${c + w + b}) ≠ ${q}`);
      }
      const expectedNet = netFromCounts(c, w, result.examType as ExamType);
      if (Math.abs(expectedNet - n) > 0.01) {
        issues.push(`${s.name}: net hatalı (${n} → ${expectedNet})`);
      }
    }

    const declared = result.declaredTotals;
    if (declared) {
      if (declared.questions && agg.questions !== declared.questions) {
        issues.push(`TOPLAM soru uyuşmuyor (${agg.questions}/${declared.questions})`);
      }
      if (declared.correct && agg.correct !== declared.correct) {
        issues.push(`TOPLAM doğru uyuşmuyor (${agg.correct}/${declared.correct})`);
      }
      if (declared.wrong && agg.wrong !== declared.wrong) {
        issues.push(`TOPLAM yanlış uyuşmuyor (${agg.wrong}/${declared.wrong})`);
      }
      if (declared.blank && agg.blank !== declared.blank) {
        issues.push(`TOPLAM boş uyuşmuyor (${agg.blank}/${declared.blank})`);
      }
      if (Math.abs((declared.net || 0) - agg.net) > 0.51) {
        issues.push(`TOPLAM net farkı yüksek (${agg.net.toFixed(2)}/${declared.net})`);
      }
    }
    return { issues, agg };
  };

  const copyRawPayload = async (result: any) => {
    const payload = JSON.stringify(result, null, 2);
    await navigator.clipboard.writeText(payload);
    alert('Ham veri panoya kopyalandi.');
  };

  const addPdfSubject = (resultIndex: number) => {
    setPdfParsedResults((prev) =>
      prev.map((r, i) => {
        if (i !== resultIndex || !r) return r;
        const subjects = [...(r.subjects || []), { name: '', questions: 0, correct: 0, wrong: 0, blank: 0, net: 0 }];
        return { ...r, subjects };
      })
    );
  };

  const removePdfSubject = (resultIndex: number, subjectIndex: number) => {
    setPdfParsedResults((prev) =>
      prev.map((r, i) => {
        if (i !== resultIndex || !r) return r;
        const subjects = [...(r.subjects || [])];
        subjects.splice(subjectIndex, 1);
        const totalNet = calculateTotalNetFromSubjects(
          subjects.map((s: any) => ({ name: s.name, net: Number(s.net || 0) }))
        );
        return { ...r, subjects, totalNet };
      })
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

  const hasPdfErrors = pdfErrors.some(Boolean);

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
    examType: 'TYT' as ExamType,
    examDate: new Date().toISOString().split('T')[0],
    subjects: SUBJECT_TEMPLATES.TYT.map((name) => ({ name, net: 0, correct: 0, wrong: 0, blank: 0 }))
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
    const aytResults = allExamResults.filter(r => r.examType === 'AYT' || r.examType === 'YKS-EA' || r.examType === 'YKS-SAY');
    const yosResults = allExamResults.filter(r => r.examType === 'YOS');

    return {
      totalExams: allExamResults.length,
      tytAvg: tytResults.length > 0
        ? Math.round(tytResults.reduce((sum, r) => sum + r.totalNet, 0) / tytResults.length * 10) / 10
        : 0,
      aytAvg: aytResults.length > 0
        ? Math.round(aytResults.reduce((sum, r) => sum + r.totalNet, 0) / aytResults.length * 10) / 10
        : 0,
      yosAvg: yosResults.length > 0
        ? Math.round(yosResults.reduce((sum, r) => sum + r.totalNet, 0) / yosResults.length * 10) / 10
        : 0,
      webhookCount: allExamResults.filter(r => r.source === 'webhook').length,
      manualCount: allExamResults.filter(r => r.source === 'manual').length,
      pdfCount: allExamResults.filter(r => r.source === 'pdf').length
    };
  };

  // Deneme ekle
  const addExam = async () => {
    if (!newExam.studentId || !newExam.examDate) {
      alert('Öğrenci ve tarih seçimi zorunludur.');
      return;
    }

    const totalNet = calculateTotalNetFromSubjects(
      (newExam.subjects || []).map((s) => ({ name: s.name, net: Number(s.net || 0) }))
    );

    const exam: ExamResult = {
      id: Date.now().toString(),
      studentId: newExam.studentId,
      examType: newExam.examType as ExamType,
      examDate: newExam.examDate,
      source: 'manual',
      totalNet,
      subjects: newExam.subjects || [],
      createdAt: new Date().toISOString()
    };

    await addExamResult(exam);
    setShowAddForm(false);
    setNewExam({
      studentId: '',
      examType: 'TYT' as ExamType,
      examDate: new Date().toISOString().split('T')[0],
      subjects: buildTemplateSubjects('TYT')
    });
  };

  // Deneme sil
  const deleteExam = async (id: string) => {
    if (confirm('Bu deneme sonucunu silmek istediğinizden emin misiniz?')) {
      await deleteExamResult(id);
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
            <p className="text-orange-100">TYT, AYT, YÖS ve sınıf denemelerinin takibi</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
              {totalStats.totalExams} Deneme
            </span>
          </div>
        </div>
      </div>

      {/* Toplam İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
          <div className="flex items-center gap-2 text-indigo-500 mb-2">
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm">YÖS Ort.</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600">{totalStats.yosAvg} net</p>
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
                {(['all', ...EXAM_TYPE_OPTIONS] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setExamTypeFilter(type)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      examTypeFilter === type
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {type === 'all' ? 'Tümü' : type}
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
                    {students
                      .filter((s) => !newExam.examType || isStudentCompatibleWithExam(s.id, newExam.examType as ExamType))
                      .map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sınav Türü *</label>
                  <select
                    value={newExam.examType}
                    onChange={(e) => {
                      const nextType = e.target.value as ExamType;
                      setNewExam({
                        ...newExam,
                        examType: nextType,
                        subjects: buildTemplateSubjects(nextType)
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {EXAM_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
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
                    <div key={i} className="grid grid-cols-7 gap-2 items-center">
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
                        value={(subject as any).questions ?? 0}
                        onChange={(e) => {
                          const newSubjects = [...(newExam.subjects || [])] as any[];
                          newSubjects[i] = { ...newSubjects[i], questions: parseInt(e.target.value) || 0 };
                          newSubjects[i].blank = Math.max((newSubjects[i].questions || 0) - (newSubjects[i].correct || 0) - (newSubjects[i].wrong || 0), 0);
                          newSubjects[i].net = netFromCounts(newSubjects[i].correct, newSubjects[i].wrong, newExam.examType as ExamType);
                          setNewExam({ ...newExam, subjects: newSubjects });
                        }}
                        placeholder="Soru"
                        className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="number"
                        value={subject.correct}
                        onChange={(e) => {
                          const newSubjects = [...(newExam.subjects || [])];
                          newSubjects[i] = { ...newSubjects[i], correct: parseInt(e.target.value) || 0 };
                          newSubjects[i].net = netFromCounts(newSubjects[i].correct, newSubjects[i].wrong, newExam.examType as ExamType);
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
                          newSubjects[i].net = netFromCounts(newSubjects[i].correct, newSubjects[i].wrong, newExam.examType as ExamType);
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
                      <button
                        type="button"
                        onClick={() => {
                          const newSubjects = [...(newExam.subjects || [])];
                          newSubjects.splice(i, 1);
                          setNewExam({ ...newExam, subjects: newSubjects });
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        title="Dersi sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setNewExam({
                    ...newExam,
                    subjects: [...(newExam.subjects || []), { name: '', questions: 0, net: 0, correct: 0, wrong: 0, blank: 0 }]
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
                  accept=".pdf,image/*"
                  multiple
                  onChange={handlePdfFileSelect}
                  className="hidden"
                />
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">PDF dosyası yüklemek için tıklayın</p>
                  <p className="text-sm text-gray-400 mt-1">veya dosyaları buraya sürükleyin</p>
                  <p className="text-xs text-gray-400 mt-2">Desteklenen format: PDF, JPG, PNG, WEBP</p>
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

                  {!pdfLoading && pdfParsedResults.length === 0 && !hasPdfErrors && uploadedFiles.length > 0 && (
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
              {hasPdfErrors && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    İşlenemeyen Dosyalar
                  </div>
                  <ul className="text-sm text-red-600 space-y-1">
                    {pdfErrors.map((error, index) => (error ? <li key={index}>{error}</li> : null))}
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
                                <input
                                  value={result.studentName || ''}
                                  onChange={(e) => updatePdfResultMeta(index, 'studentName', e.target.value)}
                                  placeholder="Öğrenci adı"
                                  className="font-semibold text-slate-800 bg-white border border-gray-200 rounded px-2 py-1"
                                />
                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                  <select
                                    value={result.examType || 'TYT'}
                                    onChange={(e) => updatePdfResultMeta(index, 'examType', e.target.value)}
                                    className="px-2 py-1 rounded text-xs font-medium border border-gray-200 bg-white"
                                  >
                                    {EXAM_TYPE_OPTIONS.map((type) => (
                                      <option key={type} value={type}>{type}</option>
                                    ))}
                                  </select>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    <input
                                      type="date"
                                      value={result.examDate || ''}
                                      onChange={(e) => updatePdfResultMeta(index, 'examDate', e.target.value)}
                                      className="border border-gray-200 rounded px-2 py-1 bg-white"
                                    />
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700">
                                    {result.extractionMethod === 'ocr' ? 'OCR fallback' : 'Text parser'}
                                  </span>
                                  {result.extractionMethod === 'ocr' && typeof result.ocrConfidence === 'number' && (
                                    <span className={`px-2 py-0.5 rounded text-xs ${
                                      result.ocrConfidence < 70 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                      OCR güven: %{result.ocrConfidence}
                                    </span>
                                  )}
                                  {result.parseError && (
                                    <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">
                                      Taslak kayit: manuel duzenleme gerekli
                                    </span>
                                  )}
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
                        <div className="space-y-2 mb-3">
                          {result.subjects?.map((subject: any, subIndex: number) => (
                            <div key={subIndex} className="bg-white rounded-lg p-2 text-sm grid grid-cols-8 gap-2 items-center">
                              <input
                                value={subject.name || ''}
                                onChange={(e) => updatePdfSubject(index, subIndex, 'name', e.target.value)}
                                className="col-span-2 border border-gray-200 rounded px-2 py-1"
                              />
                              <input
                                type="number"
                                value={subject.questions ?? 0}
                                onChange={(e) => updatePdfSubject(index, subIndex, 'questions', e.target.value)}
                                className="border border-gray-200 rounded px-2 py-1"
                                placeholder="Soru"
                              />
                              <input
                                type="number"
                                value={subject.correct ?? 0}
                                onChange={(e) => updatePdfSubject(index, subIndex, 'correct', e.target.value)}
                                className="border border-gray-200 rounded px-2 py-1"
                                placeholder="D"
                              />
                              <input
                                type="number"
                                value={subject.wrong ?? 0}
                                onChange={(e) => updatePdfSubject(index, subIndex, 'wrong', e.target.value)}
                                className="border border-gray-200 rounded px-2 py-1"
                                placeholder="Y"
                              />
                              <input
                                type="number"
                                value={subject.blank ?? 0}
                                onChange={(e) => updatePdfSubject(index, subIndex, 'blank', e.target.value)}
                                className="border border-gray-200 rounded px-2 py-1"
                                placeholder="B"
                              />
                              <span className={`font-semibold text-right ${
                                  subject.net >= 8 ? 'text-green-600' :
                                  subject.net >= 5 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {subject.net?.toFixed(2) || '0.00'}
                                </span>
                              <button
                                type="button"
                                onClick={() => removePdfSubject(index, subIndex)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                                title="Dersi sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => addPdfSubject(index)}
                          className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 mb-2"
                        >
                          Eksik Ders Ekle
                        </button>
                        {(() => {
                          const v = validatePdfResult(result);
                          return (
                            <>
                              <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 mb-2">
                                Hesaplanan Toplam: Soru {v.agg.questions} | D {v.agg.correct} | Y {v.agg.wrong} | B {v.agg.blank} | Net {v.agg.net.toFixed(2)}
                                {result.declaredTotals && (
                                  <span>
                                    {' '}| PDF TOPLAM: Soru {result.declaredTotals.questions} | D {result.declaredTotals.correct} | Y {result.declaredTotals.wrong} | B {result.declaredTotals.blank} | Net {result.declaredTotals.net}
                                  </span>
                                )}
                              </div>
                              {!!v.issues.length && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                                  {v.issues.join(', ')}
                          </div>
                              )}
                            </>
                          );
                        })()}

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
                            {students
                              .filter((s) => isStudentCompatibleWithExam(s.id, (result.examType || 'TYT') as ExamType))
                              .map(s => (
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
                            <button
                              onClick={() => copyRawPayload(result)}
                              className="mt-2 text-xs px-2 py-1 bg-slate-100 rounded hover:bg-slate-200"
                            >
                              Ham JSON Kopyala
                            </button>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs text-gray-600 overflow-x-auto max-h-40">
                              {JSON.stringify(result, null, 2)}
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
