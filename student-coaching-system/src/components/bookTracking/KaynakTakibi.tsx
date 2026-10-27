import { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { FileDown, Plus, Trash2 } from 'lucide-react';
import type { Book, WeeklyEntry } from '../../types';
import { ensureNotoSansForPdfCapture } from '../../lib/pdfLiveWeekGrid';
import {
  gosterilenKonum,
  haftalikBirim,
  ilerlemeYuzde,
  kaynakNotuOku,
  kaynakNotuYaz,
  type KaynakBirim
} from '../../lib/kaynakIlerleme';

type Props = {
  studentId: string;
  studentName: string;
  classLabel: string;
  books: Book[];
  weeklyEntries: WeeklyEntry[];
  addBook: (book: Book) => void | Promise<void>;
  updateBook: (id: string, patch: Partial<Book>) => void | Promise<void>;
  deleteBook: (id: string) => void | Promise<void>;
};

const bosForm = () => ({
  subject: '',
  name: '',
  unit: 'test' as KaynakBirim,
  total: '',
  current: '',
  targetDate: ''
});

export default function KaynakTakibi({
  studentId,
  studentName,
  classLabel,
  books,
  weeklyEntries,
  addBook,
  updateBook,
  deleteBook
}: Props) {
  const raporRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState(bosForm);
  const [pdfMesgul, setPdfMesgul] = useState(false);
  const [hata, setHata] = useState('');

  const dersOnerileri = useMemo(() => {
    const set = new Set<string>();
    for (const e of weeklyEntries) {
      if (e.studentId === studentId && e.subject.trim()) set.add(e.subject.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [weeklyEntries, studentId]);

  const satirlar = useMemo(() => {
    return books
      .filter((b) => b.studentId === studentId && b.status === 'kaynak')
      .map((b) => {
        const detay = kaynakNotuOku(b.notes) || {
          subject: b.author || '',
          unit: 'sayfa' as KaynakBirim,
          total: b.totalPages || 0
        };
        const haftalik = haftalikBirim(
          { studentId, name: b.title, subject: detay.subject, unit: detay.unit },
          weeklyEntries
        );
        const konum = gosterilenKonum(b.pagesRead || 0, haftalik);
        return { book: b, detay, haftalik, konum, yuzde: ilerlemeYuzde(konum, detay.total) };
      })
      .sort((a, b) => a.detay.subject.localeCompare(b.detay.subject, 'tr') || a.book.title.localeCompare(b.book.title, 'tr'));
  }, [books, studentId, weeklyEntries]);

  const kaydet = async () => {
    const subject = form.subject.trim();
    const name = form.name.trim();
    const total = Math.round(Number(form.total));
    const current = Math.round(Number(form.current) || 0);
    if (!subject || !name || !Number.isFinite(total) || total < 1) {
      setHata('Ders, kaynak adı ve toplam sayfa veya test sayısı gerekli.');
      return;
    }
    setHata('');
    await addBook({
      id: '',
      studentId,
      title: name,
      author: subject,
      status: 'kaynak',
      pagesRead: Math.max(0, current),
      totalPages: total,
      startDate: new Date().toISOString().split('T')[0],
      endDate: form.targetDate || undefined,
      notes: kaynakNotuYaz({ subject, unit: form.unit, total }),
      createdAt: new Date().toISOString()
    });
    setForm(bosForm());
  };

  const pdfAl = async () => {
    if (!raporRef.current) return;
    setPdfMesgul(true);
    try {
      await ensureNotoSansForPdfCapture();
      const canvas = await html2canvas(raporRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(img, 'PNG', 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(img, 'PNG', 0, position, pageWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const ad = studentName.replace(/\s+/g, '-').toLocaleLowerCase('tr');
      pdf.save(`kaynak-ilerleme-${ad || 'ogrenci'}.pdf`);
    } finally {
      setPdfMesgul(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-slate-800">Kaynak ekle</h3>
        <p className="mt-1 text-sm text-gray-500">
          Haftalık planda aynı ders ve kaynak adı yazılırsa çözülen soru veya okunan sayfa, elle girilen konumdan
          büyükse çubuk oradan ilerler.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-slate-600">
            Ders
            <input
              list="kaynak-dersler"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              placeholder="Türkçe"
            />
            <datalist id="kaynak-dersler">
              {dersOnerileri.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="text-sm text-slate-600 md:col-span-2">
            Kaynak adı
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              placeholder="8. Sınıf Paragraf Soru Bankası"
            />
          </label>
          <label className="text-sm text-slate-600">
            Birim
            <select
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value === 'sayfa' ? 'sayfa' : 'test' }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
            >
              <option value="test">Test</option>
              <option value="sayfa">Sayfa</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Toplam
            <input
              inputMode="numeric"
              value={form.total}
              onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              placeholder="40"
            />
          </label>
          <label className="text-sm text-slate-600">
            Şu an gelinen
            <input
              inputMode="numeric"
              value={form.current}
              onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              placeholder="0"
            />
          </label>
          <label className="text-sm text-slate-600">
            Hedef bitiş
            <input
              type="date"
              value={form.targetDate}
              onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
        </div>
        {hata ? <p className="mt-3 text-sm text-red-600">{hata}</p> : null}
        <button
          type="button"
          onClick={() => void kaydet()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          Kaynağı ekle
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void pdfAl()}
          disabled={!satirlar.length || pdfMesgul}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <FileDown className="h-4 w-4" />
          {pdfMesgul ? 'PDF hazırlanıyor' : 'Kaynak ilerleme raporu'}
        </button>
      </div>

      <div ref={raporRef} className="space-y-3 bg-white p-1">
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">Kaynak ilerleme raporu</p>
          <h3 className="text-xl font-bold text-slate-800">{studentName}</h3>
          <p className="text-sm text-slate-500">{classLabel}</p>
        </div>
        {satirlar.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-500">
            Bu öğrencide kayıtlı soru bankası veya kaynak yok.
          </div>
        ) : (
          satirlar.map(({ book, detay, konum, haftalik, yuzde }) => (
            <article key={book.id} className="rounded-xl border border-gray-100 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-emerald-700">{detay.subject || book.author}</p>
                  <h4 className="text-lg font-semibold text-slate-800">{book.title}</h4>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => {
                    if (window.confirm(`${book.title} kaynağı silinsin mi?`)) void deleteBook(book.id);
                  }}
                  aria-label="Kaynağı sil"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {konum} / {detay.total} {detay.unit === 'test' ? 'test' : 'sayfa'} · %{yuzde}
                {haftalik > 0 ? ` · haftalık plandan ${haftalik}` : ''}
                {book.endDate
                  ? ` · hedef ${new Date(book.endDate).toLocaleDateString('tr-TR')}`
                  : ''}
              </p>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${yuzde}%` }} />
              </div>
              <p className="mt-2 text-sm font-medium text-slate-700">
                {detay.subject || 'Bu ders'} soru bankasının %{yuzde}&apos;i tamamlandı.
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
