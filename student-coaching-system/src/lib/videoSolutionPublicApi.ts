export type VideoSolutionBrand = {
  institution: { id: string; name: string };
  logo: string | null;
  colors: {
    lacivert: string;
    lacivertKoyu: string;
    kirmizi: string;
    maviAcik: string;
    gri: string;
  };
  slogan: string;
};

export type VideoSolutionPublicSet = {
  slug: string;
  school_year: string;
  grade_level: number;
  subject: string;
  term: number | null;
  exam_number: number | null;
  work_type: string;
  title: string;
  description: string | null;
};

export type VideoSolutionPublicQuestion = {
  question_number: number;
  title: string | null;
  topic: string | null;
  video_provider: string;
  provider_label?: string;
  source_url: string | null;
  embed_url: string | null;
};

export type VideoSolutionPublicPayload = {
  set: VideoSolutionPublicSet;
  questions: VideoSolutionPublicQuestion[];
  brand: VideoSolutionBrand;
};

export async function fetchPublicVideoSolution(slug: string): Promise<VideoSolutionPublicPayload> {
  const qs = new URLSearchParams({ slug: slug.trim() });
  const res = await fetch(`/api/public-video-solution?${qs.toString()}`, {
    credentials: 'omit'
  });
  const j = (await res.json().catch(() => ({}))) as VideoSolutionPublicPayload & {
    error?: string;
    message?: string;
    hint?: string;
  };
  if (!res.ok) {
    const msg = j.hint || j.message || j.error || 'İçerik bulunamadı';
    throw new Error(msg);
  }
  return j;
}

export function isVideoSolutionHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname.toLowerCase();
  return h === 'cozum.onlinevipdershane.com' || h === 'www.cozum.onlinevipdershane.com';
}
