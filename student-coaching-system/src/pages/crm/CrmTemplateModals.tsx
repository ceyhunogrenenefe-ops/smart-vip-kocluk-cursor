import { Loader2, Send, X } from 'lucide-react';
import type { CrmMetaTemplate } from '../../lib/crmInboxApi';

export type PreviewTemplate = {
  id: string;
  name: string;
  body: string;
  language?: string;
  status?: string;
  variableCount: number;
  variableNames?: string[];
  variableFormat?: 'named' | 'positional';
  mediaHeader?: boolean;
  kind?: 'meta_template' | 'local';
};

export function fillTemplatePreview(body: string, params: string[], names: string[]) {
  let out = body || '';
  names.forEach((n, i) => {
    const key = String(n || '').trim();
    if (!key) return;
    const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\{\\{\\s*${safe}\\s*\\}\\}`, 'g'), params[i] ?? '');
  });
  params.forEach((p, i) => {
    out = out.replace(new RegExp(`\\{\\{\\s*${i + 1}\\s*\\}\\}`, 'g'), p ?? '');
  });
  return out;
}

export function CrmTemplateSendPreviewModal({
  open,
  template,
  params,
  channel,
  sending,
  onParams,
  onClose,
  onConfirm
}: {
  open: boolean;
  template: PreviewTemplate | CrmMetaTemplate | null;
  params: string[];
  channel: string;
  sending: boolean;
  onParams: (next: string[]) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || !template) return null;
  const names = template.variableNames || [];
  const preview = fillTemplatePreview(template.body || '', params, names);
  const channelLabel =
    channel === 'instagram' ? 'Instagram' : channel === 'facebook' ? 'Facebook' : 'WhatsApp';
  const varsMissing = (template.variableCount || 0) > 0 && params.some((p) => !String(p || '').trim());

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      {/* Uzun şablonda düğmeler ekran dışına taşmasın: başlık ve alt çubuk sabit, orta alan kayar */}
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Şablonu gönder</h3>
            <p className="text-xs text-slate-500">
              {template.name}
              {template.language ? ` · ${template.language}` : ''} · {channelLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Müşterinin göreceği</p>
            <div className="rounded-2xl rounded-br-md bg-emerald-600 px-3 py-2 text-sm text-white shadow-sm">
              <p className="whitespace-pre-wrap break-words">
                {preview.trim() || template.body || '—'}
              </p>
            </div>
          </div>
          {names.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Değişkenler</p>
              {names.map((n, i) => (
                <input
                  key={`${template.id}-${n}`}
                  value={params[i] || ''}
                  onChange={(e) => {
                    const next = [...params];
                    next[i] = e.target.value;
                    onParams(next);
                  }}
                  placeholder={`{{${n}}}`}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-800"
                />
              ))}
            </div>
          ) : null}
          {'mediaHeader' in template && template.mediaHeader ? (
            <p className="text-[11px] text-amber-700">
              Başlık/görsel yok — WhatsApp’ta mümkünse resmi şablon, değilse metin gider.
            </p>
          ) : null}
          {channel !== 'whatsapp' ? (
            <p className="text-[11px] text-slate-500">{channelLabel}’a gövde metin olarak gider.</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          {varsMissing ? (
            <span className="mr-auto text-[11px] text-amber-700">Göndermek için değişkenleri doldurun</span>
          ) : null}
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
            Vazgeç
          </button>
          <button
            type="button"
            disabled={sending || varsMissing}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Onayla ve gönder
          </button>
        </div>
      </div>
    </div>
  );
}
