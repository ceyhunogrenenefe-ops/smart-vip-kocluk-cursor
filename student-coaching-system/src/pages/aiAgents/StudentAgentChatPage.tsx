import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Bot,
  Send,
  Camera,
  Loader2,
  ArrowLeft,
  Sparkles,
  BookOpen,
  X,
  Image as ImageIcon
} from 'lucide-react';
import {
  getMyUsage,
  listAgents,
  listMessages,
  sendChat
} from '../../lib/aiAgents/aiAgentsApi';
import type { AIAgent, AIAgentMessage } from '../../types/aiAgents.types';
import { fileToBase64 } from '../../lib/aiAgents/pdfExtract';

export default function StudentAgentChatPage() {
  const params = useParams<{ id: string }>();
  const agentId = params.id || '';
  const navigate = useNavigate();
  const [agent, setAgent] = useState<AIAgent | null>(null);
  const [messages, setMessages] = useState<AIAgentMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [pendingImage, setPendingImage] = useState<{ base64: string; mime: string; preview: string } | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const all = await listAgents();
      const a = all.find((x) => x.id === agentId);
      if (!a) return navigate('/ai-agents');
      setAgent(a);
    })();
  }, [agentId, navigate]);

  useEffect(() => {
    (async () => {
      try {
        setUsage(await getMyUsage());
      } catch {
        /* yoksay */
      }
    })();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, busy]);

  const onSelectImage = async (file: File) => {
    const { base64, mime } = await fileToBase64(file);
    setPendingImage({ base64, mime, preview: `data:${mime};base64,${base64}` });
  };

  const send = async () => {
    if (!agent || busy) return;
    if (!text.trim() && !pendingImage) return;

    setBusy(true);
    const userMsg: AIAgentMessage = {
      id: Date.now(),
      role: 'user',
      content: text.trim() || '(görsel soru)',
      image_url: pendingImage?.preview || null,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMsg]);
    const sendText = text;
    const sendImg = pendingImage;
    setText('');
    setPendingImage(null);

    try {
      const res = await sendChat({
        agent_id: agent.id,
        text: sendText,
        conversation_id: conversationId || undefined,
        image_base64: sendImg?.base64,
        image_mime: sendImg?.mime
      });
      if (!conversationId) setConversationId(res.conversation_id);
      const reply: AIAgentMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: res.answer,
        citations: res.citations,
        model: res.model,
        created_at: new Date().toISOString()
      };
      setMessages((prev) => [...prev, reply]);
      try {
        setUsage(await getMyUsage());
      } catch {
        /* yoksay */
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'monthly_chat_limit_reached') {
        alert('Aylık mesaj limitiniz doldu. Lütfen sonraki aya kadar bekleyin veya öğretmeninizle iletişime geçin.');
      } else if (msg === 'monthly_budget_reached') {
        alert('Kurumun bu ayki AI bütçesi tamamlandı.');
      } else if (msg === 'openai_api_key_missing') {
        alert('AI servisi yapılandırılmamış.');
      } else {
        alert(`Hata: ${msg}`);
      }
      setMessages((prev) => prev.slice(0, -1));
      setText(sendText);
      setPendingImage(sendImg);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = useMemo(
    () =>
      agent
        ? [
            `${agent.subject} dersinde temel konuları özetle`,
            'Anlamadığım bir konuyu basit cümlelerle anlat',
            'Bu konudan örnek soru çöz',
            'Konunun kazanımlarını listele'
          ]
        : [],
    [agent]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-3xl mx-auto p-2 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <Link
          to="/ai-agents"
          className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Ajanlar
        </Link>
        {usage && (
          <div className="text-xs text-slate-500">
            Bu ay: <strong>{usage.used}</strong> / {usage.limit} mesaj
          </div>
        )}
      </div>

      {agent && (
        <div className="bg-white border rounded-xl p-3 mb-2 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">{agent.name}</div>
            <div className="text-xs text-slate-500">
              {agent.subject}
              {agent.grade_level ? ` · ${agent.grade_level}` : ''}
            </div>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-slate-50/60 rounded-xl border p-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-center text-slate-400 py-12">
            <Sparkles className="w-6 h-6 mx-auto mb-2 text-blue-400" />
            <div className="font-medium text-slate-600">{agent?.name}'a soru sor!</div>
            <div className="text-xs mt-1">Yazılı soru ya da kameradan fotoğraf çekerek başlayabilirsin.</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto mt-4">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setText(s)}
                  className="text-left px-3 py-2 text-sm bg-white border rounded-lg hover:bg-blue-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ${
                m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border'
              }`}
            >
              {m.image_url && m.role === 'user' && (
                <div className="mb-1 inline-flex items-center gap-1 text-xs opacity-80">
                  <ImageIcon className="w-3.5 h-3.5" /> görsel ek
                </div>
              )}
              <div>{m.content}</div>
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] opacity-80">
                  <div className="font-medium mb-0.5 inline-flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> Kaynaklar
                  </div>
                  <ul className="space-y-0.5">
                    {m.citations.slice(0, 4).map((c, i) => (
                      <li key={i}>
                        [{i + 1}] sayfa {c.page_no ?? '?'} · benzerlik {Math.round((c.score || 0) * 100)}%
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-white border rounded-2xl px-3 py-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> {agent?.name} düşünüyor…
            </div>
          </div>
        )}
      </div>

      {pendingImage && (
        <div className="mt-2 flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <img src={pendingImage.preview} alt="" className="w-12 h-12 object-cover rounded" />
          <div className="text-xs text-amber-800 flex-1">Görsel eklendi. Mesajınızı yazıp gönderebilirsiniz.</div>
          <button onClick={() => setPendingImage(null)} className="p-1 text-amber-700 hover:bg-amber-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="mt-2 flex items-end gap-2">
        <label className="p-2 border rounded-lg bg-white cursor-pointer hover:bg-slate-50" title="Kamera/Galeri">
          <Camera className="w-5 h-5 text-slate-600" />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSelectImage(f);
              e.target.value = '';
            }}
          />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Sorunu yaz… (Enter ile gönder)"
          rows={1}
          className="flex-1 resize-none text-sm px-3 py-2 border rounded-lg max-h-32"
        />
        <button
          onClick={send}
          disabled={busy || (!text.trim() && !pendingImage)}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
