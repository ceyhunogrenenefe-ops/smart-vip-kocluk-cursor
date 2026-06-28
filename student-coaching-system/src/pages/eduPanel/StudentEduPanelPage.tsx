import { EDU_HOMEWORK_ANIMATIONS_LABEL } from '../../components/layout/sidebar/navModel';
import { BookMarked, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import EduAnimationPreviewModal from '../../components/eduPanel/EduAnimationPreviewModal';
import StudentEduTopicCard from '../../components/eduPanel/StudentEduTopicCard';
import { useEduAnimationPreview } from '../../components/eduPanel/useEduAnimationPreview';
import type { EduHomework, EduLessonRow } from '../../types/eduPanel.types';
import type { EduHomeworkSubmission } from '../../types/eduPanel.types';
import { groupRowsBySubject } from '../../lib/eduPanel/eduPanelUi';
import {
  fetchEduLessonRows,
  fetchMyEduSubmission,
  submitEduHomework
} from '../../lib/eduPanel/eduPanelApi';

export default function StudentEduPanelPage() {
  const [rows, setRows] = useState<EduLessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, EduHomeworkSubmission | null>>({});
  const [busyHw, setBusyHw] = useState<string | null>(null);
  const preview = useEduAnimationPreview();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEduLessonRows();
      setRows(data);
      const subs: Record<string, EduHomeworkSubmission | null> = {};
      for (const row of data) {
        for (const hw of row.homework || []) {
          if (hw.status === 'published') {
            subs[hw.id] = await fetchMyEduSubmission(hw.id);
          }
        }
      }
      setSubmissions(subs);
      if (data.length === 1) setExpandedId(data[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dersler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subjectGroups = useMemo(() => groupRowsBySubject(rows), [rows]);

  const onSubmitPhoto = async (hw: EduHomework, file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen bir fotoğraf seçin');
      return;
    }
    setBusyHw(hw.id);
    try {
      await submitEduHomework(hw.id, file);
      toast.success('Ödev teslim edildi');
      const sub = await fetchMyEduSubmission(hw.id);
      setSubmissions((s) => ({ ...s, [hw.id]: sub }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Teslim edilemedi');
    } finally {
      setBusyHw(null);
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
          Her konu ayrı bir klasördür. Animasyon ve ödev birbirinden ayrı; yalnızca o konuya ait
          içerikleri görürsünüz.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-12">
          Henüz yayınlanmış konu yok. Öğretmeniniz konuyu yayınladığında burada görünür.
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
                  animLoading={preview.loading}
                  busyHw={busyHw}
                  onOpenAnimation={(id) =>
                    void preview.open(id).catch((e) =>
                      toast.error(e instanceof Error ? e.message : 'Animasyon açılamadı')
                    )
                  }
                  onSubmitHomework={(hw, file) => void onSubmitPhoto(hw, file)}
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
