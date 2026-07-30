import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Loader2, Send, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/session';

type ScopedClass = {
  id: string;
  name: string;
  active_student_count: number;
};

type GatewayBulkPlan = {
  id: string;
  label: string;
  is_active: boolean;
  message_template: string;
  send_hour_tr: number;
  send_minute_tr: number;
  target_class_ids?: string[];
};

type SendMode = 'now' | 'daily';

type Props = {
  gatewayConnected?: boolean;
};

async function parseJson<T>(res: Response): Promise<T> {
  const j = (await res.json().catch(() => ({}))) as T & { error?: string; hint?: string };
  if (!res.ok) {
    throw new Error(j.hint || j.error || res.statusText || 'İstek başarısız');
  }
  return j;
}

export default function GatewayBulkMessageCard({ gatewayConnected }: Props) {
  const [classes, setClasses] = useState<ScopedClass[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState('');
  const [sendMode, setSendMode] = useState<SendMode>('now');
  const [sendHour, setSendHour] = useState(22);
  const [sendMinute, setSendMinute] = useState(0);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(
    null
  );
  const [plans, setPlans] = useState<GatewayBulkPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const scheduleLockRef = useRef(false);

  const classIds = useMemo(() => [...selectedClassIds], [selectedClassIds]);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      const res = await apiFetch('/api/coach-whatsapp-gateway-bulk?action=classes');
      const j = await parseJson<{ data: ScopedClass[] }>(res);
      setClasses(j.data || []);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Sınıflar yüklenemedi');
      setClasses([]);
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const res = await apiFetch('/api/coach-whatsapp-gateway-bulk?action=plans');
      const j = await parseJson<{ data: GatewayBulkPlan[] }>(res);
      setPlans(j.data || []);
    } catch {
      setPlans([]);
    } finally {
      setPlansLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClasses();
    void loadPlans();
  }, [loadClasses, loadPlans]);

  useEffect(() => {
    if (!classIds.length) {
      setRecipientCount(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void apiFetch('/api/coach-whatsapp-gateway-bulk?action=preview', {
      method: 'POST',
      body: JSON.stringify({ class_ids: classIds })
    })
      .then((res) => parseJson<{ total: number }>(res))
      .then((j) => {
        if (!cancelled) setRecipientCount(j.total);
      })
      .catch(() => {
        if (!cancelled) setRecipientCount(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classIds]);

  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setSendResult(null);
    setNotice('');
  };

  const handleSendNow = async () => {
    const text = message.trim();
    if (!text) {
      setNotice('Mesaj boş olamaz.');
      return;
    }
    if (!classIds.length) {
      setNotice('En az bir sınıf seçin.');
      return;
    }
    const total = recipientCount ?? 0;
    if (!total) {
      setNotice('Gönderilecek aktif öğrenci bulunamadı.');
      return;
    }
    const ok = window.confirm(
      `Bu mesaj ${total} öğrenciye Gateway üzerinden gönderilecek. Onaylıyor musunuz?`
    );
    if (!ok) return;

    setBusy(true);
    setNotice('');
    setSendResult(null);
    try {
      const res = await apiFetch('/api/coach-whatsapp-gateway-bulk?action=send', {
        method: 'POST',
        body: JSON.stringify({ class_ids: classIds, message: text })
      });
      const j = await parseJson<{ sent: number; failed: number; total: number }>(res);
      setSendResult({ sent: j.sent, failed: j.failed, total: j.total });
      setNotice(`Gönderim tamamlandı: ${j.sent} başarılı, ${j.failed} başarısız.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Gönderim başarısız');
    } finally {
      setBusy(false);
    }
  };

  const handleScheduleDaily = async () => {
    if (scheduleLockRef.current) return;
    const text = message.trim();
    if (!text) {
      setNotice('Mesaj boş olamaz.');
      return;
    }
    if (!classIds.length) {
      setNotice('En az bir sınıf seçin.');
      return;
    }
    scheduleLockRef.current = true;
    setBusy(true);
    setNotice('');
    try {
      const idempotencyKey = `${Date.now()}-${classIds.join(',')}-${sendHour}:${sendMinute}`;
      const res = await apiFetch('/api/coach-whatsapp-gateway-bulk?action=schedule', {
        method: 'POST',
        body: JSON.stringify({
          class_ids: classIds,
          message: text,
          send_hour_tr: sendHour,
          send_minute_tr: sendMinute,
          idempotency_key: idempotencyKey,
          label: `Günlük ${String(sendHour).padStart(2, '0')}:${String(sendMinute).padStart(2, '0')}`
        })
      });
      await parseJson(res);
      setNotice(
        `Günlük plan kaydedildi — her gün ${String(sendHour).padStart(2, '0')}:${String(sendMinute).padStart(2, '0')} (İstanbul).`
      );
      void loadPlans();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Plan kaydedilemedi');
    } finally {
      setBusy(false);
      window.setTimeout(() => {
        scheduleLockRef.current = false;
      }, 1500);
    }
  };

  const togglePlanActive = async (plan: GatewayBulkPlan) => {
    try {
      await apiFetch('/api/coach-whatsapp-gateway-bulk?action=update-plan', {
        method: 'POST',
        body: JSON.stringify({ plan_id: plan.id, is_active: !plan.is_active })
      });
      void loadPlans();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Plan güncellenemedi');
    }
  };

  const deletePlan = async (planId: string) => {
    if (!window.confirm('Bu günlük planı silmek istediğinize emin misiniz?')) return;
    try {
      await apiFetch('/api/coach-whatsapp-gateway-bulk?action=delete-plan', {
        method: 'POST',
        body: JSON.stringify({ plan_id: planId })
      });
      void loadPlans();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Plan silinemedi');
    }
  };

  const charCount = message.length;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50/60 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
          <Send className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Gateway Toplu Mesaj</h2>
          <p className="text-xs text-slate-600">
            Yalnızca bağlı Gateway oturumunuz üzerinden — Meta şablonu kullanılmaz.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {!gatewayConnected ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Aktif Gateway bağlantısı bulunamadı. Lütfen Gateway bağlantınızı kontrol edin.
          </p>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">Sınıf seçimi</p>
          {loadingClasses ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sınıflar yükleniyor…
            </p>
          ) : classes.length === 0 ? (
            <p className="text-sm text-slate-500">Yetkili sınıf bulunamadı.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => {
                const on = selectedClassIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleClass(c.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                      on
                        ? 'bg-teal-600 text-white ring-teal-600'
                        : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {c.name} — {c.active_student_count} öğrenci
                  </button>
                );
              })}
            </div>
          )}
          {classIds.length > 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              {previewLoading ? (
                'Alıcı sayısı hesaplanıyor…'
              ) : (
                <>
                  Toplam <strong>{recipientCount ?? 0}</strong> öğrenciye gönderilecek
                  {recipientCount !== null && recipientCount > 0 ? ' (mükerrerler elendi)' : ''}
                </>
              )}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-800">Mesaj</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Mesajınızı yazın…"
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
          />
          <p className="mt-1 text-[11px] text-slate-500">{charCount} karakter</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">Gönderim</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSendMode('now')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                sendMode === 'now'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Hemen Gönder
            </button>
            <button
              type="button"
              onClick={() => setSendMode('daily')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                sendMode === 'daily'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Her Gün Gönder
            </button>
          </div>
        </div>

        {sendMode === 'daily' ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Saat (İstanbul)</span>
              <div className="flex gap-2">
                <select
                  value={sendHour}
                  onChange={(e) => setSendHour(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <select
                  value={sendMinute}
                  onChange={(e) => setSendMinute(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                >
                  {Array.from({ length: 60 }, (_, m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>
        ) : null}

        <button
          type="button"
          disabled={busy || !message.trim() || !classIds.length}
          onClick={() => void (sendMode === 'now' ? handleSendNow() : handleScheduleDaily())}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 sm:w-auto sm:px-6"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : sendMode === 'now' ? <Send className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          {busy ? 'İşleniyor…' : sendMode === 'now' ? 'Gönder' : 'Planla'}
        </button>

        {sendResult ? (
          <p className="text-xs text-slate-600">
            Sonuç: {sendResult.sent} başarılı · {sendResult.failed} başarısız · {sendResult.total} toplam
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">{notice}</p>
        ) : null}

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-sm font-medium text-slate-800">Günlük planlar</p>
          {plansLoading ? (
            <p className="text-xs text-slate-500">Yükleniyor…</p>
          ) : plans.length === 0 ? (
            <p className="text-xs text-slate-500">Henüz günlük plan yok.</p>
          ) : (
            <ul className="space-y-2">
              {plans.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {String(p.label || '').replace(/^GW_BULK:\s*/i, '')}
                    </p>
                    <p className="text-slate-500">
                      Her gün {String(p.send_hour_tr).padStart(2, '0')}:
                      {String(p.send_minute_tr).padStart(2, '0')} (TR) ·{' '}
                      {(p.target_class_ids || []).length} sınıf
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void togglePlanActive(p)}
                      className={`rounded-full px-2 py-1 font-semibold ${
                        p.is_active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {p.is_active ? 'Aktif' : 'Pasif'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePlan(p.id)}
                      className="rounded p-1 text-slate-400 hover:text-rose-600"
                      aria-label="Sil"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
