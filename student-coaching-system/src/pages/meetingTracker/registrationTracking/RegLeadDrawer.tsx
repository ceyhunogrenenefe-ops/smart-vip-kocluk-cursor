import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  rtGetLead,
  rtUpdateLead,
  rtAddInteraction,
  rtCreateTask,
  rtCompleteTask,
  rtConfirmLead,
  rtMarkLost,
  type RegLeadDetail
} from '../../../lib/registrationTrackingApi';
import {
  GRADE_PROGRAMS,
  GRADE_LABEL,
  STAGE_LABELS,
  TEMPERATURE_LABELS,
  LOST_REASON_LABELS,
  formatIstanbul,
  formatTry
} from '../../../lib/registrationTrackingConfig';

type Props = {
  leadId: string | null;
  isManager: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

type Tab = 'general' | 'interactions' | 'tasks' | 'meetings' | 'pricing' | 'audit';

export default function RegLeadDrawer({ leadId, isManager, onClose, onUpdated }: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<RegLeadDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showLost, setShowLost] = useState(false);

  const load = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const { data } = await rtGetLead(leadId);
      setDetail(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [leadId]);

  if (!leadId) return null;

  const lead = detail?.lead;

  const saveGeneral = async (patch: Record<string, unknown>) => {
    if (!leadId) return;
    setSaving(true);
    try {
      await rtUpdateLead(leadId, patch);
      toast.success('Kaydedildi');
      await load();
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'Genel Bilgiler' },
    { id: 'interactions', label: 'Görüşme Geçmişi' },
    { id: 'tasks', label: 'Görevler' },
    { id: 'meetings', label: 'Toplantılar' },
    { id: 'pricing', label: 'Teklif/Ücret' },
    { id: 'audit', label: 'İşlem Geçmişi' }
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {lead?.full_name || 'Kayıt adayı'}
          </h2>
          {lead && (
            <p className="text-xs text-slate-500">
              {GRADE_LABEL[lead.grade_program]} · {STAGE_LABELS[lead.stage]}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 py-2 dark:border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === t.id
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        )}

        {!loading && lead && tab === 'general' && (
          <GeneralForm lead={lead} saving={saving} onSave={saveGeneral} isManager={isManager} />
        )}

        {!loading && tab === 'interactions' && (
          <InteractionsTab
            items={detail?.interactions || []}
            leadId={leadId}
            onAdded={() => {
              load();
              onUpdated();
            }}
          />
        )}

        {!loading && tab === 'tasks' && (
          <TasksTab
            items={detail?.tasks || []}
            leadId={leadId}
            onChanged={() => {
              load();
              onUpdated();
            }}
          />
        )}

        {!loading && tab === 'meetings' && (
          <div className="space-y-2 text-sm">
            {(detail?.meeting_links || []).length === 0 && (
              <p className="text-slate-500">Henüz toplantı gündemine eklenmedi.</p>
            )}
            {(detail?.meeting_links || []).map((m) => (
              <div key={String(m.id)} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="font-medium">{String(m.discussion_topic || 'Gündem maddesi')}</div>
                {m.decision && <p className="mt-1 text-slate-600">Karar: {String(m.decision)}</p>}
                <p className="text-xs text-slate-500">Durum: {String(m.status)}</p>
              </div>
            ))}
          </div>
        )}

        {!loading && lead && tab === 'pricing' && isManager && (
          <PricingForm lead={lead} saving={saving} onSave={saveGeneral} />
        )}

        {!loading && tab === 'audit' && (
          <div className="space-y-2 text-xs">
            {(detail?.audit_logs || []).map((a) => (
              <div key={String(a.id)} className="rounded border border-slate-200 p-2 dark:border-slate-700">
                <div className="font-medium">{String(a.action)}</div>
                <div className="text-slate-500">{formatIstanbul(String(a.created_at))}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lead?.primary_status === 'tracking' && isManager && (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Kesin Kayda Dönüştür
          </button>
          <button
            type="button"
            onClick={() => setShowLost(true)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600"
          >
            Olumsuz Sonuçlandır
          </button>
        </div>
      )}

      {showConfirm && lead && (
        <ConfirmModal
          lead={lead}
          onClose={() => setShowConfirm(false)}
          onDone={() => {
            setShowConfirm(false);
            load();
            onUpdated();
          }}
        />
      )}

      {showLost && lead && (
        <LostModal
          leadId={lead.id}
          onClose={() => setShowLost(false)}
          onDone={() => {
            setShowLost(false);
            onClose();
            onUpdated();
          }}
        />
      )}
    </div>
  );
}

function GeneralForm({
  lead,
  saving,
  onSave,
  isManager
}: {
  lead: RegLeadDetail['lead'];
  saving: boolean;
  onSave: (p: Record<string, unknown>) => void;
  isManager: boolean;
}) {
  const [form, setForm] = useState({ ...lead });

  useEffect(() => setForm({ ...lead }), [lead.id]);

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-slate-500">Ad</span>
          <input
            className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            disabled={!isManager}
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Soyad</span>
          <input
            className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            disabled={!isManager}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-slate-500">Veli adı soyadı</span>
        <input
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.parent_full_name || ''}
          onChange={(e) => setForm({ ...form, parent_full_name: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Telefon</span>
        <input
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.phone || ''}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Sınıf / Program</span>
        <select
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.grade_program}
          onChange={(e) => setForm({ ...form, grade_program: e.target.value })}
        >
          {GRADE_PROGRAMS.map((g) => (
            <option key={g.code} value={g.code}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Aşama</span>
        <select
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.stage}
          onChange={(e) => setForm({ ...form, stage: e.target.value })}
        >
          {Object.entries(STAGE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Sıcaklık</span>
        <select
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.temperature}
          onChange={(e) => setForm({ ...form, temperature: e.target.value as RegLeadDetail['lead']['temperature'] })}
        >
          {Object.entries(TEMPERATURE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Notlar</span>
        <textarea
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          rows={3}
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </label>
      {isManager && (
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      )}
    </form>
  );
}

function PricingForm({
  lead,
  saving,
  onSave
}: {
  lead: RegLeadDetail['lead'];
  saving: boolean;
  onSave: (p: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    offered_price: lead.offered_price ?? '',
    discount_amount: lead.discount_amount ?? '',
    final_offer_amount: lead.final_offer_amount ?? ''
  });

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          offered_price: form.offered_price === '' ? null : Number(form.offered_price),
          discount_amount: form.discount_amount === '' ? null : Number(form.discount_amount),
          final_offer_amount: form.final_offer_amount === '' ? null : Number(form.final_offer_amount)
        });
      }}
    >
      <label className="block">
        <span className="text-xs text-slate-500">Sunulan ücret</span>
        <input
          type="number"
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.offered_price}
          onChange={(e) => setForm({ ...form, offered_price: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">İndirim</span>
        <input
          type="number"
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.discount_amount}
          onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Nihai teklif</span>
        <input
          type="number"
          className="mt-0.5 w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
          value={form.final_offer_amount}
          onChange={(e) => setForm({ ...form, final_offer_amount: e.target.value })}
        />
      </label>
      <p className="text-xs text-slate-500">
        Mevcut: {formatTry(lead.final_offer_amount ?? lead.offered_price)}
      </p>
      <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-white">
        Kaydet
      </button>
    </form>
  );
}

function InteractionsTab({
  items,
  leadId,
  onAdded
}: {
  items: Array<Record<string, unknown>>;
  leadId: string;
  onAdded: () => void;
}) {
  const [note, setNote] = useState('');

  const add = async () => {
    if (!note.trim()) return;
    try {
      await rtAddInteraction({
        lead_id: leadId,
        interaction_type: 'system_note',
        title: 'Not',
        description: note
      });
      setNote('');
      toast.success('Eklendi');
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eklenemedi');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          placeholder="Görüşme notu ekle…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" onClick={add} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white">
          Ekle
        </button>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={String(it.id)} className="rounded-lg border-l-4 border-indigo-400 bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <div className="font-medium">{String(it.title || it.interaction_type)}</div>
            <div className="text-xs text-slate-500">{formatIstanbul(String(it.interaction_at))}</div>
            {it.description && <p className="mt-1 text-slate-700 dark:text-slate-300">{String(it.description)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksTab({
  items,
  leadId,
  onChanged
}: {
  items: Array<Record<string, unknown>>;
  leadId: string;
  onChanged: () => void;
}) {
  const complete = async (taskId: string) => {
    const result = window.prompt('Görüşme sonucu:');
    if (result === null) return;
    try {
      await rtCompleteTask({ task_id: taskId, result });
      toast.success('Görev tamamlandı');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tamamlanamadı');
    }
  };

  const create = async () => {
    const title = window.prompt('Görev başlığı:');
    if (!title) return;
    const due = window.prompt('Son tarih (YYYY-MM-DD):');
    try {
      await rtCreateTask({
        lead_id: leadId,
        title,
        task_type: 'call_parent',
        due_at: due ? `${due}T10:00:00+03:00` : null
      });
      toast.success('Görev oluşturuldu');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı');
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={create} className="rounded-lg border px-3 py-1.5 text-sm">
        + Sonraki işlem ekle
      </button>
      {items.map((t) => {
        const overdue =
          t.status !== 'completed' && t.due_at && new Date(String(t.due_at)).getTime() < Date.now();
        return (
          <div
            key={String(t.id)}
            className={`rounded-lg border p-3 text-sm ${overdue ? 'border-red-400 bg-red-50 dark:bg-red-950/30' : 'border-slate-200 dark:border-slate-700'}`}
          >
            <div className="font-medium">{String(t.title)}</div>
            <div className="text-xs text-slate-500">{formatIstanbul(String(t.due_at))}</div>
            {t.status !== 'completed' && (
              <button
                type="button"
                onClick={() => complete(String(t.id))}
                className="mt-2 text-xs text-indigo-600 hover:underline"
              >
                Tamamla
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConfirmModal({
  lead,
  onClose,
  onDone
}: {
  lead: RegLeadDetail['lead'];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    grade_program: lead.grade_program,
    academic_period_key: lead.academic_period_key || '',
    confirmed_at: new Date().toISOString().slice(0, 10),
    total_amount: lead.offered_price ?? '',
    discount_amount: lead.discount_amount ?? '',
    final_amount: lead.final_offer_amount ?? '',
    down_payment: '',
    create_student: true,
    notes: ''
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await rtConfirmLead({
        lead_id: lead.id,
        grade_program: form.grade_program,
        academic_period_key: form.academic_period_key || null,
        confirmed_at: `${form.confirmed_at}T12:00:00+03:00`,
        total_amount: form.total_amount === '' ? null : Number(form.total_amount),
        discount_amount: form.discount_amount === '' ? null : Number(form.discount_amount),
        final_amount: form.final_amount === '' ? null : Number(form.final_amount),
        down_payment: form.down_payment === '' ? null : Number(form.down_payment),
        create_student: form.create_student,
        student_first_name: lead.first_name,
        student_last_name: lead.last_name,
        notes: form.notes
      });
      toast.success('Kesin kayıt tamamlandı');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 dark:bg-slate-900">
        <h3 className="text-lg font-semibold">Kesin Kayda Dönüştür</h3>
        <p className="mt-1 text-sm text-slate-500">{lead.full_name}</p>
        <div className="mt-4 space-y-2 text-sm">
          <select
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.grade_program}
            onChange={(e) => setForm({ ...form, grade_program: e.target.value })}
          >
            {GRADE_PROGRAMS.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.confirmed_at}
            onChange={(e) => setForm({ ...form, confirmed_at: e.target.value })}
          />
          <input
            type="number"
            placeholder="Toplam bedel"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.total_amount}
            onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
          />
          <input
            type="number"
            placeholder="İndirim"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.discount_amount}
            onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
          />
          <input
            type="number"
            placeholder="Nihai bedel"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.final_amount}
            onChange={(e) => setForm({ ...form, final_amount: e.target.value })}
          />
          <input
            type="number"
            placeholder="Peşinat"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            value={form.down_payment}
            onChange={(e) => setForm({ ...form, down_payment: e.target.value })}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.create_student}
              onChange={(e) => setForm({ ...form, create_student: e.target.checked })}
            />
            Yeni öğrenci hesabı oluştur
          </label>
          <textarea
            placeholder="Açıklama"
            className="w-full rounded border px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            İptal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}

function LostModal({
  leadId,
  onClose,
  onDone
}: {
  leadId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('price_high');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason === 'other' && !desc.trim()) {
      toast.error('Diğer nedeni için açıklama zorunlu');
      return;
    }
    setBusy(true);
    try {
      await rtMarkLost({ lead_id: leadId, lost_reason: reason, lost_description: desc || null });
      toast.success('Olumsuz olarak işaretlendi');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 dark:bg-slate-900">
        <h3 className="text-lg font-semibold">Olumsuz Sonuçlandır</h3>
        <select
          className="mt-3 w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {Object.entries(LOST_REASON_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <textarea
          className="mt-2 w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          placeholder="Açıklama (Diğer seçilirse zorunlu)"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">
            İptal
          </button>
          <button type="button" disabled={busy} onClick={submit} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}
