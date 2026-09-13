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

export function CrmTemplateCreateModal({
  open,
  creating,
  name,
  body,
  category,
  onName,
  onBody,
  onCategory,
  onClose,
  onSubmit
}: {
  open: boolean;
  creating: boolean;
  name: string;
  body: string;
  category: 'UTILITY' | 'MARKETING';
  onName: (v: string) => void;
  onBody: (v: string) => void;
  onCategory: (v: 'UTILITY' | 'MARKETING') => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Şablon ekle</h3>
            <p className="text-xs text-slate-500">Kommo gibi: yaz, sağda gör, Meta’ya onaya gönder.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-2">
          <div className="space-y-3 border-b border-slate-200 p-4 md:border-b-0 md:border-r dark:border-slate-700">
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-500">Şablon adı</span>
              <input
                value={name}
                onChange={(e) => onName(e.target.value)}
                placeholder="örn. hosgeldin_veli"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-500">Kategori</span>
              <select
                value={category}
                onChange={(e) => onCategory(e.target.value as 'UTILITY' | 'MARKETING')}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="UTILITY">UTILITY — işlem / bilgilendirme</option>
                <option value="MARKETING">MARKETING — kampanya</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-500">Mesaj metni</span>
              <textarea
                value={body}
                onChange={(e) => onBody(e.target.value)}
                rows={10}
                placeholder={'Merhaba {{1}}, Online VIP Dershane.\nGorusme saati: {{2}}.'}
                className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <p className="text-[11px] text-slate-400">
              Başlık veya görsel zorunlu değil. Değişken: {'{{1}}'} veya {'{{veli_adi}}'}. Onaydan sonra pipeline ve
              inbox’tan seçilir.
            </p>
          </div>
          <div className="bg-slate-50 p-4 dark:bg-slate-950/40">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Önizleme</p>
            <div className="rounded-2xl rounded-br-md bg-emerald-600 px-3 py-2 text-sm text-white shadow-sm">
              <p className="whitespace-pre-wrap break-words">
                {body.trim() || 'Metin yazdıkça burada görünecek…'}
              </p>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">Müşteri WhatsApp / Instagram’da bu metni görür.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
            İptal
          </button>
          <button
            type="button"
            disabled={creating || !name.trim() || !body.trim()}
            onClick={onSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Meta’ya onaya gönder
          </button>
        </div>
      </div>
    </div>
  );
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
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
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
        <div className="space-y-3 p-4">
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
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
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
