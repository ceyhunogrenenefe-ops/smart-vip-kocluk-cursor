import { useEffect, useState } from 'react';
import { GraduationCap, Loader2, Send, Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmGetTeacherTemplate,
  crmSaveTeacherTemplate,
  crmSendMessage,
  crmListMetaTemplates,
  type CrmMetaTemplate
} from '../../lib/crmInboxApi';

/**
 * Öğretmen başvurusu şeridi.
 * Gelen mesaj başvuru gibi göründüğünde konuşmada çıkar. Şablon KENDİLİĞİNDEN
 * gitmez; temsilci düğmeye basınca gönderilir.
 */
export default function CrmTeacherApplicationBar({
  conversationId,
  isAdmin,
  onSent
}: {
  conversationId: string;
  isAdmin: boolean;
  onSent?: () => void;
}) {
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [language, setLanguage] = useState('tr');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [options, setOptions] = useState<CrmMetaTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    void crmGetTeacherTemplate()
      .then((r) => {
        if (cancelled) return;
        setTemplateName(r.data.template_name);
        setLanguage(r.data.language || 'tr');
      })
      .catch(() => {
        /* ayar okunamazsa şerit yine görünür, düğme uyarır */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const send = async () => {
    if (!templateName) {
      toast.error('Önce öğretmen başvurusu şablonunu seçin');
      return;
    }
    setBusy(true);
    try {
      await crmSendMessage(conversationId, '', {
        template_name: templateName,
        template_language: language
      });
      toast.success('Öğretmen başvurusu şablonu gönderildi');
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şablon gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  const openPicker = async () => {
    setPicking(true);
    try {
      const r = await crmListMetaTemplates();
      setOptions(r.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şablonlar alınamadı');
      setPicking(false);
    }
  };

  const choose = async (name: string) => {
    try {
      const r = await crmSaveTeacherTemplate(name, language);
      setTemplateName(r.data.template_name);
      setPicking(false);
      toast.success('Şablon seçildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    }
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-900">
          <GraduationCap className="h-4 w-4" />
          Öğretmen başvurusu görünüyor
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {templateName ? 'Şablonu gönder' : 'Şablon seçilmedi'}
        </button>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => void openPicker()}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100"
          >
            <Settings className="h-3.5 w-3.5" />
            {templateName ? `Şablon: ${templateName}` : 'Şablon seç'}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-violet-800">
        Mesaj kendiliğinden gönderilmez; gönderme kararı sizde.
      </p>

      {picking ? (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-violet-200 bg-white p-2">
          {!options.length ? (
            <p className="px-1 py-2 text-xs text-slate-500">Onaylı şablon bulunamadı.</p>
          ) : (
            options.map((t) => (
              <button
                key={`${t.name}-${t.language}`}
                type="button"
                onClick={() => void choose(t.name)}
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-slate-800 hover:bg-violet-50"
              >
                <span className="font-medium">{t.name}</span>
                {t.language ? <span className="ml-1 text-slate-500">· {t.language}</span> : null}
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="mt-1 w-full rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            Kapat
          </button>
        </div>
      ) : null}
    </div>
  );
}
