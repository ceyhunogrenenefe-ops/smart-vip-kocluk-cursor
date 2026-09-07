/**
 * Toplu Kitap Ekleme — görsel dropzone/paste + düzenleme grid + hepsini yükle.
 * Kitap Pazaryeri → Kitaplar sekmesine gömülür.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardPaste,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BULK_BOOK_CLASS_LEVELS,
  BULK_BOOK_SERIES,
  BULK_BOOK_SUBJECTS,
  createEmptyBulkRow,
  fileToBulkRow,
  submitBulkBooks,
  submitVendorBulkBooks,
  validateBulkRows,
  type BulkBookRow,
} from '../../lib/commerce/bulkBookUpload';
import { compressCoverImage, formatBytes, isLikelyImageFile } from '../../lib/commerce/compressCoverImage';

type Props = {
  /** admin = Kitap Pazaryeri; vendor = satıcı paneli */
  mode?: 'admin' | 'vendor';
  publishers?: string[];
  onClose: () => void;
  onDone: () => void;
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'tr')
  );
}

export default function BulkBookUploadPanel({ mode = 'admin', publishers = [], onClose, onDone }: Props) {
  const isVendor = mode === 'vendor';
  const [rows, setRows] = useState<BulkBookRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [applyPublisher, setApplyPublisher] = useState('');
  const [applySubject, setApplySubject] = useState('');
  const [applySeries, setApplySeries] = useState('');
  const [applyStock, setApplyStock] = useState('');
  const [submitForApproval, setSubmitForApproval] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const publisherOptions = useMemo(
    () =>
      uniqueSorted([
        ...publishers,
        ...rows.map((r) => r.publisher),
        'Yankı',
        'Paraf',
        'Palme',
        'Tonguç',
        'Karekök',
      ]),
    [publishers, rows]
  );

  const selectedCount = rows.filter((r) => r.selected).length;
  const successCount = rows.filter((r) => r.status === 'success').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;

  const patchRow = useCallback((localId: string, patch: Partial<BulkBookRow>) => {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
    setFieldErrors((prev) => {
      if (!prev[localId]) return prev;
      const next = { ...prev };
      delete next[localId];
      return next;
    });
  }, []);

  const removeRow = useCallback((localId: string) => {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[localId];
      return next;
    });
  }, []);

  const ingestFiles = useCallback(async (files: FileList | File[] | null | undefined) => {
    const raw = Array.from(files || []);
    if (!raw.length) {
      toast.error('Dosya seçilmedi');
      return;
    }
    const list = raw.filter((f) => isLikelyImageFile(f));
    if (!list.length) {
      toast.error(
        `Görsel bulunamadı (${raw.length} dosya). JPEG / PNG / WebP seçin. iPhone HEIC ise «En Uyumlu» formatına geçin.`
      );
      return;
    }
    setPreparing(true);
    let addedCount = 0;
    const failures: string[] = [];
    try {
      // Sırayla işle; her başarılı kapak hemen listede görünsün (mobilde “yüklenmiyor” hissini keser)
      for (const file of list) {
        try {
          const row = await fileToBulkRow(file);
          const normalized = isVendor
            ? {
                ...row,
                stock: row.stock || '10',
                classLevels: row.classLevels.length ? row.classLevels : ['LGS'],
              }
            : row;
          setRows((prev) => [...prev, normalized]);
          addedCount += 1;
        } catch (e) {
          failures.push(e instanceof Error ? e.message : `${file.name || 'foto'}: işlenemedi`);
        }
      }
      if (addedCount) {
        toast.success(`${addedCount} kapak eklendi — başlık, fiyat ve açıklamayı doldurun`);
      } else if (failures.length) {
        toast.error(failures.slice(0, 4).join(' · '), { duration: 9000 });
      }
      if (addedCount && failures.length) {
        toast.error(`${failures.length} görsel atlandı: ${failures.slice(0, 3).join(' · ')}`, {
          duration: 9000,
        });
      }
    } finally {
      setPreparing(false);
    }
  }, [isVendor]);

  const onPaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return;
      e.preventDefault();
      await ingestFiles(files);
    },
    [ingestFiles]
  );

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const handler = (ev: ClipboardEvent) => void onPaste(ev);
    el.addEventListener('paste', handler);
    window.addEventListener('paste', handler);
    return () => {
      el.removeEventListener('paste', handler);
      window.removeEventListener('paste', handler);
    };
  }, [onPaste]);

  const applyToSelected = (field: 'publisher' | 'subject' | 'series' | 'stock', value: string) => {
    if (!value.trim() && field !== 'series') {
      toast.error('Uygulanacak değer boş');
      return;
    }
    const targets = rows.filter((r) => r.selected && r.status !== 'success');
    if (!targets.length) {
      toast.error('Seçili satır yok');
      return;
    }
    setRows((prev) =>
      prev.map((r) => {
        if (!r.selected || r.status === 'success') return r;
        if (field === 'publisher') return { ...r, publisher: value };
        if (field === 'subject') return { ...r, subject: value };
        if (field === 'series') return { ...r, series: value };
        return { ...r, stock: value };
      })
    );
    toast.success(`${targets.length} satıra uygulandı`);
  };

  const replaceCover = async (localId: string, file: File | undefined) => {
    if (!file) return;
    try {
      const compressed = await compressCoverImage(file);
      patchRow(localId, {
        coverDataUrl: compressed.dataUrl,
        coverPreview: compressed.dataUrl,
        coverMeta: `${compressed.width}×${compressed.height} · ${formatBytes(compressed.bytesApprox)}`,
        status: 'draft',
        error: null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Görsel işlenemedi');
    }
  };

  const handleSubmit = async () => {
    const pending = rows.filter((r) => r.status !== 'success');
    if (!pending.length) {
      toast.message('Yüklenecek satır kalmadı');
      onDone();
      return;
    }
    const { ok, errors } = validateBulkRows(pending);
    if (!ok) {
      setFieldErrors(errors);
      toast.error('Zorunlu alanları doldurun (başlık, fiyat, kapak)');
      return;
    }
    setSubmitting(true);
    setProgress({ done: 0, total: pending.length });
    try {
      const progressCb = {
        concurrency: 1 as const,
        onProgress: (p: { done: number; total: number }) => setProgress({ done: p.done, total: p.total }),
        onRowUpdate: (row: BulkBookRow) => {
          setRows((prev) => prev.map((r) => (r.localId === row.localId ? row : r)));
        },
      };
      const result = isVendor
        ? await submitVendorBulkBooks(pending, { ...progressCb, submitForApproval })
        : await submitBulkBooks(pending, progressCb);
      if (result.failed === 0) {
        toast.success(
          isVendor
            ? `${result.ok} kitap yüklendi` + (submitForApproval ? ' ve onaya gönderildi' : ' (taslak teklif)')
            : `${result.ok} kitap mağazaya yüklendi`
        );
        onDone();
      } else {
        toast.error(`${result.ok} başarılı, ${result.failed} hata — hatalı satırları düzeltip tekrar deneyin`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAll = (selected: boolean) => {
    setRows((prev) => prev.map((r) => (r.status === 'success' ? r : { ...r, selected })));
  };

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Toplu kitap ekleme"
    >
      <div className="flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isVendor ? 'Toplu Kitap Yükle' : 'Toplu Kitap Ekleme'}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isVendor
                ? 'Fotoğrafları seçin; her kapak yanında başlık, fiyat ve açıklama girin. Hepsini tek seferde yükleyin.'
                : 'Kapakları sürükleyin, dosya seçin veya Ctrl+V ile yapıştırın. Satırları doldurup «Hepsini Yükle» deyin.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              void ingestFiles(e.dataTransfer.files);
            }}
            className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
              dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-gray-50/80'
            }`}
          >
            <ImagePlus className="mx-auto h-8 w-8 text-indigo-500" />
            <p className="mt-2 text-sm font-medium text-gray-800">Kapak görsellerini buraya bırakın</p>
            <p className="mt-1 text-xs text-gray-500">JPEG / PNG / WebP · birden fazla seçebilirsiniz · Ctrl+V yapıştır</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <label
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 ${
                  preparing || submitting ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                <Upload className="h-4 w-4" />
                Fotoğraf seç
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif"
                  multiple
                  className="sr-only"
                  disabled={preparing || submitting}
                  onChange={(e) => {
                    const files = e.target.files;
                    // Aynı dosyayı tekrar seçebilsin
                    const list = files ? Array.from(files) : [];
                    e.target.value = '';
                    if (list.length) void ingestFiles(list);
                    else toast.error('Dosya seçilmedi');
                  }}
                />
              </label>
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <ClipboardPaste className="h-3.5 w-3.5" /> veya panodan yapıştır
              </span>
            </div>
            {preparing ? (
              <p className="mt-3 inline-flex items-center gap-2 text-xs text-indigo-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Görseller hazırlanıyor… (birkaç saniye sürebilir)
              </p>
            ) : null}
          </div>

          {rows.length > 0 ? (
            <>
              {!isVendor ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-700">
                    Seçili satırlara uygula ({selectedCount}/{rows.length})
                  </p>
                  <div className="flex gap-2 text-xs">
                    <button type="button" className="text-indigo-700 hover:underline" onClick={() => toggleAll(true)}>
                      Tümünü seç
                    </button>
                    <button type="button" className="text-slate-600 hover:underline" onClick={() => toggleAll(false)}>
                      Seçimi kaldır
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex gap-1">
                    <input
                      list="bulk-publisher-options"
                      className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
                      placeholder="Yayınevi"
                      value={applyPublisher}
                      onChange={(e) => setApplyPublisher(e.target.value)}
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-lg bg-white px-2 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                      onClick={() => applyToSelected('publisher', applyPublisher)}
                    >
                      Uygula
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <select
                      className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
                      value={applySubject}
                      onChange={(e) => setApplySubject(e.target.value)}
                    >
                      <option value="">Ders / konu</option>
                      {BULK_BOOK_SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg bg-white px-2 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                      onClick={() => applyToSelected('subject', applySubject)}
                    >
                      Uygula
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <select
                      className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
                      value={applySeries}
                      onChange={(e) => setApplySeries(e.target.value)}
                    >
                      {BULK_BOOK_SERIES.map((s) => (
                        <option key={s.value || 'none'} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg bg-white px-2 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                      onClick={() => applyToSelected('series', applySeries)}
                    >
                      Uygula
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min={0}
                      className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
                      placeholder="Stok"
                      value={applyStock}
                      onChange={(e) => setApplyStock(e.target.value)}
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-lg bg-white px-2 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                      onClick={() => applyToSelected('stock', applyStock)}
                    >
                      Uygula
                    </button>
                  </div>
                </div>
              </div>
              ) : null}

              {isVendor ? (
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                {rows.map((row) => {
                  const err = fieldErrors[row.localId] || row.error;
                  const locked = row.status === 'success' || submitting;
                  return (
                    <div
                      key={row.localId}
                      className={`flex gap-3 rounded-2xl border p-3 ${
                        err ? 'border-rose-300 bg-rose-50/40' : row.status === 'success' ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="shrink-0">
                        <div className="relative h-28 w-20 overflow-hidden rounded-lg border bg-gray-50">
                          {row.coverPreview ? (
                            <img src={row.coverPreview} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-gray-400">Kapak</div>
                          )}
                        </div>
                        {!locked ? (
                          <label className="mt-1 block cursor-pointer text-center text-[10px] text-indigo-700 hover:underline">
                            Değiştir
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                void replaceCover(row.localId, f);
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <input
                            className="w-full rounded-lg border px-2.5 py-1.5 text-sm font-medium disabled:bg-gray-50"
                            value={row.title}
                            disabled={locked}
                            onChange={(e) => patchRow(row.localId, { title: e.target.value })}
                            placeholder="Kitap başlığı *"
                          />
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => removeRow(row.localId)}
                            className="shrink-0 rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                            aria-label="Kaldır"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-28 shrink-0">
                            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-gray-500">Fiyat ₺ *</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-full rounded-lg border px-2 py-1.5 text-sm disabled:bg-gray-50"
                              value={row.priceLira}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { priceLira: e.target.value })}
                              placeholder="0"
                            />
                          </div>
                          <div className="w-20 shrink-0">
                            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-gray-500">Stok</label>
                            <input
                              type="number"
                              min={0}
                              className="w-full rounded-lg border px-2 py-1.5 text-sm disabled:bg-gray-50"
                              value={row.stock}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { stock: e.target.value })}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-gray-500">Yayınevi</label>
                            <input
                              className="w-full rounded-lg border px-2 py-1.5 text-sm disabled:bg-gray-50"
                              value={row.publisher}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { publisher: e.target.value })}
                              placeholder="Opsiyonel"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-gray-500">Açıklama</label>
                          <textarea
                            rows={2}
                            className="w-full resize-y rounded-lg border px-2.5 py-1.5 text-sm disabled:bg-gray-50"
                            value={row.description}
                            disabled={locked}
                            onChange={(e) => patchRow(row.localId, { description: e.target.value })}
                            placeholder="Kısa açıklama (öğrenci/veli görür)"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {BULK_BOOK_CLASS_LEVELS.slice(0, 10).map((lv) => {
                            const on = row.classLevels.includes(lv);
                            return (
                              <button
                                key={lv}
                                type="button"
                                disabled={locked}
                                onClick={() =>
                                  patchRow(row.localId, {
                                    classLevels: on
                                      ? row.classLevels.filter((x) => x !== lv)
                                      : [...row.classLevels, lv],
                                  })
                                }
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  on ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                                } disabled:opacity-50`}
                              >
                                {lv}
                              </button>
                            );
                          })}
                          <span className="ml-auto text-xs text-gray-500">
                            {row.status === 'uploading' ? 'Yükleniyor…' : null}
                            {row.status === 'success' ? 'Tamam' : null}
                            {row.status === 'error' ? 'Hata' : null}
                            {row.status === 'draft' ? 'Hazır' : null}
                          </span>
                        </div>
                        {err ? <p className="text-[11px] text-rose-600">{err}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="px-2 py-2 w-8" />
                      <th className="px-2 py-2 w-20">Kapak</th>
                      <th className="px-2 py-2">Kitap adı *</th>
                      <th className="px-2 py-2">Yayınevi</th>
                      <th className="px-2 py-2 w-28">Fiyat ₺ *</th>
                      <th className="px-2 py-2 w-20">Stok</th>
                      <th className="px-2 py-2">ISBN</th>
                      <th className="px-2 py-2">Açıklama</th>
                      <th className="px-2 py-2 w-24">Durum</th>
                      <th className="px-2 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const err = fieldErrors[row.localId] || row.error;
                      const locked = row.status === 'success' || submitting;
                      return (
                        <tr
                          key={row.localId}
                          className={`border-t align-top ${err ? 'bg-rose-50/40' : ''} ${
                            row.status === 'success' ? 'bg-emerald-50/40' : ''
                          }`}
                        >
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={row.status === 'success'}
                              onChange={(e) => patchRow(row.localId, { selected: e.target.checked })}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="relative h-16 w-12 overflow-hidden rounded border bg-white">
                              {row.coverPreview ? (
                                <img src={row.coverPreview} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[10px] text-gray-400">Yok</div>
                              )}
                            </div>
                            {!locked ? (
                              <label className="mt-1 block cursor-pointer text-[10px] text-indigo-700 hover:underline">
                                Değiştir
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    e.target.value = '';
                                    void replaceCover(row.localId, f);
                                  }}
                                />
                              </label>
                            ) : null}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded border px-2 py-1.5 text-sm disabled:bg-gray-50"
                              value={row.title}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { title: e.target.value })}
                              placeholder="Kitap adı"
                            />
                            <div className="mt-1 flex flex-wrap gap-1">
                              {BULK_BOOK_CLASS_LEVELS.slice(0, 8).map((lv) => {
                                const on = row.classLevels.includes(lv);
                                return (
                                  <button
                                    key={lv}
                                    type="button"
                                    disabled={locked}
                                    onClick={() =>
                                      patchRow(row.localId, {
                                        classLevels: on
                                          ? row.classLevels.filter((x) => x !== lv)
                                          : [...row.classLevels, lv],
                                      })
                                    }
                                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                                      on ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                                    } disabled:opacity-50`}
                                  >
                                    {lv}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              list="bulk-publisher-options"
                              className="mb-1 w-full rounded border px-2 py-1.5 text-sm disabled:bg-gray-50"
                              value={row.publisher}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { publisher: e.target.value })}
                              placeholder="Yayınevi"
                            />
                            <select
                              className="w-full rounded border px-2 py-1 text-xs disabled:bg-gray-50"
                              value={row.subject}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { subject: e.target.value })}
                            >
                              <option value="">Ders</option>
                              {BULK_BOOK_SUBJECTS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <select
                              className="mt-1 w-full rounded border px-2 py-1 text-xs disabled:bg-gray-50"
                              value={row.series}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { series: e.target.value })}
                            >
                              {BULK_BOOK_SERIES.map((s) => (
                                <option key={s.value || 'none'} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-full rounded border px-2 py-1.5 text-sm disabled:bg-gray-50"
                              value={row.priceLira}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { priceLira: e.target.value })}
                              placeholder="0"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              className="w-full rounded border px-2 py-1.5 text-sm disabled:bg-gray-50"
                              value={row.stock}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { stock: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded border px-2 py-1.5 text-sm disabled:bg-gray-50"
                              value={row.isbn}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { isbn: e.target.value })}
                              placeholder="ISBN"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <textarea
                              rows={2}
                              className="w-full resize-y rounded border px-2 py-1.5 text-xs disabled:bg-gray-50"
                              value={row.description}
                              disabled={locked}
                              onChange={(e) => patchRow(row.localId, { description: e.target.value })}
                              placeholder="Kısa açıklama"
                            />
                            {err ? <p className="mt-1 text-[11px] text-rose-600">{err}</p> : null}
                          </td>
                          <td className="px-2 py-2">
                            {row.status === 'uploading' ? (
                              <span className="inline-flex items-center gap-1 text-xs text-indigo-700">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Yükleniyor
                              </span>
                            ) : null}
                            {row.status === 'success' ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Tamam
                              </span>
                            ) : null}
                            {row.status === 'error' ? (
                              <span className="inline-flex items-center gap-1 text-xs text-rose-700">
                                <XCircle className="h-3.5 w-3.5" /> Hata
                              </span>
                            ) : null}
                            {row.status === 'draft' ? (
                              <span className="text-xs text-gray-400">Hazır</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => removeRow(row.localId)}
                              className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                              aria-label="Satırı sil"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
              <datalist id="bulk-publisher-options">
                {publisherOptions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          ) : (
            <p className="text-center text-sm text-gray-500">Henüz satır yok — önce kapak görselleri ekleyin.</p>
          )}
        </div>

        <div className="border-t px-4 py-3 sm:px-5">
          {submitting ? (
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-gray-600">
                <span>Yükleniyor…</span>
                <span>
                  {progress.done}/{progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{
                    width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {rows.length} satır
              {successCount ? ` · ${successCount} başarılı` : ''}
              {errorCount ? ` · ${errorCount} hatalı` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {isVendor ? (
                <label className="mr-auto flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={submitForApproval}
                    onChange={(e) => setSubmitForApproval(e.target.checked)}
                    disabled={submitting}
                  />
                  Yükledikten sonra onaya gönder
                </label>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || preparing || rows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isVendor ? 'Hepsini Toplu Yükle' : 'Hepsini Yükle'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Test / demo için boş satır factory re-export */
export { createEmptyBulkRow };
