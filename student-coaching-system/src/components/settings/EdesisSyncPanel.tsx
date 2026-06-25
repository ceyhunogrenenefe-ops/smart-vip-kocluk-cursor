import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudDownload, Loader2, Plug, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchEdesisStatus,
  probeEdesis,
  syncEdesis,
  importEdesisJson,
  type EdesisStatus,
  type EdesisSyncResult
} from '../../lib/edesis/edesisApi';

export default function EdesisSyncPanel() {
  const [status, setStatus] = useState<EdesisStatus | null>(null);
  const [busy, setBusy] = useState<'probe' | 'sync' | 'import' | null>(null);
  const [lastResult, setLastResult] = useState<EdesisSyncResult | null>(null);
  const [importText, setImportText] = useState('');

  const reloadStatus = useCallback(async () => {
    try {
      const s = await fetchEdesisStatus();
      setStatus(s);
    } catch (e) {
      setStatus(null);
      toast.error(e instanceof Error ? e.message : 'Durum alınamadı');
    }
  }, []);

  useEffect(() => {
    void reloadStatus();
  }, [reloadStatus]);

  const onProbe = async () => {
    setBusy('probe');
    try {
      const r = await probeEdesis();
      setLastResult(r as EdesisSyncResult);
      if (r.ok) {
        const pr = r as EdesisSyncResult & { hasData?: boolean; rowCount?: number; warning?: string };
        if (pr.hasData) {
          toast.success(`Bağlantı OK — ${pr.rowCount ?? 0} kayıt (${pr.baseUrl}${pr.path})`);
        } else {
          toast.warning(
            pr.warning || 'Bağlantı OK ama liste boş — key scope (exams paketi) veya henüz sınav sonucu yok'
          );
        }
      } else {
        toast.error(
          (r as { error?: string; hint?: string }).error ||
            (r as { hint?: string }).hint ||
            'API key veya endpoint hatalı'
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test başarısız');
    } finally {
      setBusy(null);
    }
  };

  const onSync = async () => {
    setBusy('sync');
    try {
      const r = await syncEdesis();
      setLastResult(r);
      if (r.ok && (r.imported ?? 0) > 0) {
        const detail =
          (r.enrichedCount ?? 0) > 0
            ? ` · ${r.enrichedCount} kayıt ders/konu detayı ile zenginleştirildi`
            : (r.sampleSubjectCount ?? 0) > 1
              ? ` · örnek: ${r.sampleSubjectCount} ders`
              : '';
        toast.success(`${r.imported} deneme aktarıldı (${r.matched} eşleşme)${detail}`);
      } else if (r.ok && (r.matched ?? 0) === 0) {
        toast.warning(r.diagnosis || 'Hiç öğrenci eşleşmedi — kurallara bakın');
      } else {
        toast.error(r.error || r.diagnosis || r.hint || 'Senkron başarısız');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Senkron hatası');
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText.trim());
    } catch {
      toast.error('Geçerli JSON yapıştırın (dizi veya { "data": [...] })');
      return;
    }
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown[] }).data)
        ? (parsed as { data: unknown[] }).data
        : null;
    if (!rows?.length) {
      toast.error('JSON içinde sınav kaydı bulunamadı');
      return;
    }
    setBusy('import');
    try {
      const r = await importEdesisJson(rows);
      setLastResult(r);
      if (r.ok) {
        toast.success(`${r.imported ?? 0} kayıt içe aktarıldı`);
        setImportText('');
      } else {
        toast.error(r.error || 'İçe aktarma başarısız');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İçe aktarma hatası');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Plug className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h4 className="font-semibold text-indigo-950">Edesis entegrasyonu</h4>
            <p className="mt-1 text-sm text-indigo-800">
              Edesis External API <strong>v1</strong> — tam panel için{' '}
              <Link to="/edesis" className="font-medium underline hover:text-indigo-950">
                Edesis sayfasına
              </Link>{' '}
              gidin.
            </p>
          </div>

          {status && (
            <div className="grid gap-2 rounded-lg border border-indigo-100 bg-white/80 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-slate-600">API key</span>
                <span className={status.configured ? 'font-medium text-green-700' : 'font-medium text-red-600'}>
                  {status.configured ? 'Tanımlı' : 'Eksik (Vercel)'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600">Sistemde öğrenci</span>
                <span className="font-medium">{status.studentsInDb ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600">E-posta dolu</span>
                <span>{status.studentsWithEmail ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600">Edesis ID dolu</span>
                <span>{status.studentsWithEdesisId ?? '—'}</span>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-red-200 bg-red-50/90 p-3 text-sm text-red-950">
            <p className="mb-2 font-semibold">Yaygın hatalar (v1 rehber)</p>
            <ul className="list-disc space-y-1 pl-4 text-xs">
              <li>
                Yanlış path: <code>/api/external/sinav-sonuclari</code> →{' '}
                <code>/api/external/v1/exams/results</code>
              </li>
              <li>
                <code>KurumKodu</code> header gerekmez — key kuruma özel
              </li>
              <li>
                Key paketi <strong>exams</strong> veya <strong>student_dashboard</strong> (basic → 403)
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950">
            <p className="mb-2 font-semibold">Sonuç boş geliyorsa</p>
            <ol className="list-decimal space-y-1 pl-4 text-xs">
              <li>Edesis’te son 2 yılda değerlendirilmiş sınav var mı?</li>
              <li>Öğrenci eşleme: <code>studentId</code> veya e-posta</li>
              <li>Hemen: JSON içe aktar (v1 alanları: studentName, score, examName)</li>
            </ol>
          </div>

          <div className="rounded-lg border border-indigo-100 bg-white/80 p-3 text-sm text-indigo-950">
            <p className="mb-2 font-semibold">Öğrenci nasıl eşlenir?</p>
            <ol className="list-decimal space-y-1 pl-4 text-xs">
              <li>
                <strong>Öncelik:</strong> <code>studentId</code> → <code>edesis_ogrenci_id</code>, sonra e-posta, ad
              </li>
              <li>
                v1 sonuç satırı: <code>studentName</code>, <code>score</code>, <code>examName</code>
              </li>
            </ol>
            <p className="mt-2 text-xs">
              Edesis yalnızca sınav listesi veriyorsa öğrenci satırı gelmez — sonuç export veya öğrenci
              endpoint gerekir. JSON içe aktarırken her satırda <code>email</code> veya{' '}
              <code>ogrenciAdi</code> + <code>toplamNet</code> olsun.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void reloadStatus()}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-50"
            >
              <RefreshCw className="h-4 w-4" />
              Yenile
            </button>
            <button
              type="button"
              disabled={!status?.configured || busy !== null}
              onClick={() => void onProbe()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === 'probe' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Bağlantıyı test et
            </button>
            <button
              type="button"
              disabled={!status?.configured || busy !== null}
              onClick={() => void onSync()}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
              Edesis’ten çek
            </button>
          </div>

          <div className="rounded-lg border border-dashed border-indigo-200 bg-white/60 p-3">
            <p className="mb-2 text-xs font-medium text-indigo-900">API çalışmazsa: JSON içe aktar</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={4}
              placeholder='[{"ogrenciAdi":"Belen Rodoplu","email":"...","sinavAdi":"TYT 1","toplamNet":85}]'
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                setImportText(
                  JSON.stringify(
                    [
                      {
                        ogrenciAdi: 'Belen Rodoplu',
                        email: 'ORNEK@MAIL.COM',
                        sinavAdi: 'TYT Deneme',
                        sinavTarihi: new Date().toISOString().slice(0, 10),
                        toplamNet: 0
                      }
                    ],
                    null,
                    2
                  )
                )
              }
              className="mb-2 inline-flex rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-800"
            >
              Örnek şablon (Belen — maili düzeltin)
            </button>
            <button
              type="button"
              disabled={busy !== null || !importText.trim()}
              onClick={() => void onImport()}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
            >
              {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              JSON içe aktar
            </button>
          </div>

          {lastResult && (
            <div className="space-y-2">
              {lastResult.diagnosis ? (
                <p className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-950">
                  {lastResult.diagnosis}
                </p>
              ) : null}
              {(lastResult as { jsonShape?: { hint?: Record<string, string>; keys?: string[] } }).jsonShape ? (
                <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                  API yanıtı:{' '}
                  {JSON.stringify(
                    (lastResult as { jsonShape?: { hint?: Record<string, string> } }).jsonShape?.hint ||
                      (lastResult as { jsonShape?: { keys?: string[] } }).jsonShape?.keys
                  )}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-6">
                <div className="rounded bg-white/80 p-2">
                  <span className="text-slate-500">Gelen</span>
                  <p className="font-bold text-slate-900">{lastResult.fetched ?? '—'}</p>
                </div>
                <div className="rounded bg-white/80 p-2">
                  <span className="text-slate-500">Ders detayı</span>
                  <p className="font-bold text-violet-700">
                    {(lastResult as { enrichedCount?: number }).enrichedCount ?? '—'}
                  </p>
                </div>
                <div className="rounded bg-white/80 p-2">
                  <span className="text-slate-500">İsimli satır</span>
                  <p className="font-bold text-slate-800">
                    {(lastResult as { rowsWithStudentFields?: number }).rowsWithStudentFields ?? '—'}
                  </p>
                </div>
                <div className="rounded bg-white/80 p-2">
                  <span className="text-slate-500">Eşleşen</span>
                  <p className="font-bold text-green-700">{lastResult.matched ?? '—'}</p>
                </div>
                <div className="rounded bg-white/80 p-2">
                  <span className="text-slate-500">Aktarılan</span>
                  <p className="font-bold text-indigo-700">{lastResult.imported ?? '—'}</p>
                </div>
                <div className="rounded bg-white/80 p-2">
                  <span className="text-slate-500">Eşleşmeyen</span>
                  <p className="font-bold text-red-600">{lastResult.unmatchedCount ?? '—'}</p>
                </div>
              </div>
              {(lastResult.unmatchedSample as { name?: string; email?: string; hint?: string }[])?.length ? (
                <div className="rounded border border-red-200 bg-red-50 p-2 text-xs">
                  <p className="font-medium text-red-800">Eşleşmeyen örnekler:</p>
                  <ul className="mt-1 list-disc pl-4 text-red-900">
                    {(lastResult.unmatchedSample as { name?: string; email?: string; hint?: string }[]).map(
                      (u, i) => (
                        <li key={i}>
                          {u.name || '—'} · {u.email || 'e-posta yok'} — {u.hint || ''}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              ) : null}
              <pre className="max-h-32 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-green-100">
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            </div>
          )}

          <p className="text-xs text-indigo-700">
            Vercel: <code>EDESIS_API_KEY</code>, <code>EDESIS_API_BASE_URL=https://onlinevipdershane.api.edesis.com</code>,{' '}
            <code>EDESIS_AUTH_MODE=x-api-key</code>. KurumKodu / RESULTS_PATH gerekmez (v1).
          </p>
        </div>
      </div>
    </div>
  );
}
