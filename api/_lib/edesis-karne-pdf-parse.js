/** Edesis karne PDF — metin çıkarma ve hata karnesi bölümü */

function normalizePdfText(text) {
  return String(text || '')
    .replace(/\uFEFF/g, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractTextFromPdfUrl(reportUrl) {
  const url = String(reportUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return { text: '', error: 'invalid_url' };

  const res = await fetch(url, {
    headers: { Accept: 'application/pdf,*/*', 'User-Agent': 'SmartKocluk/1.0 (+edesis-karne)' },
    signal: AbortSignal.timeout(55000)
  });
  if (!res.ok) return { text: '', error: `http_${res.status}` };

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) return { text: '', error: 'empty_pdf' };

  try {
    const mod = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const parsed = await pdfParse(buffer);
    return {
      text: normalizePdfText(parsed.text || ''),
      pageCount: parsed.numpages || 0,
      error: null
    };
  } catch (e) {
    return { text: '', error: e?.message || 'pdf_parse_failed' };
  }
}

function extractHataKarnesiSection(text) {
  const markers = [
    /HATA\s*KARNES/i,
    /KONU\s*ANALIZ/i,
    /KONU\s*ANALİZ/i,
    /KONU\s*BAZLI/i,
    /YANLI[SŞ]\s*KONU/i,
    /KONU\s*SONUC/i,
    /DETAYLI\s*ANALIZ/i
  ];
  for (const m of markers) {
    const idx = text.search(m);
    if (idx >= 0) return text.slice(idx, idx + 10000);
  }
  return null;
}

/** PDF metninden konu satırları (heuristic) */
export function parseTopicLinesFromKarneText(text) {
  const section = extractHataKarnesiSection(text) || text;
  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
  const topics = [];

  for (const line of lines) {
    const compact = line.replace(/\s+/g, ' ');
    // KonuAdi D Y B veya KonuAdi net
    const m1 = compact.match(
      /^(.{3,80}?)\s+(\d+)\s+(\d+)\s+(\d+)\s*(-?\d+[.,]?\d*)?$/
    );
    if (m1 && !/^(TYT|AYT|LGS|TOPLAM|GENEL|NET|DERS)/i.test(m1[1])) {
      topics.push({
        name: m1[1].trim(),
        correct: Number(m1[2]) || 0,
        wrong: Number(m1[3]) || 0,
        blank: Number(m1[4]) || 0
      });
      continue;
    }
    const m2 = compact.match(/^(.{3,80}?)\s+Y[:\s]*(\d+)(?:\s+B[:\s]*(\d+))?/i);
    if (m2) {
      topics.push({
        name: m2[1].trim(),
        correct: 0,
        wrong: Number(m2[2]) || 0,
        blank: Number(m2[3]) || 0
      });
    }
  }

  return topics.slice(0, 120);
}

export function buildPdfKarneContextBlock(pdfResult) {
  if (!pdfResult?.text) {
    return pdfResult?.error ? `PDF metni alınamadı (${pdfResult.error}).` : 'PDF metni yok.';
  }

  const hataSection = extractHataKarnesiSection(pdfResult.text);
  const topicLines = parseTopicLinesFromKarneText(pdfResult.text);
  const topicText =
    topicLines.length > 0
      ? topicLines
          .filter((t) => t.wrong > 0 || t.blank > 0)
          .map((t) => `• ${t.name}: Y${t.wrong}${t.blank ? `/B${t.blank}` : ''}`)
          .join('\n')
      : '';

  const parts = [];
  if (hataSection) parts.push(`--- PDF Hata Karnesi bölümü ---\n${hataSection.slice(0, 8000)}`);
  if (topicText) parts.push(`--- PDF'den çıkarılan konu hataları ---\n${topicText}`);
  if (!hataSection && !topicText) {
    parts.push(`--- PDF ham metin (ilk 10000 karakter) ---\n${pdfResult.text.slice(0, 10000)}`);
  }
  if (pdfResult.pageCount) parts.push(`(PDF sayfa: ${pdfResult.pageCount})`);
  return parts.join('\n\n');
}

/** API konu kırılımı yoksa PDF konularını exam.subjects içine ekle */
export function mergePdfTopicsIntoExam(exam, pdfResult) {
  const topics = parseTopicLinesFromKarneText(pdfResult?.text || '');
  if (!topics.length) return exam;

  const existingTopicCount = (exam.subjects || []).reduce(
    (n, s) => n + (s.topics?.length ?? 0),
    0
  );
  if (existingTopicCount > 0) return exam;

  const subjects = [...(exam.subjects || [])];
  if (!subjects.length) {
    subjects.push({
      name: exam.examTitle || exam.examType || 'Genel',
      net: exam.totalNet || 0,
      correct: 0,
      wrong: 0,
      blank: 0,
      topics: topics.map((t) => ({
        name: t.name,
        net: t.correct - t.wrong / 4,
        correct: t.correct,
        wrong: t.wrong,
        blank: t.blank
      }))
    });
  } else {
    const target = subjects.find((s) => (s.wrong ?? 0) > 0) || subjects[0];
    target.topics = topics.map((t) => ({
      name: t.name,
      net: t.correct - t.wrong / 4,
      correct: t.correct,
      wrong: t.wrong,
      blank: t.blank
    }));
  }

  return { ...exam, subjects, notes: `${exam.notes || ''} · konu:PDF`.trim() };
}
