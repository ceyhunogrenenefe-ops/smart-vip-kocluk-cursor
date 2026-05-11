// Türkçe: PDF Import Sayfası - Deneme sınavı sonuçlarını PDF'den aktarma
import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { mergeYosMatematikGenelSubjects } from '../lib/mergeYosExamSubjects';
import {
  FileUp,
  Upload,
  File,
  Check,
  X,
  AlertCircle,
  User,
  ClipboardList,
  Loader2,
  Trash2,
  Search,
  Edit2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Download,
  Share2,
  Brain,
  Eye,
  Plus,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';

// PDF.js değişkenleri
let pdfjsLib: any = null;
let pdfjsLoaded = false;

// PDF.js'i CDN'den yükle
const loadPdfJs = async () => {
  if (pdfjsLoaded && pdfjsLib) return pdfjsLib;

  return new Promise((resolve, reject) => {
    // PDF.js worker script'i
    const workerScript = document.createElement('script');
    workerScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    workerScript.onload = () => {
      // PDF.js ana kütüphane
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

// PDF.js için basit parser (tarayıcı tarafında çalışır)
interface ParsedExamResult {
  studentName: string;
  studentNumber: string;
  examName: string;
  examDate: string;
  booklet: string;
  className: string;
  examType: '3' | '4' | '5' | '6' | '7' | 'LGS' | 'YOS' | 'TYT' | 'YKS-EA' | 'YKS-SAY' | 'AYT';
  subjects: {
    name: string;
    questions: number;
    correct: number;
    wrong: number;
    blank: number;
    net: number;
    avg: number;
  }[];
  totalQuestions: number;
  totalCorrect: number;
  totalWrong: number;
  totalBlank: number;
  totalNet: number;
  scores: {
    type: string;
    score: number;
    generalRank: string;
    institutionRank: string;
    classRank: string;
    osym23: string;
    osym24: string;
    osym25: string;
  }[];
}

interface StudentMatch {
  id: string;
  name: string;
  classLevel: number | string;
  matchConfidence: 'exact' | 'partial' | 'none';
  matchedResult: ParsedExamResult | null;
}

export default function PDFImport() {
  const { students, addExamResult, getStudentStats } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [parsedResults, setParsedResults] = useState<ParsedExamResult[]>([]);
  const [parsingErrors, setParsingErrors] = useState<string[]>([]);
  const [selectedResult, setSelectedResult] = useState<ParsedExamResult | null>(null);
  const [studentMatches, setStudentMatches] = useState<StudentMatch[]>([]);
  const [manualStudentId, setManualStudentId] = useState<string>('');
  const [importedCount, setImportedCount] = useState(0);

  // PDF dosyası seçimi
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfFiles = files.filter(f => f.type === 'application/pdf');

    if (pdfFiles.length !== files.length) {
      alert('Sadece PDF dosyaları kabul edilir!');
    }

    setUploadedFiles(prev => [...prev, ...pdfFiles]);
    e.target.value = '';
  };

  // Dosya kaldırma
  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setParsedResults(prev => prev.filter((_, i) => i !== index));
    setParsingErrors(prev => prev.filter((_, i) => i !== index));
  };

  // PDF içeriğini parse et (PDF.js ile)
  const parsePDF = async (file: File): Promise<ParsedExamResult> => {
    const pdfjs = await loadPdfJs();
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buf = e.target?.result;
        if (buf instanceof ArrayBuffer) resolve(buf);
        else reject(new Error(`Okuma hatası: ${file.name}`));
      };
      reader.onerror = () => reject(new Error(`Okuma hatası: ${file.name}`));
      reader.readAsArrayBuffer(file);
    });

    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    console.log('PDF Metni uzunluğu:', fullText.length);
    console.log('PDF Metni önizleme:', fullText.substring(0, 300));

    try {
      return parseExamText(fullText);
    } catch (error) {
      console.error('PDF Parse Hatası:', error);
      throw new Error(`Parse hatası: ${file.name} - ${error}`);
    }
  };

  // Metin tabanlı PDF parsing (örnek PDF formatına göre)
  const parseExamText = (text: string): ParsedExamResult => {
    console.log('Parsing exam text, length:', text.length);

    // Türkçe karakterleri normalize et
    const normalizedText = text
      .replace(/İ/g, 'I')
      .replace(/ı/g, 'i')
      .replace(/Ş/g, 'S')
      .replace(/ş/g, 's')
      .replace(/Ğ/g, 'G')
      .replace(/ğ/g, 'g')
      .replace(/Ü/g, 'U')
      .replace(/ü/g, 'u')
      .replace(/Ö/g, 'O')
      .replace(/ö/g, 'o')
      .replace(/Ç/g, 'C')
      .replace(/ç/g, 'c');

    // Öğrenci bilgilerini çıkar - daha esnek regexler
    const nameMatch = normalizedText.match(/(?:Ad[iı]?\s*(?:Soyad[iı]?)?|Name|Name\s*Surname)[\s:]*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/i)
      || normalizedText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/);

    const numberMatch = normalizedText.match(/(?:Numara|Number|No|Bno)[^\d]*(\d+)/i)
      || normalizedText.match(/\b(\d{6,})\b/);

    const examNameMatch = normalizedText.match(/(?:S[iı]nav\s*Ad[iı]|Sinav Adi|Exam)[^\w]*(\w+)/i);

    const dateMatch = normalizedText.match(/(?:Tarih|Date)[^\d]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i)
      || normalizedText.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{4})/);

    const bookletMatch = normalizedText.match(/(?:Kitap[cç]ik|Kitapcik|Booklet)[^\w]*([A-Z])/i);
    const classMatch = normalizedText.match(/(?:S[iı]n[iı]f|Sinif|Class)[^\d]*(\d+)/i);

    // Sınav tipini belirle
    const examType: '3' | '4' | '5' | '6' | '7' | 'LGS' | 'YOS' | 'TYT' | 'YKS-EA' | 'YKS-SAY' | 'AYT' =
      normalizedText.includes('LGS')
        ? (normalizedText.match(/Sinif[^\d]*(3|4|5|6|7)/i)?.[1] as '3' | '4' | '5' | '6' | '7') || 'LGS'
        : normalizedText.includes('YOS') || normalizedText.includes('YÖS')
          ? 'YOS'
        : normalizedText.includes('TYT')
          ? 'TYT'
          : normalizedText.includes('AYT') && (normalizedText.includes('EDEBIYAT') || normalizedText.includes('EA'))
            ? 'YKS-EA'
            : normalizedText.includes('AYT') || normalizedText.includes('SAY')
              ? 'YKS-SAY'
              : 'TYT';

    // Ders analizini çıkar - çoklu regex deseni
    const subjectMatches: ParsedExamResult['subjects'] = [];

    // Her ders için farklı pattern dene
    const subjectPatterns = [
      // YÖS - Sayısal Yetenek / IQ
      { name: 'YÖS IQ', patterns: [
        /Y[ÖO]S[\s-]*SAYISAL[\s-]*YETENEK[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)(?:[\s\S]*?(\d+))?[\s\S]*?(-?\d+[.,]?\d*)/i,
        /(?:^|\s)IQ[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)(?:[\s\S]*?(\d+))?[\s\S]*?(-?\d+[.,]?\d*)/i
      ]},
      // YÖS - Temel Matematik
      { name: 'YÖS MATEMATİK', patterns: [
        /Y[ÖO]S[\s-]*TEMEL[\s-]*MATEMAT[İI]K[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)(?:[\s\S]*?(\d+))?[\s\S]*?(-?\d+[.,]?\d*)/i,
        /Y[ÖO]S[\s-]*TEMEL[\s-]*MATEMET[İI]K[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)(?:[\s\S]*?(\d+))?[\s\S]*?(-?\d+[.,]?\d*)/i,
        /MATEMAT[İI]K[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)(?:[\s\S]*?(\d+))?[\s\S]*?(-?\d+[.,]?\d*)/i
      ]},
      // YÖS - Geometri
      { name: 'YÖS GEOMETRİ', patterns: [
        /GEOMETR[İI][\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)(?:[\s\S]*?(\d+))?[\s\S]*?(-?\d+[.,]?\d*)/i
      ]},
      // TYT-TÜRKÇE / TÜRKÇE
      { name: 'TYT-TÜRKÇE', patterns: [
        /TYT\s*[–-]?\s*TÜRK[TÇ]E[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
        /TÜRK[TÇ]E[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // TYT-MATEMATİK / MATEMATİK
      { name: 'TYT-MATEMATİK', patterns: [
        /TYT\s*[–-]?\s*MATEMAT[iİ]K[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
        /MATEMAT[iİ]K[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // SOSYAL BİLİMLER / SOSYAL
      { name: 'TYT-SOSYAL', patterns: [
        /SOSYAL[\s\S]*?B[iİ]L[iİ]MLER[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
        /SOSYAL[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // FEN BİLİMLERİ / FEN
      { name: 'TYT-FEN', patterns: [
        /FEN[\s\S]*?B[iİ]L[iİ]MLER[iİ]?[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
        /FEN[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // TARİH
      { name: 'TARİH', patterns: [
        /TAR[iİ]H[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // COĞRAFYA
      { name: 'COĞRAFYA', patterns: [
        /CO[GĞ]RAFYA[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // FELSEFE
      { name: 'FELSEFE', patterns: [
        /FELSEFE[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // DİN KÜLTÜRÜ
      { name: 'DİN KÜLTÜRÜ', patterns: [
        /D[iİ]N[\s\S]*?KÜLTÜR[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
        /D[iİ]N[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // FİZİK
      { name: 'FİZİK', patterns: [
        /F[iİ]Z[iİ]K[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // KİMYA
      { name: 'KİMYA', patterns: [
        /K[iİ]MYA[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // BİYOLOJİ
      { name: 'BİYOLOJİ', patterns: [
        /B[iİ]YOLOJ[iİ][\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // EDEBİYAT
      { name: 'EDEBİYAT', patterns: [
        /EDEB[iİ]YAT[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // AYT-MATEMATİK
      { name: 'AYT-MATEMATİK', patterns: [
        /AYT\s*[–-]?\s*MATEMAT[iİ]K[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
      // AYT-FEN
      { name: 'AYT-FEN', patterns: [
        /AYT\s*[–-]?\s*FEN[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i,
      ]},
    ];

    // Her pattern için dene
    const foundSubjects = new Set<string>();
    subjectPatterns.forEach(pattern => {
      if (foundSubjects.has(pattern.name)) return; // Zaten eklenmişse atla

      for (const regex of pattern.patterns) {
        const match = normalizedText.match(regex);
        if (match) {
          const net = parseFloat(match[5].replace(',', '.')) || 0;
          const blankValue = match[4] ? (parseInt(match[4]) || 0) : Math.max((parseInt(match[1]) || 0) - (parseInt(match[2]) || 0) - (parseInt(match[3]) || 0), 0);
          // Sadece pozitif net değerlerini al (0 veya geçerli net)
          if (net >= 0 || match[5].includes('-')) {
            subjectMatches.push({
              name: pattern.name,
              questions: parseInt(match[1]) || 0,
              correct: parseInt(match[2]) || 0,
              wrong: parseInt(match[3]) || 0,
              blank: blankValue,
              net: Math.abs(net),
              avg: 0
            });
            foundSubjects.add(pattern.name);
            console.log('Found subject:', pattern.name, match.slice(1));
            break;
          }
        }
      }
    });

    const yosNetFromCounts = (c: number, w: number) => {
      const pen =
        examType === '3' || examType === '4' || examType === '5' || examType === '6' || examType === '7' || examType === 'LGS'
          ? 1 / 3
          : 1 / 4;
      return Math.round((c - w * pen) * 100) / 100;
    };
    const mergedSubjectRows =
      examType === 'YOS' ? mergeYosMatematikGenelSubjects(examType, subjectMatches, yosNetFromCounts) : subjectMatches;

    // TOPLAM satırını bul
    const totalMatch = normalizedText.match(/TOPLAM[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(-?\d+[.,]?\d*)/i);

    // Puanları çıkar
    const scorePatterns = [
      { type: 'TYT', regex: /TYT[\s\S]*?(\d+[\d,.]\d*)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)/i },
      { type: 'SAY', regex: /SAY[\s\S]*?(\d+[\d,.]\d*)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)/i },
      { type: 'EA', regex: /EA[\s\S]*?(\d+[\d,.]\d*)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)/i },
      { type: 'SÖZ', regex: /SÖZ[\s\S]*?(\d+[\d,.]\d*)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)[\s\S]*?(\d+)/i },
    ];

    const scores: ParsedExamResult['scores'] = [];
    scorePatterns.forEach(pattern => {
      const match = normalizedText.match(pattern.regex);
      if (match) {
        scores.push({
          type: pattern.type,
          score: parseFloat(match[1].replace(',', '.')) || 0,
          generalRank: match[2] || '-',
          institutionRank: match[3] || '-',
          classRank: match[4] || '-',
          osym23: match[5] || '-',
          osym24: match[6] || '-',
          osym25: match[7] || '-'
        });
      }
    });

    // Toplam net hesapla
    let totalNet = 0;
    if (totalMatch) {
      totalNet = Math.abs(parseFloat(totalMatch[5].replace(',', '.')) || 0);
    } else {
      // Derslerden hesapla
      totalNet = mergedSubjectRows.reduce((sum, s) => sum + (s.net || 0), 0);
    }

    console.log('Total net calculated:', totalNet);

    return {
      studentName: nameMatch ? nameMatch[1].replace(/\s+/g, ' ').trim() : 'Bilinmeyen',
      studentNumber: numberMatch ? numberMatch[1] : '-',
      examName: examNameMatch ? examNameMatch[0].replace(/(?:S[iı]nav\s*Ad[iı]|Sinav Adi|Exam)[^\w]*/i, '').trim() : 'Bilinmeyen Sınav',
      examDate: dateMatch ? dateMatch[1] : '-',
      booklet: bookletMatch ? bookletMatch[1] : '-',
      className: classMatch ? classMatch[1] : '-',
      examType,
      subjects: mergedSubjectRows,
      totalQuestions: totalMatch ? parseInt(totalMatch[1]) || 0 : mergedSubjectRows.reduce((sum, s) => sum + s.questions, 0),
      totalCorrect: totalMatch ? parseInt(totalMatch[2]) || 0 : mergedSubjectRows.reduce((sum, s) => sum + s.correct, 0),
      totalWrong: totalMatch ? parseInt(totalMatch[3]) || 0 : mergedSubjectRows.reduce((sum, s) => sum + s.wrong, 0),
      totalBlank: totalMatch ? parseInt(totalMatch[4]) || 0 : mergedSubjectRows.reduce((sum, s) => sum + s.blank, 0),
      totalNet: totalNet,
      scores
    };
  };

  // Dosyaları işle
  const processFiles = async () => {
    if (uploadedFiles.length === 0) return;

    setIsLoading(true);
    setParsedResults([]);
    setParsingErrors([]);
    setStudentMatches([]);

    const results: ParsedExamResult[] = [];
    const errors: string[] = [];

    for (const file of uploadedFiles) {
      try {
        const result = await parsePDF(file);
        results.push(result);
      } catch (error) {
        errors.push(`Hata: ${file.name} - ${error}`);
      }
    }

    setParsedResults(results);
    setParsingErrors(errors);

    // Öğrenci eşleştirmesi yap
    if (results.length > 0) {
      const matches: StudentMatch[] = results.map(result => {
        // Tam eşleşme ara (isim + sınıf)
        const exactMatch = students.find(s =>
          s.name.toLowerCase().includes(result.studentName.toLowerCase().split(' ')[0]) &&
          s.name.toLowerCase().includes(result.studentName.toLowerCase().split(' ')[1] || '')
        );

        // Kısmi eşleşme (sadece isim)
        const partialMatch = !exactMatch ? students.find(s =>
          s.name.toLowerCase().includes(result.studentName.toLowerCase().split(' ')[0])
        ) : null;

        return {
          id: exactMatch?.id || partialMatch?.id || '',
          name: exactMatch?.name || partialMatch?.name || result.studentName,
          classLevel: exactMatch?.classLevel || partialMatch?.classLevel || 0,
          matchConfidence: (exactMatch ? 'exact' : partialMatch ? 'partial' : 'none') as 'exact' | 'partial' | 'none',
          matchedResult: result
        };
      });
      setStudentMatches(matches);
    }

    setIsLoading(false);
  };

  // Manuel öğrenci seçimi
  const handleManualStudentSelect = (index: number, studentId: string) => {
    setStudentMatches(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        id: studentId,
        name: students.find(s => s.id === studentId)?.name || updated[index].name,
        matchConfidence: 'none' // Manuel seçim
      };
      return updated;
    });
  };

  // Seçili sonuçları sisteme ekle
  const importSelectedResults = () => {
    let count = 0;

    studentMatches.forEach(match => {
      if (match.id && match.matchedResult) {
        const examData = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          studentId: match.id,
          examType: match.matchedResult.examType,
          examDate: match.matchedResult.examDate,
          source: 'pdf' as const,
          totalNet: match.matchedResult.totalNet,
          subjects: match.matchedResult.subjects.map(s => ({
            name: s.name,
            net: s.net,
            correct: s.correct,
            wrong: s.wrong,
            blank: s.blank
          })) as any,
          createdAt: new Date().toISOString()
        };

        addExamResult(examData as any);
        count++;
      }
    });

    setImportedCount(count);
    setUploadedFiles([]);
    setParsedResults([]);
    setStudentMatches([]);
  };

  // Başarı rengi
  const getNetColor = (net: number, total: number) => {
    if (total === 0) return 'text-gray-500';
    const rate = (net / total) * 100;
    if (rate >= 80) return 'text-green-600';
    if (rate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <FileUp className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">PDF'den İçeri Aktar</h2>
            <p className="text-blue-100">Deneme sınavı sonuçlarını PDF dosyasından aktarın</p>
          </div>
        </div>
      </div>

      {/* Bilgilendirme */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-blue-800">Desteklenen PDF Formatı</h4>
            <p className="text-sm text-blue-700 mt-1">
              Bu modül, dershane sistemlerinden indirilen deneme sınavı PDF'lerini okuyabilir.
              PDF'nizde öğrenci adı, ders bilgileri (TYT-Türkçe, TYT-Matematik vb.) ve net hesaplamaları bulunmalıdır.
            </p>
            <div className="mt-2 text-sm text-blue-700">
              <strong>Desteklenen Sınav Türleri:</strong> 3-7, LGS, YÖS, TYT, YKS Eşit Ağırlık, YKS Sayısal
            </div>
          </div>
        </div>
      </div>

      {/* Dosya Yükleme */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          PDF Dosyalarını Yükle
        </h3>

        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
          <input
            type="file"
            id="pdf-upload"
            multiple
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <label htmlFor="pdf-upload" className="cursor-pointer">
            <FileUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">PDF dosyalarını seçmek için tıklayın</p>
            <p className="text-sm text-gray-400 mt-1">veya sürükle-bırak yapın</p>
          </label>
        </div>

        {/* Yüklenen Dosyalar */}
        {uploadedFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <File className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-medium text-slate-800">{file.name}</p>
                    <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* İşle Butonu */}
        {uploadedFiles.length > 0 && (
          <button
            onClick={processFiles}
            disabled={isLoading}
            className="mt-4 w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                PDF'ler İşleniyor...
              </>
            ) : (
              <>
                <File className="w-5 h-5" />
                PDF'leri İşle ({uploadedFiles.length} dosya)
              </>
            )}
          </button>
        )}
      </div>

      {/* Parse Hataları */}
      {parsingErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-800">Parse Hataları</h4>
              <ul className="text-sm text-red-700 mt-2 space-y-1">
                {parsingErrors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Parsed Sonuçlar */}
      {parsedResults.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Parsed Sonuçlar ({parsedResults.length})
            </h3>
          </div>

          <div className="divide-y divide-gray-100">
            {studentMatches.map((match, index) => (
              <div key={index} className="p-4">
                {/* Öğrenci Bilgisi */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                      match.matchConfidence === 'exact' ? 'bg-green-500' :
                      match.matchConfidence === 'partial' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`}>
                      {match.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800">{match.matchedResult?.studentName}</p>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          match.matchConfidence === 'exact' ? 'bg-green-100 text-green-700' :
                          match.matchConfidence === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {match.matchConfidence === 'exact' ? 'Tam Eşleşme' :
                           match.matchConfidence === 'partial' ? 'Kısmi Eşleşme' : 'Eşleşme Yok'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{match.matchedResult?.examName}</p>
                    </div>
                  </div>

                  {/* Öğrenci Seçimi */}
                  <select
                    value={match.id}
                    onChange={(e) => handleManualStudentSelect(index, e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Öğrenci Seçin</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} - {s.classLevel}. Sınıf
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sınav Detayları */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Sınav Türü</p>
                      <p className="font-semibold">{match.matchedResult?.examType}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Tarih</p>
                      <p className="font-semibold">{match.matchedResult?.examDate}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Toplam Net</p>
                      <p className={`font-bold text-lg ${getNetColor(match.matchedResult?.totalNet || 0, match.matchedResult?.totalQuestions || 120)}`}>
                        {match.matchedResult?.totalNet}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Sınıf</p>
                      <p className="font-semibold">{match.matchedResult?.className}</p>
                    </div>
                  </div>

                  {/* Ders Bazlı Sonuçlar */}
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                    {match.matchedResult?.subjects.slice(0, 5).map((subject, i) => (
                      <div key={i} className={`p-2 rounded text-xs ${
                        subject.net >= 8 ? 'bg-green-100 text-green-700' :
                        subject.net >= 5 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        <p className="font-medium">{subject.name.split('-')[1] || subject.name}</p>
                        <p className="font-bold">{subject.net} net</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* İçe Aktar Butonu */}
          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={importSelectedResults}
              disabled={studentMatches.filter(m => m.id).length === 0}
              className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-5 h-5" />
              Seçili Sonuçları İçe Aktar ({studentMatches.filter(m => m.id).length})
            </button>
          </div>
        </div>
      )}

      {/* Başarı Mesajı */}
      {importedCount > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <div>
            <p className="font-semibold text-green-800">İçe Aktarma Başarılı!</p>
            <p className="text-sm text-green-700">{importedCount} deneme sınavı sonucu eklendi.</p>
          </div>
        </div>
      )}

      {/* İstatistikler */}
      {studentMatches.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Özet</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <p className="text-2xl font-bold text-green-600">
                {studentMatches.filter(m => m.matchConfidence === 'exact').length}
              </p>
              <p className="text-sm text-gray-500">Tam Eşleşme</p>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-xl">
              <p className="text-2xl font-bold text-yellow-600">
                {studentMatches.filter(m => m.matchConfidence === 'partial').length}
              </p>
              <p className="text-sm text-gray-500">Kısmi Eşleşme</p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-xl">
              <p className="text-2xl font-bold text-red-600">
                {studentMatches.filter(m => m.matchConfidence === 'none').length}
              </p>
              <p className="text-sm text-gray-500">Eşleşme Yok</p>
            </div>
          </div>
        </div>
      )}

      {/* Format Açıklaması */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h4 className="font-semibold text-slate-800 mb-3">PDF Format Gereksinimleri</h4>
        <div className="text-sm text-gray-600 space-y-2">
          <p>PDF'niz aşağıdaki bilgileri içermelidir:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Ad Soyad:</strong> Öğrencinin tam adı</li>
            <li><strong>Sınav Adı:</strong> Deneme sınavının adı (örn: TOPRAK TYT-5)</li>
            <li><strong>Sınav Tarihi:</strong> GG.AA.YYYY formatında</li>
            <li><strong>Ders Analizi Tablosu:</strong> Ders bazlı doğru/yanlış/boş/net bilgileri</li>
            <li><strong>Toplam:</strong> Genel istatistikler</li>
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            Not: Bu modül Online VIP Dershane formatını desteklemektedir. Diğer dershane formatları için manuel giriş kullanılabilir.
          </p>
        </div>
      </div>
    </div>
  );
}
