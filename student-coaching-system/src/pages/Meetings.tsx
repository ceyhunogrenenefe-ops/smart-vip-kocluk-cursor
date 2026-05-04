import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/session';
import { resolveCoachRecordId } from '../lib/coachResolve';
import type { CoachingMeetingRecord, MeetingStatus } from '../types';
import {
  Video,
  Plus,
  Calendar as CalendarIcon,
  ExternalLink,
  Link2,
  CheckCircle,
  AlertCircle,
  BarChart3
} from 'lucide-react';

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function formatISO(d: Date) {
  return d.toISOString();
}

export default function Meetings() {
  const { effectiveUser } = useAuth();
  const { students, coaches } = useApp();
  const [params, setSearchParams] = useSearchParams();
  const isStudent = effectiveUser?.role === 'student';

  const [meetings, setMeetings] = useState<CoachingMeetingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  /** Sunucu ortamı (Vercel) eksik: GOOGLE_* veya Supabase service — kalıcı uyarı */
  const [configHint, setConfigHint] = useState<string | null>(null);

  const [coachIdDraft, setCoachIdDraft] = useState('');
  const [studentIdDraft, setStudentIdDraft] = useState('');
  const [datetimeLocal, setDatetimeLocal] = useState('');
  const [durationMin, setDurationMin] = useState(60);
  const [titleDraft, setTitleDraft] = useState('');
  const [linkZoomDraft, setLinkZoomDraft] = useState('');
  const [linkBbbDraft, setLinkBbbDraft] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [meetingRecurrence, setMeetingRecurrence] = useState(false);
  const [meetingIntervalDays, setMeetingIntervalDays] = useState<7 | 15>(7);
  const [meetingRecurrenceUntil, setMeetingRecurrenceUntil] = useState('');

  const role = effectiveUser?.role || '';

  const hasManualMeetingLinks =
    linkZoomDraft.trim().length > 0 || linkBbbDraft.trim().length > 0;

  const defaultCoachId = useMemo(() => {
    if (role !== 'coach' || !effectiveUser) return '';
    return (
      resolveCoachRecordId(
        effectiveUser.role,
        effectiveUser.coachId,
        effectiveUser.email,
        coaches
      ) || ''
    );
  }, [role, effectiveUser, coaches]);

  useEffect(() => {
    if (role === 'coach' && defaultCoachId) setCoachIdDraft(defaultCoachId);
    if ((role === 'admin' || role === 'super_admin') && coaches.length === 1) {
      setCoachIdDraft(coaches[0].id);
    }
  }, [role, defaultCoachId, coaches]);

  const rangeFrom = useMemo(() => addDays(startOfWeek(new Date()), -7), []);
  const rangeTo = useMemo(() => addDays(new Date(), 45), []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        op: 'list',
        from: formatISO(rangeFrom),
        to: formatISO(rangeTo)
      }).toString();
      const res = await apiFetch(`/api/meetings?${qs}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.code === 'supabase_env_missing') {
          setConfigHint(
            String(j.error || 'Vercel’de sunucu için SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlayın.')
          );
          setMeetings([]);
          return;
        }
        if (j.code === 'meetings_db_permission' || j.code === 'meetings_query_failed') {
          setConfigHint(
            String(j.error || j.hint || 'meetings tablosu veya Supabase anahtarı kontrol edin.')
          );
          setMeetings([]);
          return;
        }
        throw new Error(j.error || 'meetings_load_failed');
      }
      setConfigHint(null);
      setMeetings((j.data || []) as CoachingMeetingRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  const loadGoogle = useCallback(async () => {
    if (isStudent) return;
    try {
      const res = await apiFetch('/api/google/oauth');
      const j = await res.json().catch(() => ({}));
      if (res.ok) setGoogleConnected(!!j.connected);
      else setGoogleConnected(null);
    } catch {
      setGoogleConnected(null);
    }
  }, [isStudent]);

  useEffect(() => {
    void loadMeetings();
    void loadGoogle();
  }, [loadMeetings, loadGoogle]);

  useEffect(() => {
    const gc = params.get('google_connected');
    const ge = params.get('google_error');
    if (gc === '1') {
      void loadGoogle();
      params.delete('google_connected');
      setSearchParams(params, { replace: true });
      setError(null);
    }
    if (ge) {
      const raw = decodeURIComponent(ge);
      if (raw === 'google_testing_only_add_email') {
        setError(null);
        setConfigHint(
          'Google, uygulamayı “Test” modunda gösteriyor. Kullandığınız Gmail adresini (Takvime bağlayacağınız hesap) Google Cloud Console’da test kullanıcısı olarak eklemeniz gerekir: ' +
            'APIs and Services → OAuth consent screen → Audience (Hedef kitle) bölümünde “Test users” → Add users → e-postanızı ekleyin. ' +
            'Uygulamayı herkese açmak için (üretim) Google doğrulama süreci ve yayımlama gerekir; ayrıntı: Google Cloud OAuth dokümantasyonu.'
        );
      } else if (raw === 'oauth_invalid_grant' || raw === 'oauth_redirect_uri_mismatch') {
        setError(null);
        const callbackUrl = `${window.location.origin}/api/google/callback`;
        setConfigHint(
          raw === 'oauth_redirect_uri_mismatch'
            ? `Google OAuth “Redirect URI” uyuşmuyor. Google Cloud → Credentials → OAuth istemcisi → Authorized redirect URIs içine tam olarak ekleyin: ${callbackUrl} — Vercel’deki GOOGLE_REDIRECT_URI ile birebir aynı olmalı (http/https, sonda / yok).`
            : 'Yetkilendirme kodu geçersiz veya süresi dolmuş (çoğu zaman eski sekme / iki kez geri gelme). Google ile bağlan’a yeniden tıklayın. Devam ederse Google Hesabı → Güvenlik → Üçüncü taraf erişimi → bu uygulamayı kaldırıp tekrar deneyin.'
        );
      } else if (raw === 'invalid_state_token') {
        setError(null);
        setConfigHint(
          'Oturum anahtarı (state) doğrulanamadı. Çıkış yapıp tekrar giriş yapın; Vercel’de APP_JWT_SECRET’ın Production’da sabit ve dolu olduğundan emin olun.'
        );
      } else if (raw.startsWith('oauth_token_exchange_failed:')) {
        setError(null);
        setConfigHint(`Token alınamadı: ${raw.replace(/^oauth_token_exchange_failed:/, '')}`);
      } else if (raw === 'integrations_requires_db_user_demo' || raw === 'integrations_requires_db_user') {
        setError(null);
        setConfigHint(
          raw === 'integrations_requires_db_user_demo'
            ? 'Demo hesabı (demo-*) ile girişte kullanıcı ID’si Supabase users tablosunda yok; foreign key bu yüzden reddeder. Google Takvim için: çıkış yapıp veritabanınızda gerçekten kayıtlı e-posta/şifre ile giriş yapın (veya users’a bu kullanıcıyı ekleyin).'
            : 'JWT kullanıcı ID’si users tablosunda yok. Çıkış yapıp doğru hesapla giriş yapın veya users kaydını kontrol edin.'
        );
      } else if (raw.startsWith('supabase_save:')) {
        setError(null);
        const detail = raw.replace(/^supabase_save:/, '');
        const fkHint =
          /foreign key.*integrations_google_user_id/i.test(detail) ||
          /integrations_google_user_id_fkey/i.test(detail)
            ? ' Bu genelde demo giriş veya users’ta olmayan oturumdur — gerçek DB kullanıcısı ile giriş gerekir.'
            : '';
        setConfigHint(
          'Google izni veya kayıt sırasında Supabase hatası: ' +
            detail +
            fkHint +
            ' Opsiyonel: student-coaching-system/sql/2026-05-07-integrations-google-optional-drop-user-fk.sql (FK kaldırır; üretimde tercihen gerçek users kaydı kullanın).'
        );
      } else if (raw.startsWith('cb:')) {
        setError(null);
        setConfigHint('OAuth geri dönüşü sunucu hatası: ' + raw.replace(/^cb:/, ''));
      } else if (raw === 'callback_failed') {
        setError(null);
        setConfigHint(
          'Önceki sürümde ayrıntı gösterilmiyordu; sayfayı yenileyip tekrar “Google ile bağlan” deneyin. Tekrar ederse deploy güncel mi kontrol edin.'
        );
      } else {
        setError(`Google: ${raw}`);
      }
      params.delete('google_error');
      setSearchParams(params, { replace: true });
    }
  }, [params, setSearchParams, loadGoogle]);

  /** API’de sızıntı olsa bile: öğrenci/koçta ID yokken asla tüm listeyi gösterme (önceden bu yüzden hepsi görünüyordu). */
  const visibleMeetings = useMemo(() => {
    if (!effectiveUser) return meetings;
    const { role, studentId, coachId } = effectiveUser;
    if (role === 'student') {
      if (!studentId) return [];
      return meetings.filter((m) => m.student_id === studentId);
    }
    if (role === 'coach' || role === 'teacher') {
      if (!coachId) return [];
      return meetings.filter((m) => m.coach_id === coachId);
    }
    return meetings;
  }, [meetings, effectiveUser]);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) map.set(s.id, s.name);
    return map;
  }, [students]);

  const coachNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of coaches) map.set(c.id, c.name);
    return map;
  }, [coaches]);

  const meetingStudentLabel = useCallback(
    (m: CoachingMeetingRecord) => {
      const emb = (m.students as { name?: string } | null)?.name;
      if (emb) return emb;
      return studentNameById.get(m.student_id) || 'Öğrenci';
    },
    [studentNameById]
  );

  const meetingCoachLabel = useCallback(
    (m: CoachingMeetingRecord) => {
      const emb = (m.coaches as { name?: string } | null)?.name;
      if (emb) return emb;
      return coachNameById.get(m.coach_id) || 'Koç';
    },
    [coachNameById]
  );

  const meetingListGroups = useMemo(() => {
    const singles: CoachingMeetingRecord[] = [];
    const bySeries = new Map<string, CoachingMeetingRecord[]>();
    for (const m of visibleMeetings) {
      if (!m.series_id) singles.push(m);
      else {
        const arr = bySeries.get(m.series_id) || [];
        arr.push(m);
        bySeries.set(m.series_id, arr);
      }
    }
    for (const arr of bySeries.values()) {
      arr.sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));
    }
    const groups = [...bySeries.entries()].map(([seriesId, items]) => {
      let intervalLabel = 'Tekrarlayan';
      if (items.length >= 2) {
        const gap =
          (+new Date(items[1].start_time) - +new Date(items[0].start_time)) / 86400000;
        intervalLabel = Math.round(gap) >= 14 ? '15 günde bir' : 'Haftalık';
      }
      return { seriesId, items, first: items[0], intervalLabel };
    });
    groups.sort((a, b) => +new Date(a.first.start_time) - +new Date(b.first.start_time));
    singles.sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));
    return { singles, groups };
  }, [visibleMeetings]);

  const deleteMeetingSeries = async (seriesId: string) => {
    if (!window.confirm('Bu tekrarlayan serinin tüm gelecek ve geçmiş oturumları silinsin mi?')) return;
    setError(null);
    try {
      const res = await apiFetch('/api/meetings?op=delete-series', {
        method: 'POST',
        body: JSON.stringify({ series_id: seriesId })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'delete_failed');
      await loadMeetings();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const weeklyBuckets = useMemo(() => {
    const weekStart = startOfWeek(new Date());
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const bucket: Record<string, CoachingMeetingRecord[]> = {};
    for (const d of days) bucket[key(d)] = [];
    for (const m of visibleMeetings) {
      const k = new Date(m.start_time).toISOString().slice(0, 10);
      if (!bucket[k]) bucket[k] = [];
      bucket[k].push(m);
    }
    return days.map((d) => ({
      label: d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }),
      date: d,
      key: key(d),
      items: (bucket[key(d)] || []).slice().sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time))
    }));
  }, [visibleMeetings]);

  const analytics = useMemo(() => {
    const planned = visibleMeetings.filter((m) => m.status === 'planned').length;
    const done = visibleMeetings.filter((m) => m.status === 'completed').length;
    const missed = visibleMeetings.filter((m) => m.status === 'missed').length;
    const attendedKnown = visibleMeetings.filter((m) => typeof m.attended === 'boolean');
    const attendedCount = attendedKnown.filter((m) => m.attended === true).length;
    const attendancePct =
      attendedKnown.length === 0 ? null : Math.round((attendedCount / attendedKnown.length) * 100);
    return { planned, done, missed, attendancePct };
  }, [visibleMeetings]);

  const handleConnectGoogle = async () => {
    setConnectBusy(true);
    try {
      const res = await apiFetch('/api/google/oauth', { method: 'POST', body: JSON.stringify({}) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.code === 'google_oauth_env_missing') {
          const miss = Array.isArray((j as { missing?: string[] }).missing)
            ? (j as { missing: string[] }).missing.join(', ')
            : '';
          setConfigHint(
            [
              String(
                j.error ||
                  'Vercel Production ortamında GOOGLE_* değişkenleri sunucuya gelmiyor — yeniden deploy edin.'
              ),
              miss && `Boş/eksik algılanan: ${miss}`
            ]
              .filter(Boolean)
              .join(' ')
          );
          setError(null);
          return;
        }
        if (j.code === 'google_oauth_demo_user' || j.code === 'google_oauth_user_not_in_db') {
          setError(null);
          setConfigHint(String(j.error || 'Kullanıcı veritabanında yok.'));
          return;
        }
        throw new Error(j.error || 'connect_failed');
      }
      setConfigHint(null);
      if (j.authUrl) window.location.href = j.authUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectBusy(false);
    }
  };

  const handleCreate = async () => {
    const coachSel = role === 'coach' ? defaultCoachId : coachIdDraft;
    const startJs = datetimeLocal ? new Date(datetimeLocal) : null;
    if (!coachSel || !studentIdDraft || !startJs || Number.isNaN(+startJs)) {
      setError('Koç, öğrenci ve başlangıç zamanı seçin.');
      return;
    }
    if (meetingRecurrence) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingRecurrenceUntil.trim())) {
        setError('Tekrar için bitiş tarihi (YYYY-AA-GG) girin.');
        return;
      }
    }
    setCreateBusy(true);
    setError(null);
    try {
      const base = {
        coach_id: coachSel,
        student_id: studentIdDraft,
        start_datetime: startJs.toISOString(),
        duration_minutes: durationMin,
        title: titleDraft || undefined,
        link_zoom: linkZoomDraft.trim() || undefined,
        link_bbb: linkBbbDraft.trim() || undefined
      };
      const op = meetingRecurrence ? 'create-series' : 'create';
      const body = meetingRecurrence
        ? {
            ...base,
            interval_days: meetingIntervalDays,
            recurrence_until: meetingRecurrenceUntil.trim().slice(0, 10)
          }
        : base;
      const res = await apiFetch(`/api/meetings?op=${op}`, { method: 'POST', body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'create_failed');
      await loadMeetings();
      setDatetimeLocal('');
      setTitleDraft('');
      setLinkZoomDraft('');
      setLinkBbbDraft('');
      setStudentIdDraft('');
      setMeetingRecurrence(false);
      setMeetingRecurrenceUntil('');
      if (j.whatsapp && typeof j.whatsapp === 'string') {
        // bilgi amaçlı (WhatsApp teslim özeti backend'de döner)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateBusy(false);
    }
  };

  const updateMeeting = async (
    meetingId: string,
    patch: Partial<{ status: MeetingStatus; notes: string | null; attended: boolean | null; ai_summary: string | null }>
  ) => {
    setError(null);
    try {
      const res = await apiFetch('/api/meetings?op=update-status', {
        method: 'POST',
        body: JSON.stringify({ meeting_id: meetingId, ...patch })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'update_failed');
      await loadMeetings();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!effectiveUser) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Video className="w-8 h-8 text-emerald-600" />
            {isStudent ? 'Görüşmelerim' : 'Online görüşmeler'}
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            Google Meet için Takvim bağlayabilirsiniz; Zoom veya BBB ile de Takvim olmadan görüşme planlayabilirsiniz. WhatsApp bildirimleri (hatırlatma cron ile).
          </p>
        </div>
      </div>

      {configHint ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-sm flex gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Sunucu yapılandırması</p>
            <p className="mt-1 opacity-90">{configHint}</p>
            <p className="mt-2 text-xs text-amber-800/80">
              Ayrıntı: <code className="bg-amber-100/80 px-1 rounded">MEETINGS_SAAS_SETUP.md</code> —{' '}
              <code className="bg-amber-100/80 px-1 rounded">GOOGLE_REDIRECT_URI</code> Google Cloud ile aynı olmalı.
              Demo ile Google deniyorsanız: FK kaldırma SQL dosyası + Vercel{' '}
              <code className="bg-amber-100/80 px-1 rounded">INTEGRATIONS_GOOGLE_NO_USER_FK=1</code>.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm flex gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      ) : null}

      {!isStudent && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-slate-500" />
              <span className="text-sm font-medium text-slate-800">Google Takvim / Meet</span>
              <span className="text-xs text-slate-500">
                Durum:
                {' '}
                {googleConnected === null ? (
                  '?'
                ) : googleConnected ? (
                  <span className="text-emerald-700">Bağlı</span>
                ) : (
                  <span className="text-amber-700">Bağlı değil</span>
                )}
              </span>
            </div>
            <button
              type="button"
              disabled={connectBusy}
              onClick={() => void handleConnectGoogle()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {googleConnected ? 'Yeniden yetkilendir' : 'Google ile bağlan'}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-medium text-slate-800">
                <Plus className="w-5 h-5" />
                Yeni görüşme
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {(role === 'admin' || role === 'super_admin') ? (
                  <label className="block text-sm">
                    <span className="text-slate-600">Koç</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-900"
                      value={coachIdDraft}
                      onChange={(e) => setCoachIdDraft(e.target.value)}
                    >
                      <option value="">Koç seçin</option>
                      {coaches.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="block text-sm md:col-span-1">
                  <span className="text-slate-600">Öğrenci</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-900"
                    value={studentIdDraft}
                    onChange={(e) => setStudentIdDraft(e.target.value)}
                  >
                    <option value="">Öğrenci seçin</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Başlangıç (yerel)</span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    value={datetimeLocal}
                    onChange={(e) => setDatetimeLocal(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Süre (dk)</span>
                  <input
                    type="number"
                    min={15}
                    max={480}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value) || 60)}
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-slate-600">Başlık (isteğe bağlı)</span>
                  <input
                    type="text"
                    placeholder="Koçluk oturumu"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-slate-600">Zoom bağlantısı (isteğe bağlı)</span>
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    value={linkZoomDraft}
                    onChange={(e) => setLinkZoomDraft(e.target.value)}
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-slate-600">BigBlueButton bağlantısı (isteğe bağlı)</span>
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    value={linkBbbDraft}
                    onChange={(e) => setLinkBbbDraft(e.target.value)}
                  />
                </label>
                <div className="md:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={meetingRecurrence}
                      onChange={(e) => setMeetingRecurrence(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Tekrarlayan görüşme (aynı bağlantı ile)
                  </label>
                  {meetingRecurrence ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="text-slate-600">Sıklık</span>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-900"
                          value={meetingIntervalDays}
                          onChange={(e) => setMeetingIntervalDays(Number(e.target.value) as 7 | 15)}
                        >
                          <option value={7}>Her hafta (7 gün)</option>
                          <option value={15}>15 günde bir</option>
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="text-slate-600">Son tekrar tarihi (dahil)</span>
                        <input
                          type="date"
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                          value={meetingRecurrenceUntil}
                          onChange={(e) => setMeetingRecurrenceUntil(e.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                disabled={
                  createBusy ||
                  (effectiveUser?.role === 'coach' && !googleConnected && !hasManualMeetingLinks)
                }
                onClick={() => void handleCreate()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-45"
              >
                <CalendarIcon className="w-4 h-4" />
                {meetingRecurrence ? 'Tekrarlayan seriyi oluştur' : 'Oluştur (Meet ve/veya Zoom/BBB)'}
              </button>
              {(role === 'admin' || role === 'super_admin') ? (
                <p className="text-xs text-slate-600">
                  Meet için seçilen koçun hesabında Google Takvim bağlı olmalı. Bağlı değilse en az Zoom veya BBB adresi girerek yine de planlayabilirsiniz (koçun platform kullanıcısına göre kayıt tutulur).
                </p>
              ) : null}
              {effectiveUser?.role === 'coach' && !googleConnected ? (
                <p className="text-xs text-amber-700">
                  Google ile bağlanırsanız Meet otomatik üretilir. Bağlamadan da Zoom veya BBB bağlantısı (https://…) girerek görüşme oluşturabilirsiniz.
                </p>
              ) : null}
          </div>
        </>
      )}

      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
        <div className="flex items-center gap-2 font-medium text-slate-800 mb-3">
          <BarChart3 className="w-5 h-5" /> Analiz (bu aralıkta)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg bg-white border border-slate-100 px-3 py-2">
            <div className="text-slate-500 text-xs">Planlı</div>
            <div className="text-lg font-semibold text-slate-900">{analytics.planned}</div>
          </div>
          <div className="rounded-lg bg-white border border-slate-100 px-3 py-2">
            <div className="text-slate-500 text-xs">Tamamlandı</div>
            <div className="text-lg font-semibold text-emerald-700">{analytics.done}</div>
          </div>
          <div className="rounded-lg bg-white border border-slate-100 px-3 py-2">
            <div className="text-slate-500 text-xs">Kaçırıldı</div>
            <div className="text-lg font-semibold text-red-700">{analytics.missed}</div>
          </div>
          <div className="rounded-lg bg-white border border-slate-100 px-3 py-2">
            <div className="text-slate-500 text-xs">Katılım (bilinen otur.)</div>
            <div className="text-lg font-semibold text-blue-700">
              {analytics.attendancePct === null ? '–' : `${analytics.attendancePct}%`}
              <span className="block text-[10px] font-normal text-slate-400">AI özet = yakında</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-medium text-slate-800">
            <CalendarIcon className="w-5 h-5" /> Haftalık takvim özeti
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadMeetings()}
            className="text-sm text-emerald-700 hover:underline"
          >
            Yenile
          </button>
        </div>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-7">
          {weeklyBuckets.map((slot) => (
            <div key={slot.key} className="min-h-[120px] rounded-lg border border-slate-100 bg-slate-50/80 p-2">
              <div className="text-xs font-semibold text-slate-600 mb-1">{slot.label}</div>
              <div className="space-y-1">
                {slot.items.map((m) => (
                  <div key={m.id} className="text-[11px] bg-white rounded border border-slate-100 px-1.5 py-1 truncate">
                    {new Date(m.start_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}{' '}
                    {meetingStudentLabel(m)}
                    <span
                      className={`ml-1 rounded px-0.5 ${
                        m.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : m.status === 'missed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900 mb-1">Liste</h2>
        <p className="text-xs text-slate-500 mb-3">
          Tekrarlayan seriler tek satırda özetlenir; tüm oturumlar takvimde haftaya göre görünür.
        </p>
        {loading ? <p className="text-sm text-slate-500">Yükleniyor…</p> : null}
        <div className="space-y-3">
          {meetingListGroups.groups.map((g) => (
            <details
              key={g.seriesId}
              className="border border-violet-200 rounded-lg bg-violet-50/40 overflow-hidden"
            >
              <summary className="cursor-pointer px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm list-none [&::-webkit-details-marker]:hidden">
                <span className="font-medium text-slate-900">
                  <span className="text-violet-700">↻ {g.intervalLabel}</span>
                  {' · '}
                  {meetingStudentLabel(g.first)} · {meetingCoachLabel(g.first)}
                  <span className="text-slate-500 font-normal">
                    {' '}
                    ({g.items.length} oturum)
                  </span>
                </span>
                {!isStudent && (role === 'coach' || role === 'admin' || role === 'super_admin') ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      void deleteMeetingSeries(g.seriesId);
                    }}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    Seriyi sil
                  </button>
                ) : null}
              </summary>
              <div className="px-3 pb-3 pt-0 space-y-2 border-t border-violet-100/80">
                {g.items.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white/90 border border-slate-100 rounded-md p-2 text-xs flex flex-wrap justify-between gap-2"
                  >
                    <span className="text-slate-700">
                      {new Date(m.start_time).toLocaleString('tr-TR')}
                      <span
                        className={`ml-2 rounded px-1 ${
                          m.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.status === 'missed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {m.status}
                      </span>
                    </span>
                    <a
                      href={m.meet_link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-emerald-700 font-medium hover:underline"
                    >
                      Bağlantı
                    </a>
                  </div>
                ))}
              </div>
            </details>
          ))}
          {meetingListGroups.singles.map((m) => (
            <div
              key={m.id}
              className="border border-slate-100 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
            >
                <div className="text-sm space-y-1">
                  <div className="font-medium text-slate-900">
                    {meetingStudentLabel(m)} · {meetingCoachLabel(m)}
                  </div>
                  <div className="text-slate-600 text-xs">
                    {new Date(m.start_time).toLocaleString('tr-TR')} — {new Date(m.end_time).toLocaleTimeString('tr-TR')}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                    {m.whatsapp_created_sent ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle className="w-3 h-3" /> WA oluşturma
                      </span>
                    ) : null}
                    {m.whatsapp_reminder_sent ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle className="w-3 h-3" /> WA hatırlatma
                      </span>
                    ) : null}
                  </div>
                  {!isStudent && (role === 'coach' || role === 'admin' || role === 'super_admin') ? (
                    <details className="text-xs mt-2">
                      <summary className="cursor-pointer text-slate-700">Katılım & notlar</summary>
                      <div className="mt-2 space-y-2 pl-2 border-l-2 border-slate-100">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={m.attended === true}
                            onChange={(ev) =>
                              void updateMeeting(m.id, {
                                attended: ev.target.checked,
                                status: m.status
                              })
                            }
                          />
                          Katıldı
                        </label>
                        <textarea
                          className="w-full rounded border border-slate-200 p-2 text-xs"
                          rows={2}
                          placeholder="Koç / oturum notları"
                          defaultValue={m.notes ?? ''}
                          onBlur={(ev) =>
                            void updateMeeting(m.id, {
                              notes: ev.target.value || null,
                              status: m.status
                            })
                          }
                        />
                        <textarea
                          className="w-full rounded border border-dashed border-slate-300 p-2 text-xs bg-slate-50"
                          rows={2}
                          placeholder="AI özet yer tutucusu (gelecek iş akışına bağlanacak)"
                          defaultValue={m.ai_summary ?? ''}
                          onBlur={(ev) =>
                            void updateMeeting(m.id, {
                              ai_summary: ev.target.value || null,
                              status: m.status
                            })
                          }
                        />
                        <select
                          className="text-xs rounded border border-slate-200 px-2 py-1 bg-white text-slate-900"
                          value={m.status}
                          onChange={(ev) =>
                            void updateMeeting(m.id, { status: ev.target.value as MeetingStatus })
                          }
                        >
                          <option value="planned">planned</option>
                          <option value="completed">completed</option>
                          <option value="missed">missed</option>
                        </select>
                      </div>
                    </details>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={m.meet_link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Meet’e katıl
                  </a>
                  {m.link_zoom ? (
                    <a
                      href={m.link_zoom}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Zoom
                    </a>
                  ) : null}
                  {m.link_bbb ? (
                    <a
                      href={m.link_bbb}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-medium"
                    >
                      <ExternalLink className="w-4 h-4" />
                      BBB
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
