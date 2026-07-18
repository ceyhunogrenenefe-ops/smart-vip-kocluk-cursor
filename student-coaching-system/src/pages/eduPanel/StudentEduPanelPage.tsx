import { useCallback, useEffect, useMemo, useState } from 'react';
import { EDU_HOMEWORK_ANIMATIONS_LABEL } from '../../components/layout/sidebar/navModel';
import { AlertCircle, Award, BookMarked } from 'lucide-react';
import { toast } from 'sonner';
import EduAnimationPreviewModal from '../../components/eduPanel/EduAnimationPreviewModal';
import EduBadgeChip from '../../components/eduPanel/EduBadgeChip';
import EduHomeworkCelebrateModal from '../../components/eduPanel/EduHomeworkCelebrateModal';
import StudentEduTopicCard from '../../components/eduPanel/StudentEduTopicCard';
import { useEduAnimationPreview } from '../../components/eduPanel/useEduAnimationPreview';
import type { EduHomework, EduLessonRow, EduLessonRowProgress } from '../../types/eduPanel.types';
import type { EduHomeworkSubmission } from '../../types/eduPanel.types';
import { groupRowsBySubject } from '../../lib/eduPanel/eduPanelUi';
import {
  badgeForPoints,
  homeworkPercentFromSubmissions,
  milestoneBadges,
  progressBreakdown,
  type EduCelebrateKind
} from '../../lib/eduPanel/eduPanelProgress';
import {
  fetchEduLessonRowsDetailed,
  fetchMyEduProgress,
  fetchMyEduSubmission,
  saveEduLessonProgress,
  submitEduHomework
} from '../../lib/eduPanel/eduPanelApi';

type CelebrateState = {
  kind: EduCelebrateKind;
  topicTitle: string;
  animationCompleted: boolean;
  homeworkPercent: number;
  topicCompleted: boolean;
  hasAnimation: boolean;
  hasHomework: boolean;
};

export default function StudentEduPanelPage() {
  const [rows, setRows] = useState<EduLessonRow[]>([]);
  const [progressList, setProgressList] = useState<EduLessonRowProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, EduHomeworkSubmission | null>>({});
  const [busyHw, setBusyHw] = useState<string | null>(null);
  const [busyProgressRow, setBusyProgressRow] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<CelebrateState | null>(null);
  const preview = useEduAnimationPreview();

  const progressByRow = useMemo(() => {
    const m = new Map<string, EduLessonRowProgress>();
    for (const p of progressList) m.set(p.lesson_row_id, p);
    return m;
  }, [progressList]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setEmptyHint(null);
    try {
      const result = await fetchEduLessonRowsDetailed();
      const data = result.data || [];
      setRows(data);
      setProgressList(result.progress || []);
      if (!data.length && result.message) {
        setEmptyHint(result.message);
      } else if (!data.length) {
        setEmptyHint('Henüz size atanmış bir ödev bulunmamaktadır.');
      }

      const subs: Record<string, EduHomeworkSubmission | null> = {};
      for (const row of data) {
        for (const hw of row.homework || []) {
          if (hw.status !== 'published') continue;
          const mine = Array.isArray(hw.submissions) && hw.submissions.length ? hw.submissions[0] : null;
          subs[hw.id] = mine;
        }
      }
      setSubmissions(subs);
      if (data.length === 1) setExpandedId(data[0].id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ödevler yüklenemedi';
      console.error('[edu-derslerim] load failed', e);
      setLoadError(msg);
      setRows([]);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subjectGroups = useMemo(() => groupRowsBySubject(rows), [rows]);

  const summary = useMemo(() => {
    const completed = progressList.filter((p) => p.topic_completed).length;
    const totalPts = progressList.reduce((s, p) => s + (p.points || 0), 0);
    const avgPts = progressList.length ? Math.round(totalPts / progressList.length) : 0;
    const topBadge = badgeForPoints(avgPts);
    const animWins = progressList.filter((p) => p.animation_completed).length;
    const hwWins = progressList.filter((p) => Number(p.homework_percent || 0) >= 100).length;
    return { completed, totalPts, avgPts, topBadge, topicCount: rows.length, animWins, hwWins };
  }, [progressList, rows.length]);

  const galleryMilestones = useMemo(() => {
    const animEarned = summary.animWins > 0;
    const hwEarned = summary.hwWins > 0;
    const topicEarned = summary.completed > 0;
    return milestoneBadges({
      animationCompleted: animEarned,
      homeworkPercent: hwEarned ? 100 : 0,
      topicCompleted: topicEarned,
      hasAnimation: true,
      hasHomework: true
    }).map((m) => {
      if (m.id === 'animation' && animEarned) {
        return { ...m, label: `Animasyon · ${summary.animWins}` };
      }
      if (m.id === 'homework' && hwEarned) {
        return { ...m, label: `Ödev · ${summary.hwWins}` };
      }
      if (m.id === 'topic' && topicEarned) {
        return { ...m, label: `Konu · ${summary.completed}` };
      }
      return m;
    });
  }, [summary]);

  const openCelebrateForRow = (
    row: EduLessonRow,
    kind: EduCelebrateKind,
    prog?: EduLessonRowProgress | null
  ) => {
    const p = prog || progressByRow.get(row.id) || null;
    const published = (row.homework || []).filter((h) => h.status === 'published').length;
    setCelebrate({
      kind,
      topicTitle: row.title,
      animationCompleted: Boolean(p?.animation_completed),
      homeworkPercent: Number(p?.homework_percent || 0),
      topicCompleted: Boolean(p?.topic_completed),
      hasAnimation: (row.animations || []).length > 0,
      hasHomework: published > 0
    });
  };

  const syncProgressList = (saved: EduLessonRowProgress) => {
    setProgressList((prev) => {
      const rest = prev.filter((p) => p.lesson_row_id !== saved.lesson_row_id);
      return [...rest, saved];
    });
  };

  const onSubmitHomework = async (
    row: EduLessonRow,
    hw: EduHomework,
    payload: { photos: File[]; video: File | null }
  ) => {
    setBusyHw(hw.id);
    try {
      await submitEduHomework(hw.id, {
        photos: payload.photos,
        video: payload.video
      });
      toast.success('Ödev teslim edildi');
      const sub = await fetchMyEduSubmission(hw.id);
      const nextSubs = { ...submissions, [hw.id]: sub };
      setSubmissions(nextSubs);

      const published = (row.homework || []).filter((h) => h.status === 'published');
      const submittedCount = published.filter((h) => nextSubs[h.id]).length;
      const hwPct = homeworkPercentFromSubmissions(published.length, submittedCount);
      const prev = progressByRow.get(row.id);
      try {
        const saved = await saveEduLessonProgress(row.id, {
          animation_completed: Boolean(prev?.animation_completed),
          homework_percent: hwPct,
          topic_completed: Boolean(prev?.topic_completed)
        });
        syncProgressList(saved);
        openCelebrateForRow(row, 'homework', saved);
      } catch {
        openCelebrateForRow(row, 'homework', {
          ...(prev || ({} as EduLessonRowProgress)),
          lesson_row_id: row.id,
          homework_percent: hwPct,
          animation_completed: Boolean(prev?.animation_completed),
          topic_completed: Boolean(prev?.topic_completed),
          points: progressBreakdown(Boolean(prev?.animation_completed), hwPct).total
        } as EduLessonRowProgress);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Teslim edilemedi');
      throw e;
    } finally {
      setBusyHw(null);
    }
  };

  const onSaveProgress = async (
    row: EduLessonRow,
    payload: {
      animation_completed: boolean;
      homework_percent: number;
      topic_completed: boolean;
    }
  ) => {
    setBusyProgressRow(row.id);
    try {
      const saved = await saveEduLessonProgress(row.id, payload);
      syncProgressList(saved);
      toast.success('Rozetin kaydedildi — aferin!');
      openCelebrateForRow(row, 'topic', saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
      throw e;
    } finally {
      setBusyProgressRow(null);
    }
  };

  const afterAnimationOpen = async (row: EduLessonRow) => {
    const before = Boolean(progressByRow.get(row.id)?.animation_completed);
    try {
      const prog = await fetchMyEduProgress();
      setProgressList(prog);
      const after = prog.find((p) => p.lesson_row_id === row.id);
      if (!before && after?.animation_completed) {
        openCelebrateForRow(row, 'animation', after);
      }
    } catch {
      /* progress yenileme opsiyonel */
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white">
          <h1 className="text-2xl font-bold">{EDU_HOMEWORK_ANIMATIONS_LABEL}</h1>
          <p className="mt-1 text-sm text-indigo-100">
            Konuyu tamamladıkça rozet ve puan kazan. Animasyon izleme + ödev yüzdesi toplam puana
            eklenir.
          </p>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="h-5 w-2/3 rounded bg-slate-200" />
              <div className="mt-3 h-4 w-1/3 rounded bg-slate-100" />
              <div className="mt-4 h-10 w-full rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white">
        <h1 className="text-2xl font-bold">{EDU_HOMEWORK_ANIMATIONS_LABEL}</h1>
        <p className="mt-1 text-sm text-indigo-100">
          Animasyonu izle ve ödevini yükle — her başarı ayrı rozet ve puana dönüşür.
        </p>
        {rows.length > 0 ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm backdrop-blur">
              <Award className="h-5 w-5 shrink-0" />
              <span>
                {summary.completed}/{summary.topicCount} konu tamamlandı
              </span>
              <span className="text-indigo-100">·</span>
              <span>Ortalama {summary.avgPts}p</span>
              <EduBadgeChip badge={summary.topBadge} compact />
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
                Başarı rozetlerin
              </p>
              <div className="flex flex-wrap gap-2">
                {galleryMilestones.map((m) => (
                  <span
                    key={m.id}
                    title={m.hint}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                      m.earned
                        ? 'bg-white/95 text-slate-800 ring-white/60'
                        : 'bg-white/10 text-indigo-100 ring-white/20'
                    }`}
                  >
                    <span aria-hidden>{m.emoji}</span>
                    {m.label}
                    {!m.earned ? ' · kilitli' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm font-medium text-red-800">Ödevler yüklenirken bir hata oluştu</p>
          <p className="max-w-md text-sm text-red-700">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Tekrar dene
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">
          {emptyHint || 'Henüz size atanmış bir ödev bulunmamaktadır.'}
        </p>
      ) : (
        subjectGroups.map((group) => (
          <section key={group.subjectName} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-600">
              <BookMarked className="h-4 w-4 text-indigo-600" />
              {group.subjectName}
            </h2>
            <div className="space-y-3">
              {group.rows.map((row) => (
                <StudentEduTopicCard
                  key={row.id}
                  row={row}
                  expanded={expandedId === row.id}
                  onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
                  submissions={submissions}
                  progress={progressByRow.get(row.id) || null}
                  animLoading={preview.loading}
                  busyHw={busyHw}
                  busyProgress={busyProgressRow === row.id}
                  onOpenAnimation={(id) =>
                    void preview
                      .open(id)
                      .then(() => afterAnimationOpen(row))
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : 'Animasyon açılamadı')
                      )
                  }
                  onOpenPoolAnimation={(id) =>
                    void preview
                      .openPool(id)
                      .then(() => afterAnimationOpen(row))
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : 'Animasyon açılamadı')
                      )
                  }
                  onSubmitHomework={(hw, payload) => onSubmitHomework(row, hw, payload)}
                  onSaveProgress={(p) => onSaveProgress(row, p)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <EduAnimationPreviewModal
        open={preview.isOpen}
        animUrl={preview.animUrl}
        loading={preview.loading}
        onClose={preview.close}
      />

      <EduHomeworkCelebrateModal
        open={Boolean(celebrate)}
        onClose={() => setCelebrate(null)}
        kind={celebrate?.kind || 'homework'}
        topicTitle={celebrate?.topicTitle}
        animationCompleted={celebrate?.animationCompleted}
        homeworkPercent={celebrate?.homeworkPercent}
        topicCompleted={celebrate?.topicCompleted}
        hasAnimation={celebrate?.hasAnimation}
        hasHomework={celebrate?.hasHomework}
      />
    </div>
  );
}
