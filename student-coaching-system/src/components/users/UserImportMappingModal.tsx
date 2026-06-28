import React, { useEffect, useMemo, useState } from 'react';
import { X, Wand2, Loader2 } from 'lucide-react';
import {
  USER_IMPORT_FIELD_OPTIONS,
  cellValueToString,
  columnLetter,
  colMapToMappingArray,
  suggestColumnMapping,
  type UserImportColumnKey
} from '../../lib/userBulkImport';

type Props = {
  open: boolean;
  grid: unknown[][];
  fileName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (headerRowIndex: number, mappings: (UserImportColumnKey | '')[]) => void;
};

export function UserImportMappingModal({
  open,
  grid,
  fileName,
  busy,
  onClose,
  onConfirm
}: Props) {
  const colCount = useMemo(() => {
    let max = 0;
    for (const row of grid.slice(0, 12)) {
      if (Array.isArray(row)) max = Math.max(max, row.length);
    }
    return Math.max(max, 1);
  }, [grid]);

  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mappings, setMappings] = useState<(UserImportColumnKey | '')[]>(() =>
    Array.from({ length: colCount }, () => '')
  );

  useEffect(() => {
    if (!open) return;
    setHeaderRowIndex(0);
  }, [open, fileName]);

  useEffect(() => {
    if (!open) return;
    if (headerRowIndex >= 0) {
      const headerRow = grid[headerRowIndex] || [];
      const suggested = suggestColumnMapping(headerRow);
      setMappings(colMapToMappingArray(colCount, suggested));
    } else {
      setMappings(Array.from({ length: colCount }, () => ''));
    }
  }, [open, headerRowIndex, grid, colCount]);

  const previewRows = useMemo(() => {
    const start = headerRowIndex >= 0 ? headerRowIndex : 0;
    return grid.slice(start, start + 6);
  }, [grid, headerRowIndex]);

  const columnLabels = useMemo(() => {
    if (headerRowIndex >= 0) {
      const hdr = grid[headerRowIndex] || [];
      return Array.from({ length: colCount }, (_, i) => {
        const v = cellValueToString(hdr[i]);
        return v || `Sütun ${columnLetter(i)}`;
      });
    }
    return Array.from({ length: colCount }, (_, i) => `Sütun ${columnLetter(i)}`);
  }, [grid, headerRowIndex, colCount]);

  const mappedFields = useMemo(() => new Set(mappings.filter(Boolean)), [mappings]);

  const missingRequired = USER_IMPORT_FIELD_OPTIONS.filter(
    (o) => o.required && o.key && !mappedFields.has(o.key)
  );

  const handleMappingChange = (colIdx: number, value: UserImportColumnKey | '') => {
    setMappings((prev) => {
      const next = [...prev];
      while (next.length < colCount) next.push('');
      if (value) {
        for (let i = 0; i < next.length; i++) {
          if (i !== colIdx && next[i] === value) next[i] = '';
        }
      }
      next[colIdx] = value;
      return next;
    });
  };

  const applyAutoMapping = () => {
    if (headerRowIndex < 0) return;
    const headerRow = grid[headerRowIndex] || [];
    const suggested = suggestColumnMapping(headerRow);
    setMappings(colMapToMappingArray(colCount, suggested));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Sütun eşleştirme</h2>
            <p className="mt-0.5 text-sm text-slate-500 truncate max-w-md">{fileName}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Başlık satırı</span>
              <select
                value={headerRowIndex}
                onChange={(e) => setHeaderRowIndex(Number(e.target.value))}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value={0}>1. satır (başlık)</option>
                {grid.length > 1 ? <option value={1}>2. satır (başlık)</option> : null}
                {grid.length > 2 ? <option value={2}>3. satır (başlık)</option> : null}
                <option value={-1}>Başlık yok — sütun harfi (A, B, C…)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={applyAutoMapping}
              disabled={busy || headerRowIndex < 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />
              Otomatik eşle
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Her sütunun altındaki menüden alan seçin (Ad, Soyad, Mail, Şifre, Veli adı vb.). Sütun sırası
            farklı olsa da eşleştirerek yükleyebilirsiniz.
          </p>

          {missingRequired.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Eksik zorunlu alan: {missingRequired.map((o) => o.label).join(', ')}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left text-xs font-medium text-slate-500 w-16">
                    Satır
                  </th>
                  {Array.from({ length: colCount }, (_, colIdx) => (
                    <th key={colIdx} className="min-w-[140px] px-2 py-2 text-left align-top">
                      <div className="mb-1 truncate text-xs font-semibold text-slate-700" title={columnLabels[colIdx]}>
                        {columnLabels[colIdx]}
                      </div>
                      <select
                        value={mappings[colIdx] || ''}
                        onChange={(e) =>
                          handleMappingChange(colIdx, e.target.value as UserImportColumnKey | '')
                        }
                        disabled={busy}
                        className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs"
                      >
                        {USER_IMPORT_FIELD_OPTIONS.map((opt) => (
                          <option key={opt.key || '_skip'} value={opt.key}>
                            {opt.label}
                            {opt.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => {
                  const absRow =
                    headerRowIndex >= 0 ? headerRowIndex + ri + 1 : ri + 1;
                  const isHeader = headerRowIndex >= 0 && ri === 0;
                  return (
                    <tr
                      key={ri}
                      className={isHeader ? 'bg-blue-50/60 font-medium' : ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                    >
                      <td className="sticky left-0 z-10 bg-inherit px-2 py-1.5 text-xs text-slate-500">
                        {absRow}
                        {isHeader ? ' · başlık' : ''}
                      </td>
                      {Array.from({ length: colCount }, (_, colIdx) => (
                        <td key={colIdx} className="max-w-[160px] truncate px-2 py-1.5 text-xs text-slate-700">
                          {cellValueToString((row || [])[colIdx]) || '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            İptal
          </button>
          <button
            type="button"
            disabled={busy || missingRequired.length > 0}
            onClick={() => onConfirm(headerRowIndex, mappings)}
            className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Yükleniyor…' : 'Eşleştir ve içe aktar'}
          </button>
        </div>
      </div>
    </div>
  );
}
