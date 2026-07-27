import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  PERIOD_TYPE_LABELS,
  type ActivityPeriodType,
  type ActivityStatus,
  setStudentActivityStatus
} from '../../lib/studentActivityApi';
import { getIstanbulDateString } from '../../lib/dailyReportTracking';

type Props = {
  studentId: string;
  studentName: string;
  coachId?: string;
  initialStatus: ActivityStatus;
  onClose: () => void;
  onSaved: () => void;
};

export function StudentActivityStatusModal({
  studentId,
  studentName,
  coachId,
  initialStatus,
  onClose,
  onSaved
}: Props) {
  const today = getIstanbulDateString();
  const nextStatus: ActivityStatus = initialStatus === 'active' ? 'passive' : 'active';
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [periodType, setPeriodType] = useState<ActivityPeriodType>('custom');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setStudentActivityStatus({
        student_id: studentId,
        status: nextStatus,
        start_date: startDate,
        end_date: endDate.trim() || null,
        period_type: periodType,
        passive_reason: nextStatus === 'passive' ? reason || null : null,
        note: note || null,
        coach_id: coachId
      });
      toast.success(
        nextStatus === 'passive'
          ? `${studentName} pasife alındı — Pasif Öğrenciler sekmesinde görünür.`
          : `${studentName} aktif yapıldı.`
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-900">
              {nextStatus === 'active' ? 'Aktif yap' : 'Pasif yap'}
            </h3>
            <p className="text-sm text-slate-500">{studentName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-xs text-slate-600">
            Geçmiş raporlar silinmez. Durum yalnızca seçilen tarihten itibaren geçerlidir.
          </p>
          <label className="block text-sm font-medium text-slate-700">
            {nextStatus === 'active' ? 'Aktiflik başlangıç' : 'Pasiflik başlangıç'}
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Bitiş (boş = süresiz)
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Dönem
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as ActivityPeriodType)}
            >
              {(Object.keys(PERIOD_TYPE_LABELS) as ActivityPeriodType[]).map((k) => (
                <option key={k} value={k}>
                  {PERIOD_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {nextStatus === 'passive' ? (
            <label className="block text-sm font-medium text-slate-700">
              Pasiflik nedeni
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Örn. yaz tatili, kayıt dondurma"
              />
            </label>
          ) : null}
          <label className="block text-sm font-medium text-slate-700">
            Açıklama
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Vazgeç
          </button>
          <button
            type="button"
            disabled={busy || !startDate}
            onClick={() => void save()}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              nextStatus === 'active' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800'
            }`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {nextStatus === 'active' ? 'Aktifleştir' : 'Pasife al'}
          </button>
        </div>
      </div>
    </div>
  );
}
