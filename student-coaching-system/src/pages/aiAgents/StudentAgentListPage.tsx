import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { getMyUsage, listAgents } from '../../lib/aiAgents/aiAgentsApi';
import type { AIAgent } from '../../types/aiAgents.types';

export default function StudentAgentListPage() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [a, u] = await Promise.all([
          listAgents(),
          getMyUsage().catch(() => null)
        ]);
        setAgents(a.filter((x) => x.is_active !== false));
        if (u) setUsage(u);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-600" /> AI Ders Koçları
          </h1>
          <p className="text-sm text-slate-500">
            Sana özel hazırlanmış AI koçlardan dersine uygun olanı seç ve sorunu sor.
          </p>
        </div>
        {usage && (
          <div className="text-xs px-3 py-2 rounded-lg bg-white border">
            Bu ay: <strong>{usage.used}</strong> / {usage.limit} mesaj
            <div className="text-[11px] text-slate-500">kalan {usage.remaining}</div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-10">
          <Loader2 className="w-5 h-5 animate-spin inline" /> Yükleniyor…
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
          Henüz aktif koç yok. Öğretmenin / yöneticin yakında ekleyecek.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((a) => (
            <Link
              key={a.id}
              to={`/ai-agents/${a.id}`}
              className="bg-white border rounded-xl p-4 hover:shadow-md hover:border-blue-300 transition group"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center">
                  <Bot className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-1">
                    {a.name}
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 ml-auto" />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {a.subject}
                    {a.grade_level ? ` · ${a.grade_level}` : ''}
                  </div>
                  {a.description && (
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{a.description}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
