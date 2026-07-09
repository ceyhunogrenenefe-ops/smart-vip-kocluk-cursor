import React, { useEffect, useState } from 'react';
import { Camera, ImagePlus, Loader2, Video, X } from 'lucide-react';
import type { EduHomework } from '../../types/eduPanel.types';
import { formatEduHomeworkLabel } from '../../lib/eduPanel/eduHomeworkForm';

const MAX_PHOTOS = 5;
const MAX_VIDEO_SECONDS = 60;

type Props = {
  open: boolean;
  homework: EduHomework | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: { photos: File[]; video: File | null }) => Promise<void>;
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

export default function EduSubmitHomeworkModal({
  open,
  homework,
  busy,
  onClose,
  onSubmit
}: Props) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPhotos([]);
      setVideo(null);
      setPhotoPreviews([]);
      setVideoPreview(null);
      setMediaError(null);
    }
  }, [open]);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  useEffect(() => {
    if (!video) {
      setVideoPreview(null);
      return;
    }
    const url = URL.createObjectURL(video);
    setVideoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [video]);

  if (!open || !homework) return null;

  const onPickPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    setMediaError(null);
    const next = [...photos];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      if (next.length >= MAX_PHOTOS) break;
      next.push(f);
    }
    setPhotos(next);
  };

  const onPickVideo = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setMediaError('Geçersiz video dosyası.');
      return;
    }
    try {
      const dur = await readVideoDuration(file);
      if (dur > MAX_VIDEO_SECONDS + 0.5) {
        setMediaError(`Video en fazla ${MAX_VIDEO_SECONDS} saniye olabilir.`);
        return;
      }
      setMediaError(null);
      setVideo(file);
    } catch {
      setMediaError('Video süresi okunamadı.');
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Ödevi Teslim Et</h3>
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
            onClick={() => void onSubmit({ photos, video })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? 'Gönderiliyor…' : 'Teslim Et'}
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-[11px] leading-relaxed text-slate-600">
              İstersen çözdüğün sayfaların fotoğrafını veya kısa videosunu yükleyebilirsin.
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Birden fazla fotoğraf · Video en fazla {MAX_VIDEO_SECONDS} sn · Zorunlu değil
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50">
                <ImagePlus className="h-4 w-4" />
                Fotoğraf
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
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
                Video
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  disabled={busy || Boolean(video)}
                  onChange={(e) => {
                    void onPickVideo(e.target.files?.[0] || null);
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

            {videoPreview ? (
              <div className="relative mt-3 overflow-hidden rounded-lg border border-slate-200">
                <video src={videoPreview} controls className="max-h-40 w-full bg-black" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setVideo(null)}
                  className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {photos.length > 0 || video ? (
              <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500">
                <Camera className="h-3 w-3" />
                {photos.length} fotoğraf{video ? ' · 1 video' : ''}
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
