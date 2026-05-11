import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchGeneratedDocuments, type GeneratedContractRow } from '../lib/contractSystemApi';
import { FileText, Loader2, ExternalLink } from 'lucide-react';

export default function StudentContractsPage() {
  const { effectiveUser } = useAuth();
  const sid = effectiveUser?.studentId;
  const [docs, setDocs] = useState<GeneratedContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!sid) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        setDocs(await fetchGeneratedDocuments({ student_id: sid }));
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Yüklenemedi');
      } finally {
        setLoading(false);
      }
    })();
  }, [sid]);

  if (!sid) {
    return <p className="p-6 text-slate-600">Öğrenci oturumu gerekli.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
        <FileText className="w-6 h-6 text-blue-700" />
        Belgelerim
      </h1>
      {loading ? <Loader2 className="w-6 h-6 animate-spin text-blue-600" /> : null}
      {err ? <p className="text-red-600 text-sm">{err}</p> : null}
      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap justify-between gap-2">
            <div>
              <p className="font-mono font-semibold">{d.contract_number}</p>
              <p className="text-xs text-slate-500">{d.status}</p>
            </div>
            <a
              href={`/verify-document?t=${encodeURIComponent(d.verify_token)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-700 font-medium"
            >
              Doğrula <ExternalLink className="w-4 h-4" />
            </a>
          </li>
        ))}
      </ul>
      {!loading && docs.length === 0 ? <p className="text-sm text-slate-500">Henüz belge yok.</p> : null}
    </div>
  );
}
