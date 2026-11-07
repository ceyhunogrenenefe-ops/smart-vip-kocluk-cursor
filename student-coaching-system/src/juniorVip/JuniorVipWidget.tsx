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

const STORAGE_VOICE = 'junior_vip_voice_on';

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

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_VOICE) !== '0';
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

  const { supported: micSupported, listening, startListening, stopListening, speak } =
    useJuniorVipSpeech(voiceOn);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_VOICE, voiceOn ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [voiceOn]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, pendingLog]);

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
        if (voiceOn) speak(res.reply);
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
    [busy, messages, runNavigate, speak, voiceOn]
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
        <div className="pointer-events-none fixed inset-x-3 top-20 z-[240] mx-auto max-w-md animate-in fade-in slide-in-from-top-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-950 shadow-lg">
          Junior VIP seni buraya getirdi: <span className="text-orange-700">{guideBanner}</span>
        </div>
      ) : null}

      {open ? (
        <div
          className={cn(
            'fixed z-[245] flex flex-col overflow-hidden rounded-2xl border border-orange-200/80 bg-white shadow-2xl shadow-orange-300/25 dark:border-orange-900/50 dark:bg-slate-900',
            'inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-h-[min(70vh,520px)] sm:inset-x-auto sm:right-4 sm:bottom-24 sm:w-[min(100vw-2rem,380px)]'
          )}
          role="dialog"
          aria-label="Junior VIP asistan"
        >
          <div className="flex items-center gap-2 border-b border-orange-100 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2.5 dark:border-orange-900/40 dark:from-amber-950/40 dark:to-orange-950/30">
            <JuniorVipMascot size="sm" listening={listening} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">Junior VIP</p>
              <p className="truncate text-[10px] text-slate-500">Akıllı Öğrenci Asistanı</p>
            </div>
            <button
              type="button"
              onClick={() => setVoiceOn((v) => !v)}
              className="rounded-lg p-2 text-slate-600 hover:bg-white/80"
              title={voiceOn ? 'Sesli yanıt açık' : 'Sesli yanıt kapalı'}
            >
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
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
                    ? 'ml-auto bg-indigo-600 text-white'
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
              placeholder="Yaz veya mikrofona bas…"
              className="max-h-24 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 px-2.5 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            />
            {voiceOn && micSupported ? (
              <button
                type="button"
                onClick={() =>
                  listening
                    ? stopListening()
                    : startListening((t) => {
                        setInput(t);
                        void submitMessage(t);
                      })
                }
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  listening ? 'bg-rose-500 text-white' : 'bg-orange-100 text-orange-800'
                )}
                title="Sesli konuş"
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-40"
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
          'fixed z-[244] flex items-center gap-2 rounded-full border-2 border-white/80 bg-gradient-to-r from-amber-400 to-orange-500 pr-3 shadow-xl shadow-orange-500/35 transition hover:scale-[1.03] active:scale-95',
          'right-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] sm:right-5 sm:bottom-6',
          open && 'ring-4 ring-orange-300/50'
        )}
        aria-expanded={open}
        aria-label="Junior VIP – Akıllı Öğrenci Asistanı"
      >
        <JuniorVipMascot size="md" listening={listening && open} />
        <span className="hidden max-w-[9rem] text-left text-[11px] font-bold leading-tight text-white drop-shadow sm:block">
          Junior VIP
          <span className="block text-[9px] font-medium opacity-90">Asistan</span>
        </span>
      </button>
    </>
  );
}
