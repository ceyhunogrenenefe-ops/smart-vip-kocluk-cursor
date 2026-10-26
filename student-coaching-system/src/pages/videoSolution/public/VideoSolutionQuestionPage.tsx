import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  fetchPublicVideoSolution,
  type VideoSolutionBrand,
  type VideoSolutionPublicQuestion,
  type VideoSolutionPublicSet
} from '../../../lib/videoSolutionPublicApi';
import VideoSolutionPublicShell from './VideoSolutionPublicShell';

export default function VideoSolutionQuestionPage() {
  const { slug = '', questionNumber = '' } = useParams();
  const n = Number(questionNumber);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [set, setSet] = useState<VideoSolutionPublicSet | null>(null);
  const [sorular, setSorular] = useState<VideoSolutionPublicQuestion[]>([]);
  const [brand, setBrand] = useState<VideoSolutionBrand | null>(null);

  useEffect(() => {
    const s = slug.trim();
    if (!s || !Number.isFinite(n) || n < 1) {
      setHata('Geçersiz soru bağlantısı');
      setYukleniyor(false);
      return;
    }
    let iptal = false;
    void fetchPublicVideoSolution(s)
      .then((j) => {
        if (iptal) return;
        setSet(j.set);
        setSorular(j.questions);
        setBrand(j.brand);
        const soru = j.questions.find((q) => q.question_number === Math.trunc(n));
        document.title = soru
          ? `Soru ${soru.question_number} — ${j.set.title}`
          : `Soru ${n} — ${j.set.title}`;
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
  }, [slug, n]);

  const soru = useMemo(
    () => sorular.find((q) => q.question_number === Math.trunc(n)) || null,
    [sorular, n]
  );

  const nums = useMemo(() => sorular.map((q) => q.question_number).sort((a, b) => a - b), [sorular]);
  const idx = nums.indexOf(Math.trunc(n));
  const onceki = idx > 0 ? nums[idx - 1] : null;
  const sonraki = idx >= 0 && idx < nums.length - 1 ? nums[idx + 1] : null;

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
          {hata || 'İçerik bulunamadı.'}
        </div>
      </VideoSolutionPublicShell>
    );
  }

  const setLink = `/c/${encodeURIComponent(set.slug)}`;

  if (!soru) {
    return (
      <VideoSolutionPublicShell brand={brand}>
        <Link to={setLink} className="mb-4 inline-flex items-center gap-1 text-sm text-[#173b70]">
          <ChevronLeft className="h-4 w-4" /> Çalışmaya dön
        </Link>
        <p className="rounded-xl border bg-white p-6 text-center text-sm text-slate-600">
          Soru {Math.trunc(n)} bu çalışmada yok.
        </p>
      </VideoSolutionPublicShell>
    );
  }

  return (
    <VideoSolutionPublicShell brand={brand}>
      <Link to={setLink} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[#173b70]">
        <ChevronLeft className="h-4 w-4" /> {set.title}
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">
          Soru {soru.question_number}
          {soru.title ? `: ${soru.title}` : ''}
        </h1>
        {soru.topic && <p className="mt-1 text-sm text-slate-500">{soru.topic}</p>}

        <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            title={`Soru ${soru.question_number} video çözüm`}
            src={`${soru.embed_url}?rel=0&modestbranding=1`}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {onceki != null ? (
          <Link
            to={`/c/${encodeURIComponent(set.slug)}/s/${onceki}`}
            className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm"
          >
            <ChevronLeft className="h-4 w-4" /> Soru {onceki}
          </Link>
        ) : (
          <span />
        )}
        {sonraki != null ? (
          <Link
            to={`/c/${encodeURIComponent(set.slug)}/s/${sonraki}`}
            className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm"
          >
            Soru {sonraki} <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {nums.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {nums.map((num) => (
            <Link
              key={num}
              to={`/c/${encodeURIComponent(set.slug)}/s/${num}`}
              className={`flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg border px-2 text-sm ${
                num === soru.question_number
                  ? 'border-[#173b70] bg-[#173b70] text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-[#173b70]/40'
              }`}
            >
              {num}
            </Link>
          ))}
        </div>
      )}
    </VideoSolutionPublicShell>
  );
}
