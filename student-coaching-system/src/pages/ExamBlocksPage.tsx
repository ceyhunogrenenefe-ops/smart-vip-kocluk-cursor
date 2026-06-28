import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  defaultAcademicCenterLinks,
  fetchAcademicCenterLinksFromServer,
  loadAcademicCenterLinks
} from '../lib/academicCenterLinks';

export default function ExamBlocksPage() {
  const { institution, activeInstitutionId } = useApp();
  const institutionId = institution?.id || activeInstitutionId || null;
  const [examUrl, setExamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchAcademicCenterLinksFromServer(institutionId);
        const url = String(data.exams.examBlocks || '').trim();
        if (mounted) setExamUrl(url || null);
      } catch {
        const local = loadAcademicCenterLinks(institutionId) ?? defaultAcademicCenterLinks;
        const url = String(local.exams.examBlocks || '').trim();
        if (mounted) setExamUrl(url || null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [institutionId]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!examUrl) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h1 className="text-lg font-bold text-amber-950">Sınav Blokları bağlantısı tanımlı değil</h1>
            <p className="mt-2 text-sm text-amber-900/90">
              Kurum yöneticiniz Akademik Merkez ayarlarından Sınav Blokları linkini eklemelidir.
            </p>
          </div>
        </div>
        <Link
          to="/academic-center?tab=exam"
          className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Akademik Merkez&apos;e dön
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Sınav Blokları</h1>
          <p className="text-sm text-slate-600">Online sınav sisteminiz aşağıda açılır.</p>
        </div>
        <Link
          to="/academic-center?tab=exam"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Geri
        </Link>
      </div>
      <iframe
        title="Sınav Blokları"
        src={examUrl}
        className="h-[min(78vh,calc(100dvh-11rem))] w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
        allow="camera; microphone; fullscreen"
      />
    </div>
  );
}
