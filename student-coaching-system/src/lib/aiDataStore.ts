export type DailySignalSource = 'student' | 'parent';

export interface DailySignal {
  id: string;
  institutionId: string;
  studentId: string;
  source: DailySignalSource;
  date: string;
  questionsSolved: number;
  pagesRead: number;
  focusLevel: number;
  disciplineLevel: number;
  motivationLevel: number;
  engagementLevel: number;
  notes?: string;
  createdAt: string;
}

export interface WhatsAppMessageLog {
  id: string;
  institutionId: string;
  studentId: string;
  direction: 'incoming' | 'outgoing';
  audience: 'student' | 'parent';
  content: string;
  createdAt: string;
}

const DAILY_SIGNALS_KEY = 'coaching_daily_signals_v1';
const WHATSAPP_LOGS_KEY = 'coaching_whatsapp_logs_v1';

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const getDailySignals = (): DailySignal[] => readJson<DailySignal[]>(DAILY_SIGNALS_KEY, []);

export const saveDailySignal = (
  signal: Omit<DailySignal, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
) => {
  const current = getDailySignals();
  const next: DailySignal = {
    ...signal,
    id: signal.id || `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: signal.createdAt || new Date().toISOString()
  };
  writeJson(DAILY_SIGNALS_KEY, [next, ...current]);
  return next;
};

export const getStudentDailySignals = (institutionId: string, studentId: string): DailySignal[] =>
  getDailySignals().filter(s => s.institutionId === institutionId && s.studentId === studentId);

export const getWhatsAppLogs = (): WhatsAppMessageLog[] =>
  readJson<WhatsAppMessageLog[]>(WHATSAPP_LOGS_KEY, []);

export const saveWhatsAppLog = (
  log: Omit<WhatsAppMessageLog, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
) => {
  const current = getWhatsAppLogs();
  const next: WhatsAppMessageLog = {
    ...log,
    id: log.id || `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: log.createdAt || new Date().toISOString()
  };
  writeJson(WHATSAPP_LOGS_KEY, [next, ...current]);
  return next;
};

export const getStudentWhatsAppLogs = (institutionId: string, studentId: string): WhatsAppMessageLog[] =>
  getWhatsAppLogs().filter(l => l.institutionId === institutionId && l.studentId === studentId);

export const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const buildBehaviorScores = (signals: DailySignal[]) => {
  if (!signals.length) {
    return {
      motivationScore: 0,
      disciplineScore: 0,
      engagementScore: 0,
      dailyScore: 0
    };
  }

  const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length;
  const motivationScore = clampScore(avg(signals.map(s => s.motivationLevel)));
  const disciplineScore = clampScore(avg(signals.map(s => s.disciplineLevel)));
  const engagementScore = clampScore(avg(signals.map(s => s.engagementLevel)));
  const productivity = clampScore(avg(signals.map(s => s.questionsSolved * 0.4 + s.pagesRead * 0.6)));
  const dailyScore = clampScore(
    motivationScore * 0.3 + disciplineScore * 0.3 + engagementScore * 0.2 + productivity * 0.2
  );

  return { motivationScore, disciplineScore, engagementScore, dailyScore };
};
