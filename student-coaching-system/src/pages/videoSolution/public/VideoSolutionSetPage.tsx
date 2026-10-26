import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, PlayCircle } from 'lucide-react';
import {
  fetchPublicVideoSolution,
  type VideoSolutionBrand,
  type VideoSolutionPublicQuestion,
  type VideoSolutionPublicSet
} from '../../../lib/videoSolutionPublicApi';
import VideoSolutionPublicShell from './VideoSolutionPublicShell';

const WORK_LABEL: Record<string, string> = {
  yazili: 'Yazılı',
  deneme: 'Deneme',
  konu_tarama: 'Konu tarama',
  foy: 'Föy',
  odev: 'Ödev',
  genel: 'Genel'
};

export default function VideoSolutionSetPage() {
  const { slug = '' } = useParams();
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [set, setSet] = useState<VideoSolutionPublicSet | null>(null);
  const [sorular, setSorular] = useState<VideoSolutionPublicQuestion[]>([]);
  const [brand, setBrand] = useState<VideoSolutionBrand | null>(null);

  useEffect(() => {
    const s = slug.trim();
    if (!s) {
      setHata('Geçersiz bağlantı');
      setYukleniyor(false);
      return;
    }
    let iptal = false;
    document.title = 'Video çözümler';
    void fetchPublicVideoSolution(s)
      .then((j) => {
        if (iptal) return;
        setSet(j.set);
        setSorular(j.questions);
        setBrand(j.brand);
        document.title = `${j.set.title} — Video çözüm`;
      })
      .catch((e) => {
        if (!iptal) setHata(e instanceof Error ? e.message : 'Yüklenemedi');
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, [slug]);

  if (yukleniyor) {
    return (
      <VideoSolutionPublicShell brand={brand}>
        <div className="flex justify-center py-16 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      </VideoSolutionPublicShell>
    );
  }

  if (hata || !set) {
    return (
      <VideoSolutionPublicShell brand={brand}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
          {hata || 'Bu çalışma bulunamadı veya henüz yayınlanmadı.'}
        </div>
      </VideoSolutionPublicShell>
    );
  }

  const altBaslik = [
    `${set.grade_level}. sınıf`,
    set.subject,
    WORK_LABEL[set.work_type] || set.work_type,
    set.term ? `${set.term}. dönem` : '',
    set.exam_number ? `${set.exam_number}. yazılı` : ''
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <VideoSolutionPublicShell brand={brand}>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold text-[#173b70]">{set.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{altBaslik}</p>
        {set.description && <p className="mt-3 text-sm text-slate-700">{set.description}</p>}
      </article>

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Sorular ({sorular.length})
      </h2>

      {sorular.length === 0 ? (
        <p className="text-sm text-slate-500">Henüz yayınlanmış soru yok.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {sorular.map((q) => (
            <li key={q.question_number}>
              <Link
                to={`/c/${encodeURIComponent(set.slug)}/s/${q.question_number}`}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#173b70]/40 hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#173b70]/10 text-[#173b70]">
                  <PlayCircle className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">Soru {q.question_number}</span>
                  {q.title && <span className="block truncate text-sm text-slate-700">{q.title}</span>}
                  {q.topic && <span className="block truncate text-xs text-slate-500">{q.topic}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </VideoSolutionPublicShell>
  );
}
