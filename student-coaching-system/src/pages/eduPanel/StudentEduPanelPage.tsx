import { useCallback, useEffect, useMemo, useState } from 'react';
import { EDU_HOMEWORK_ANIMATIONS_LABEL } from '../../components/layout/sidebar/navModel';
import { AlertCircle, Award, BookMarked, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import EduAnimationPreviewModal from '../../components/eduPanel/EduAnimationPreviewModal';
import EduBadgeChip from '../../components/eduPanel/EduBadgeChip';
import StudentEduTopicCard from '../../components/eduPanel/StudentEduTopicCard';
import { useEduAnimationPreview } from '../../components/eduPanel/useEduAnimationPreview';
import type { EduHomework, EduLessonRow, EduLessonRowProgress } from '../../types/eduPanel.types';
import type { EduHomeworkSubmission } from '../../types/eduPanel.types';
import { groupRowsBySubject } from '../../lib/eduPanel/eduPanelUi';
import { badgeForPoints } from '../../lib/eduPanel/eduPanelProgress';
import {
  fetchEduLessonRowsDetailed,
  fetchMyEduProgress,
  fetchMyEduSubmission,
  saveEduLessonProgress,
  submitEduHomework
} from '../../lib/eduPanel/eduPanelApi';

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
      if (!data.length && result.message) {
        setEmptyHint(result.message);
      } else if (!data.length) {
        setEmptyHint('Henüz size atanmış bir ödev bulunmamaktadır.');
      }

      let prog: EduLessonRowProgress[] = [];
      try {
        prog = await fetchMyEduProgress();
      } catch (progErr) {
        console.warn('[edu-derslerim] progress yüklenemedi', progErr);
      }
      setProgressList(prog);

      const subs: Record<string, EduHomeworkSubmission | null> = {};
      await Promise.all(
        data.flatMap((row) =>
          (row.homework || [])
            .filter((hw) => hw.status === 'published')
            .map(async (hw) => {
              try {
                subs[hw.id] = await fetchMyEduSubmission(hw.id);
              } catch (subErr) {
                console.warn('[edu-derslerim] submission', hw.id, subErr);
                subs[hw.id] = null;
              }
            })
        )
      );
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
    return { completed, totalPts, avgPts, topBadge, topicCount: rows.length };
  }, [progressList, rows.length]);

  const onSubmitHomework = async (
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
      setSubmissions((s) => ({ ...s, [hw.id]: sub }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Teslim edilemedi');
      throw e;
    } finally {
      setBusyHw(null);
    }
  };

  const onSaveProgress = async (
    rowId: string,
    payload: {
      animation_completed: boolean;
      homework_percent: number;
      topic_completed: boolean;
    }
  ) => {
    setBusyProgressRow(rowId);
    try {
      const saved = await saveEduLessonProgress(rowId, payload);
      setProgressList((prev) => {
        const rest = prev.filter((p) => p.lesson_row_id !== rowId);
        return [...rest, saved];
      });
      toast.success('Rozetin kaydedildi — aferin!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
      throw e;
    } finally {
      setBusyProgressRow(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white">
        <h1 className="text-2xl font-bold">{EDU_HOMEWORK_ANIMATIONS_LABEL}</h1>
        <p className="mt-1 text-sm text-indigo-100">
          Konuyu tamamladıkça rozet ve puan kazan. Animasyon izleme + ödev yüzdesi toplam puana
          eklenir.
        </p>
        {rows.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm backdrop-blur">
            <Award className="h-5 w-5 shrink-0" />
            <span>
              {summary.completed}/{summary.topicCount} konu tamamlandı
            </span>
            <span className="text-indigo-100">·</span>
            <span>Ortalama {summary.avgPts}p</span>
            <EduBadgeChip badge={summary.topBadge} compact />
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
                    void preview.open(id).then(() => void load()).catch((e) =>
                      toast.error(e instanceof Error ? e.message : 'Animasyon açılamadı')
                    )
                  }
                  onOpenPoolAnimation={(id) =>
                    void preview.openPool(id).catch((e) =>
                      toast.error(e instanceof Error ? e.message : 'Animasyon açılamadı')
                    )
                  }
                  onSubmitHomework={(hw, payload) => onSubmitHomework(hw, payload)}
                  onSaveProgress={(p) => onSaveProgress(row.id, p)}
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
    </div>
  );
}
