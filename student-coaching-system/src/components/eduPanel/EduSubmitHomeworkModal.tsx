import React, { useEffect, useState } from 'react';
import { Camera, ImagePlus, Loader2, Video, X } from 'lucide-react';
import type { EduHomework } from '../../types/eduPanel.types';
import { formatEduHomeworkLabel } from '../../lib/eduPanel/eduHomeworkForm';
import { isEduImageFile, isEduVideoFile } from '../../lib/eduPanel/eduPanelApi';

const MAX_PHOTOS = 5;
const MAX_VIDEOS = 5;
const MAX_VIDEO_SECONDS = 120;
const MAX_VIDEO_MB = 30;

type Props = {
  open: boolean;
  homework: EduHomework | null;
  busy?: boolean;
  /** Daha önce teslim edilmişse yeniden düzenleme / tekrar teslim */
  isResubmit?: boolean;
  onClose: () => void;
  onSubmit: (payload: { photos: File[]; videos: File[] }) => Promise<void>;
};

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const d = Number(el.duration) || 0;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Video okunamadı'));
    };
    el.src = url;
  });
}

function videoChunkWarning(file: File, durationSec: number): string | null {
  const mb = file.size / (1024 * 1024);
  if (durationSec > MAX_VIDEO_SECONDS + 0.5) {
    return `Video ${MAX_VIDEO_SECONDS} saniyeden uzun. Lütfen parça parça yükleyin (her parça en fazla 2 dakika).`;
  }
  if (mb > MAX_VIDEO_MB) {
    return `Video ${MAX_VIDEO_MB} MB sınırını aşıyor. Lütfen daha kısa veya daha küçük parçalar halinde yükleyin.`;
  }
  return null;
}

export default function EduSubmitHomeworkModal({
  open,
  homework,
  busy,
  isResubmit,
  onClose,
  onSubmit
}: Props) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [videoPreviews, setVideoPreviews] = useState<string[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPhotos([]);
      setVideos([]);
      setPhotoPreviews([]);
      setVideoPreviews([]);
      setMediaError(null);
    }
  }, [open]);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  useEffect(() => {
    const urls = videos.map((f) => URL.createObjectURL(f));
    setVideoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [videos]);

  if (!open || !homework) return null;

  const onPickPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    setMediaError(null);
    const next = [...photos];
    let skipped = 0;
    for (const f of Array.from(files)) {
      if (!isEduImageFile(f)) {
        skipped += 1;
        continue;
      }
      if (next.length >= MAX_PHOTOS) break;
      next.push(f);
    }
    if (skipped > 0 && next.length === photos.length) {
      setMediaError('Fotoğraf formatı desteklenmiyor. JPG, PNG veya HEIC deneyin.');
      return;
    }
    setPhotos(next);
  };

  const onPickVideos = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...videos];
    let lastError: string | null = null;
    for (const file of Array.from(files)) {
      if (next.length >= MAX_VIDEOS) {
        lastError = `En fazla ${MAX_VIDEOS} video yükleyebilirsin.`;
        break;
      }
      if (!isEduVideoFile(file)) {
        lastError = 'Geçersiz video dosyası. MP4 veya MOV deneyin.';
        continue;
      }
      try {
        const dur = await readVideoDuration(file);
        const warn = videoChunkWarning(file, dur);
        if (warn) {
          lastError = warn;
          continue;
        }
        next.push(file);
      } catch {
        lastError = 'Video süresi okunamadı.';
      }
    }
    setVideos(next);
    setMediaError(lastError);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const removeVideo = (index: number) => {
    setVideos((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {isResubmit ? 'Ödevi Yeniden Düzenle' : 'Ödevi Teslim Et'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">{formatEduHomeworkLabel(homework)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSubmit({ photos, videos })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Gönderiliyor…' : isResubmit ? 'Tekrar Teslim Et' : 'Teslim Et'}
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-[11px] leading-relaxed text-slate-600">
              İstersen çözdüğün sayfaların fotoğrafını veya kısa videolarını yükleyebilirsin.
              <span className="font-semibold text-slate-800"> Birden fazla video</span> seçebilirsin
              (uzun çözümleri 2 dakikalık parçalara bölerek).
            </p>
            {isResubmit ? (
              <p className="mt-1 text-[11px] font-medium text-amber-800">
                Tekrar teslimde önceki fotoğraf/videolar yenileriyle değiştirilir.
              </p>
            ) : null}
            <p className="mt-1 text-[10px] text-slate-400">
              En fazla {MAX_PHOTOS} fotoğraf · En fazla {MAX_VIDEOS} video · Her video en fazla{' '}
              {MAX_VIDEO_SECONDS} sn ({MAX_VIDEO_MB} MB) · Uzun videoları parça parça yükle · Zorunlu
              değil
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50">
                <ImagePlus className="h-4 w-4" />
                Fotoğraf
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                  multiple
                  className="hidden"
                  disabled={busy || photos.length >= MAX_PHOTOS}
                  onChange={(e) => {
                    onPickPhotos(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-50">
                <Video className="h-4 w-4" />
                Video{videos.length ? ` (${videos.length}/${MAX_VIDEOS})` : ''}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  multiple
                  className="hidden"
                  disabled={busy || videos.length >= MAX_VIDEOS}
                  onChange={(e) => {
                    void onPickVideos(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {mediaError ? (
              <p className="mt-2 text-[11px] font-medium text-red-600">{mediaError}</p>
            ) : null}

            {photoPreviews.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {photoPreviews.map((src, i) => (
                  <div key={src} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200">
                    <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removePhoto(i)}
                      className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {videoPreviews.length > 0 ? (
              <div className="mt-3 space-y-2">
                {videoPreviews.map((src, i) => (
                  <div key={src} className="relative overflow-hidden rounded-lg border border-slate-200">
                    <video src={src} controls className="max-h-40 w-full bg-black" />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeVideo(i)}
                      className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Video {i + 1}/{videos.length}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {photos.length > 0 || videos.length > 0 ? (
              <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500">
                <Camera className="h-3 w-3" />
                {photos.length} fotoğraf
                {videos.length ? ` · ${videos.length} video` : ''}
              </p>
            ) : null}
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}
