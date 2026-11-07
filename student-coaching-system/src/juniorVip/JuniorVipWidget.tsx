import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { resolveStudentRecordId } from '../lib/coachResolve';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { userRoleTags } from '../config/rolePermissions';
import { JuniorVipMascot } from './JuniorVipMascot';
import {
  juniorVipChat,
  saveJuniorVipStudyLog,
  type JuniorVipChatMessage,
  type JuniorVipNavigateAction,
  type JuniorVipStudyLogProposal
} from './juniorVipApi';
import { useJuniorVipSpeech } from './useJuniorVipSpeech';
import { inferJuniorVipMascotGender } from './inferMascotGender';
import { JUNIOR_VIP_THEME } from './juniorVipTheme';

const STORAGE_SPEAK = 'junior_vip_speak_on';

function splitNavigatePath(path: string) {
  const q = path.indexOf('?');
  if (q < 0) return { pathname: path, search: '' };
  return { pathname: path.slice(0, q), search: path.slice(q) };
}

export default function JuniorVipWidget() {
  const navigate = useNavigate();
  const { effectiveUser } = useAuth();
  const { students } = useApp();
  const tags = userRoleTags(effectiveUser);
  const isStudent =
    tags.includes('student') && !tags.some((t) => ['super_admin', 'admin', 'coach', 'teacher'].includes(t));

  const studentId =
    resolveStudentRecordId(
      effectiveUser?.role,
      effectiveUser?.studentId,
      effectiveUser?.email,
      students,
      { roles: tags }
    )?.trim() || '';

  const studentRow = students.find((s) => s.id === studentId);
  const mascotGender = inferJuniorVipMascotGender(studentRow?.name);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_SPEAK) !== '0';
    } catch {
      return true;
    }
  });
  const [messages, setMessages] = useState<JuniorVipChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Merhaba! Ben Junior VIP. Menüde nereye gideceğini sorabilir, bugün çözdüğün soruları birlikte planına yazabiliriz.'
    }
  ]);
  const [pendingLog, setPendingLog] = useState<JuniorVipStudyLogProposal | null>(null);
  const [guideBanner, setGuideBanner] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const {
    micSupported,
    listening,
    transcribing,
    desktopRecorderMode,
    startListening,
    stopListening,
    finishListening,
    ensureMicReady,
    releaseMicWarmup,
    speak
  } = useJuniorVipSpeech({
    mascotGender,
    onError: (msg) => toast.error(msg, { duration: 5000 })
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SPEAK, speakReplies ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [speakReplies]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, pendingLog]);

  useEffect(() => {
    if (!open) {
      releaseMicWarmup();
      return;
    }
    void ensureMicReady();
  }, [open, ensureMicReady, releaseMicWarmup]);

  const runNavigate = useCallback(
    (actions: JuniorVipNavigateAction[]) => {
      const first = actions.find((a) => a.type === 'navigate' && a.path);
      if (!first) return;
      const { pathname, search } = splitNavigatePath(first.path);
      setGuideBanner(first.label || 'Sayfa');
      navigate({ pathname, search }, { state: { juniorVipHighlight: true } });
      window.setTimeout(() => setGuideBanner(null), 6000);
    },
    [navigate]
  );

  const submitMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setInput('');
      const nextHistory: JuniorVipChatMessage[] = [...messages, { role: 'user', content: trimmed }];
      setMessages(nextHistory);
      setBusy(true);
      setPendingLog(null);
      try {
        const res = await juniorVipChat(trimmed, messages);
        setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
        if (res.proposed_study_log) setPendingLog(res.proposed_study_log);
        if (res.actions?.length) runNavigate(res.actions);
        if (speakReplies) speak(res.reply);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Bağlantı hatası';
        toast.error(msg);
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: 'Üzgünüm, şu an bağlanamadım. Biraz sonra tekrar dener misin?' }
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, runNavigate, speak, speakReplies]
  );

  const confirmStudyLog = async () => {
    if (!pendingLog || !studentId) return;
    setBusy(true);
    try {
      await saveJuniorVipStudyLog(studentId, pendingLog);
      toast.success('Harika! Çalışma kaydın haftalık plana eklendi.');
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Tamamdır! ${pendingLog.date} — ${pendingLog.subject} / ${pendingLog.topic}: ${pendingLog.solved_questions} soru kaydedildi.`
        }
      ]);
      setPendingLog(null);
      runNavigate([{ type: 'navigate', path: '/weekly-planner', label: 'Haftalık plan' }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setBusy(false);
    }
  };

  if (!isStudent || !studentId) return null;

  return (
    <>
      {guideBanner ? (
        <div
          className={cn(
            'pointer-events-none fixed inset-x-3 top-20 z-[240] mx-auto max-w-md animate-in fade-in slide-in-from-top-2 rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-lg',
            JUNIOR_VIP_THEME.guideBanner
          )}
        >
          Junior VIP seni buraya getirdi: <span className="text-violet-700">{guideBanner}</span>
        </div>
      ) : null}

      {open ? (
        <div
          className={cn(
            'fixed z-[245] flex flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl dark:bg-slate-900',
            JUNIOR_VIP_THEME.panelBorder,
            JUNIOR_VIP_THEME.bubbleShadow,
            'inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-h-[min(70vh,520px)] sm:inset-x-auto sm:right-4 sm:bottom-24 sm:w-[min(100vw-2rem,380px)]'
          )}
          role="dialog"
          aria-label="Junior VIP asistan"
        >
          <div
            className={cn(
              'flex items-center gap-2 border-b border-indigo-100 bg-gradient-to-r px-3 py-2.5 dark:border-indigo-900/40',
              JUNIOR_VIP_THEME.panelHeader
            )}
          >
            <JuniorVipMascot size="sm" gender={mascotGender} listening={listening} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">Junior VIP</p>
              <p className="truncate text-[10px] text-slate-500">Akıllı Öğrenci Asistanı</p>
            </div>
            <button
              type="button"
              onClick={() => setSpeakReplies((v) => !v)}
              className="rounded-lg p-2 text-slate-600 hover:bg-white/80"
              title={speakReplies ? 'Junior sesli konuşsun' : 'Junior yalnızca yazsın'}
            >
              {speakReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                stopListening();
                setOpen(false);
              }}
              className="rounded-lg p-2 text-slate-600 hover:bg-white/80"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={cn(
                  'max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed',
                  m.role === 'user'
                    ? cn('ml-auto text-white', JUNIOR_VIP_THEME.userBubble)
                    : 'mr-auto bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                )}
              >
                {m.content}
              </div>
            ))}
            {pendingLog ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                <p className="font-semibold">Planına kaydedeyim mi?</p>
                <p className="mt-1">
                  {pendingLog.date} · {pendingLog.subject} · {pendingLog.topic} ·{' '}
                  <strong>{pendingLog.solved_questions}</strong> soru
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void confirmStudyLog()}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                  >
                    Evet, kaydet
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingLog(null)}
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-[11px] font-semibold"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            ) : null}
            {busy ? (
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Düşünüyorum…
              </p>
            ) : null}
          </div>

          <form
            className="flex items-end gap-1.5 border-t border-slate-100 p-2 dark:border-slate-800"
            onSubmit={(e) => {
              e.preventDefault();
              void submitMessage(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
              placeholder={
                transcribing
                  ? 'Sesin yazıya çevriliyor…'
                  : listening
                    ? desktopRecorderMode
                      ? 'Konuş… bitince mikrofona tekrar bas (PC kayıt)'
                      : 'Konuş… bitince mikrofona tekrar bas'
                    : 'Yaz veya mikrofona bas…'
              }
              className="max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            />
            {micSupported ? (
              <button
                type="button"
                disabled={transcribing || busy}
                onClick={() => {
                  if (listening || transcribing) {
                    void finishListening().then((heard) => {
                      const text = (heard || input).trim();
                      if (text) {
                        setInput(text);
                        void submitMessage(text);
                      } else if (desktopRecorderMode) {
                        toast.message('Kayıt boş. Daha uzun konuşup tekrar dene.');
                      }
                    });
                    return;
                  }
                  startListening((t) => setInput(t));
                }}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  listening || transcribing
                    ? 'bg-rose-500 text-white animate-pulse'
                    : JUNIOR_VIP_THEME.micIdle
                )}
                title={listening ? 'Dinlemeyi bitir ve gönder' : 'Sesli komut — konuş, bitince tekrar bas'}
              >
                {listening || transcribing ? (
                  transcribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MicOff className="h-4 w-4" />
                  )
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400"
                title="Sesli komut bu tarayıcıda yok — Chrome/Edge kullanın"
              >
                <MicOff className="h-4 w-4" />
              </span>
            )}
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'fixed z-[244] flex items-center gap-2 rounded-full border-2 border-white/90 bg-gradient-to-r pr-3 shadow-xl transition hover:scale-[1.03] active:scale-95',
          JUNIOR_VIP_THEME.bubbleGradient,
          JUNIOR_VIP_THEME.bubbleShadow,
          'right-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] sm:right-5 sm:bottom-6',
          open && cn('ring-4', JUNIOR_VIP_THEME.bubbleRing)
        )}
        aria-expanded={open}
        aria-label="Junior VIP – Akıllı Öğrenci Asistanı"
      >
        <JuniorVipMascot size="md" gender={mascotGender} listening={listening && open} />
        <span className="hidden max-w-[9rem] text-left text-[11px] font-bold leading-tight text-white drop-shadow sm:block">
          Junior VIP
          <span className="block text-[9px] font-medium opacity-90">Asistan</span>
        </span>
      </button>
    </>
  );
}
