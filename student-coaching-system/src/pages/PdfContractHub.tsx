import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  FileText,
  Package,
  PenLine,
  MessageCircle,
  Mail,
  History,
  Zap,
  Plus,
  Copy,
  Trash2,
  Loader2,
  Download,
  ExternalLink,
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  TEMPLATE_VARIABLES,
  copyDocumentTemplate,
  createGeneratedDocument,
  deleteDocumentTemplate,
  deleteProgramPackage,
  fetchDocumentTemplates,
  fetchGeneratedDocuments,
  fetchProgramPackages,
  patchDocumentTemplate,
  patchGeneratedDocument,
  saveDocumentTemplate,
  saveProgramPackage,
  type DocumentTemplateKind,
  type DocumentTemplateRow,
  type GeneratedContractRow,
  type ProgramPackageRow
} from '../lib/contractSystemApi';
import { cn } from '../lib/utils';

type HubTab =
  | 'pdf-templates'
  | 'contract-templates'
  | 'rules-templates'
  | 'packages'
  | 'signatures'
  | 'whatsapp'
  | 'mail'
  | 'history'
  | 'automation';

const TAB_LIST: { id: HubTab; label: string }[] = [
  { id: 'pdf-templates', label: 'PDF Şablonları' },
  { id: 'contract-templates', label: 'Sözleşme Şablonları' },
  { id: 'rules-templates', label: 'Kurallar' },
  { id: 'packages', label: 'Program Paketleri' },
  { id: 'signatures', label: 'Dijital İmzalar' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'mail', label: 'Mail' },
  { id: 'history', label: 'PDF Geçmişi' },
  { id: 'automation', label: 'Otomatik Mesajlar' }
];

function kindForTab(tab: HubTab): DocumentTemplateKind | null {
  if (tab === 'pdf-templates') return 'program_pdf';
  if (tab === 'contract-templates') return 'contract';
  if (tab === 'rules-templates') return 'rules';
  return null;
}

export default function PdfContractHub() {
  const { effectiveUser } = useAuth();
  const readOnly = effectiveUser?.role === 'coach';
  const [tab, setTab] = useState<HubTab>('contract-templates');
  const [templates, setTemplates] = useState<DocumentTemplateRow[]>([]);
  const [packages, setPackages] = useState<ProgramPackageRow[]>([]);
  const [docs, setDocs] = useState<GeneratedContractRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [automation, setAutomation] = useState<
    { trigger_type: string; channels: string[]; message_template: string; enabled: boolean }[]
  >([]);
  const previewRef = useRef<HTMLDivElement>(null);

  const reloadTemplates = useCallback(async () => {
    const k = kindForTab(tab);
    if (!k) return;
    setLoading(true);
    try {
      const data = await fetchDocumentTemplates(k);
      setTemplates(data);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Şablonlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const reloadPackages = useCallback(async () => {
    setLoading(true);
    try {
      setPackages(await fetchProgramPackages());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Paketler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadDocs = useCallback(async () => {
    setLoading(true);
    try {
      setDocs(await fetchGeneratedDocuments());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Geçmiş yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadAutomation = useCallback(async () => {
    const inst = String(effectiveUser?.institutionId || '').trim();
    if (!inst) {
      setAutomation([]);
      return;
    }
    try {
      const res = await apiFetch(`/api/contract-automation-rules?institution_id=${encodeURIComponent(inst)}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.data)) setAutomation(j.data);
    } catch {
      setAutomation([]);
    }
  }, [effectiveUser]);

  useEffect(() => {
    setMsg(null);
    if (kindForTab(tab)) void reloadTemplates();
    else if (tab === 'packages') void reloadPackages();
    else if (tab === 'history' || tab === 'signatures') void reloadDocs();
    else if (tab === 'automation') void reloadAutomation();
  }, [tab, reloadTemplates, reloadPackages, reloadDocs, reloadAutomation]);

  const activeKind = kindForTab(tab);

  const [editor, setEditor] = useState<Partial<DocumentTemplateRow>>({});

  useEffect(() => {
    setEditor({});
  }, [tab]);

  const openNewTemplate = () => {
    if (!activeKind || readOnly) return;
    setEditor({
      kind: activeKind,
      name: '',
      academic_year_label: '2026-2027',
      grade_label: '',
      body: `<p>Sayın {{veli_ad}} {{veli_soyad}},</p>\n<p>{{ogrenci_ad}} {{ogrenci_soyad}} için {{program_adi}} programı kapsamında...</p>`,
      is_active: true
    });
  };

  const saveTpl = async () => {
    const k = (editor.kind || activeKind) as DocumentTemplateKind | undefined;
    if (!editor.name?.trim() || !k) return;
    setLoading(true);
    try {
      if (editor.id) {
        const u = await patchDocumentTemplate(editor.id, { ...editor, kind: k } as DocumentTemplateRow);
        setTemplates((prev) => prev.map((x) => (x.id === u.id ? u : x)));
      } else {
        const c = await saveDocumentTemplate({
          ...(editor as object),
          name: editor.name!,
          kind: k,
          body: String(editor.body || '')
        } as { name: string; kind: DocumentTemplateKind; body: string });
        setTemplates((prev) => [c, ...prev]);
      }
      setEditor({});
      setMsg('Kaydedildi.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Kayıt hatası');
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async (row: GeneratedContractRow) => {
    const el = previewRef.current;
    if (!el) return;
    el.innerHTML = row.merged_html;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    const ratio = w / canvas.width;
    const h = canvas.height * ratio;
    pdf.addImage(img, 'PNG', 0, 0, w, h);
    pdf.save(`${row.contract_number}.pdf`);
  };

  const automationInstId = useMemo(() => String(effectiveUser?.institutionId || '').trim(), [effectiveUser]);

  const saveAutomationRow = async (row: (typeof automation)[0]) => {
    if (!automationInstId) {
      setMsg('Kurum seçimi gerekli (otomasyon için institutionId).');
      return;
    }
    try {
      const res = await apiFetch(
        `/api/contract-automation-rules?institution_id=${encodeURIComponent(automationInstId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(row)
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Kaydedilemedi');
      setMsg('Otomasyon kuralı güncellendi.');
      void reloadAutomation();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Hata');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pb-16">
      <div className="border-b border-slate-200/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-red-600">Smart Koçluk</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-8 h-8 text-blue-700" />
              PDF Şablon Merkezi
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Dinamik değişkenler, program paketleri, dijital imza ve doğrulama. Meta WhatsApp gönderimi için hazır
              mesaj şablonları ve mevcut WhatsApp merkezi ile birlikte kullanın.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100">
            <Shield className="w-4 h-4 shrink-0" />
            <span>
              {readOnly ? 'Koç: salt okunur görünüm' : 'Admin: tam yönetim'} · Değişkenler otomatik dolar
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-6">
        {msg ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {msg}
          </div>
        ) : null}

        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as HubTab)} className="flex flex-col gap-4">
          <Tabs.List className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
            {TAB_LIST.map((t) => (
              <Tabs.Trigger
                key={t.id}
                value={t.id}
                className={cn(
                  'rounded-xl px-3 py-2 text-xs font-semibold transition-all md:text-sm',
                  'data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-700 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-md',
                  'data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-100 dark:data-[state=inactive]:text-slate-300 dark:data-[state=inactive]:hover:bg-slate-800'
                )}
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {(['pdf-templates', 'contract-templates', 'rules-templates'] as HubTab[]).map((tid) => (
            <Tabs.Content key={tid} value={tid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Şablonlar</h2>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={openNewTemplate}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
                  >
                    <Plus className="w-4 h-4" />
                    Yeni şablon
                  </button>
                ) : null}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500">Hazır değişkenler (tıkla — kopyala)</p>
                  <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/80">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="rounded bg-white px-1.5 py-0.5 text-[10px] font-mono text-blue-800 shadow-sm border border-blue-100 hover:border-blue-300 dark:bg-slate-900 dark:text-blue-200"
                        onClick={() => void navigator.clipboard.writeText(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {loading ? <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> : null}
                  <ul className="space-y-2 max-h-[420px] overflow-y-auto">
                    {templates.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{t.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {t.academic_year_label} · Sınıf: {t.grade_label || '—'}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-white dark:border-slate-600"
                            onClick={() => setEditor(t)}
                          >
                            Düzenle
                          </button>
                          {!readOnly ? (
                            <>
                              <button
                                type="button"
                                className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-white"
                                title="Kopyala"
                                onClick={async () => {
                                  try {
                                    const c = await copyDocumentTemplate(t.id);
                                    setTemplates((p) => [c, ...p]);
                                    setMsg('Kopya oluşturuldu.');
                                  } catch (e) {
                                    setMsg(e instanceof Error ? e.message : 'Kopyalanamadı');
                                  }
                                }}
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded-lg border border-red-100 p-1 text-red-600 hover:bg-red-50"
                                onClick={async () => {
                                  if (!confirm('Silinsin mi?')) return;
                                  await deleteDocumentTemplate(t.id);
                                  setTemplates((p) => p.filter((x) => x.id !== t.id));
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {editor.id ? 'Şablon düzenle' : 'Yeni şablon'}
                  </h3>
                  {!readOnly && (editor.kind || activeKind) ? (
                    <>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-600"
                        placeholder="Şablon adı (ör. 2026-2027 9. Sınıf VIP)"
                        value={editor.name || ''}
                        onChange={(e) => setEditor((s) => ({ ...s, name: e.target.value }))}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:bg-slate-950 dark:border-slate-600"
                          placeholder="Eğitim yılı"
                          value={editor.academic_year_label || ''}
                          onChange={(e) => setEditor((s) => ({ ...s, academic_year_label: e.target.value }))}
                        />
                        <input
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:bg-slate-950 dark:border-slate-600"
                          placeholder="Sınıf etiketi"
                          value={editor.grade_label || ''}
                          onChange={(e) => setEditor((s) => ({ ...s, grade_label: e.target.value }))}
                        />
                      </div>
                      <textarea
                        className="w-full min-h-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:bg-slate-950 dark:border-slate-600"
                        value={editor.body || ''}
                        onChange={(e) => setEditor((s) => ({ ...s, body: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => void saveTpl()}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                      >
                        Kaydet
                      </button>
                    </>
                  ) : readOnly ? (
                    <p className="text-sm text-slate-500">Koç rolü şablon düzenleyemez.</p>
                  ) : (
                    <p className="text-sm text-slate-500">Düzenlemek için soldan şablon seçin veya yeni oluşturun.</p>
                  )}
                </div>
              </div>
            </Tabs.Content>
          ))}

          <Tabs.Content value="packages" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <PackagesPanel readOnly={readOnly} packages={packages} onReload={reloadPackages} onMsg={setMsg} />
          </Tabs.Content>

          <Tabs.Content value="signatures" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <PenLine className="w-5 h-5 text-blue-700" />
              İmzalı belgeler
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Veli imzası <code className="text-xs bg-slate-100 px-1 rounded">/sign-contract/…</code> bağlantısı ile
              alınır; IP ve cihaz bilgisi kaydedilir.
            </p>
            <ul className="space-y-2">
              {docs
                .filter((d) => d.status === 'signed')
                .map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
                    <span className="font-mono text-emerald-900 dark:text-emerald-100">{d.contract_number}</span>
                    <button
                      type="button"
                      className="text-blue-700 text-xs font-semibold hover:underline"
                      onClick={() => void downloadPdf(d)}
                    >
                      PDF indir
                    </button>
                  </li>
                ))}
            </ul>
          </Tabs.Content>

          <Tabs.Content value="whatsapp" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <MessageCircle className="w-5 h-5 text-green-600" />
              WhatsApp gönderimi
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Meta Cloud API ile gönderim için{' '}
              <Link to="/whatsapp" className="text-blue-700 font-semibold hover:underline">
                WhatsApp Panel
              </Link>{' '}
              ve{' '}
              <Link to="/message-templates" className="text-blue-700 font-semibold hover:underline">
                WA şablonları
              </Link>{' '}
              sayfalarını kullanın. Önerilen metin içi değişkenler:{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">{'{{imza_baglantisi}}'}</code>,{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">{'{{qr_dogrulama_linki}}'}</code> (belge üretiminde
              otomatik dolar).
            </p>
          </Tabs.Content>

          <Tabs.Content value="mail" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Mail className="w-5 h-5 text-blue-600" />
              E-posta
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              SMTP / kurumsal posta entegrasyonu bir sonraki sprintte eklenebilir. Otomasyon kurallarında &quot;email&quot;
              kanalı şimdiden seçilebilir.
            </p>
          </Tabs.Content>

          <Tabs.Content value="history" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <History className="w-5 h-5 text-slate-600" />
              PDF / sözleşme geçmişi
            </h2>
            <HistoryPanel docs={docs} onDownload={downloadPdf} onReload={reloadDocs} readOnly={readOnly} onMsg={setMsg} />
          </Tabs.Content>

          <Tabs.Content value="automation" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Zap className="w-5 h-5 text-amber-500" />
              Otomatik mesaj ayarları
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 mb-4">
              Tetikleyiciler tanımlıdır; cron / etkinlik bağları aşamalı olarak genişletilebilir.
            </p>
            <div className="space-y-3">
              {automation.map((row) => (
                <div key={row.trigger_type} className="rounded-xl border border-slate-100 p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.trigger_type}</span>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        disabled={readOnly}
                        onChange={(e) =>
                          setAutomation((list) =>
                            list.map((x) => (x.trigger_type === row.trigger_type ? { ...x, enabled: e.target.checked } : x))
                          )
                        }
                      />
                      Aktif
                    </label>
                  </div>
                  <textarea
                    className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs dark:bg-slate-950 dark:border-slate-600"
                    rows={2}
                    disabled={readOnly}
                    value={row.message_template}
                    onChange={(e) =>
                      setAutomation((list) =>
                        list.map((x) =>
                          x.trigger_type === row.trigger_type ? { ...x, message_template: e.target.value } : x
                        )
                      )
                    }
                  />
                  {!readOnly ? (
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-blue-700 hover:underline"
                      onClick={() => {
                        const cur = automation.find((x) => x.trigger_type === row.trigger_type);
                        if (cur) void saveAutomationRow(cur);
                      }}
                    >
                      Kaydet
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </Tabs.Content>
        </Tabs.Root>

        <div ref={previewRef} className="fixed left-[-9999px] top-0 w-[794px] bg-white" aria-hidden />
      </div>
    </div>
  );
}

function HistoryPanel({
  docs,
  onDownload,
  onReload,
  readOnly,
  onMsg
}: {
  docs: GeneratedContractRow[];
  onDownload: (d: GeneratedContractRow) => void;
  onReload: () => void;
  readOnly: boolean;
  onMsg: (s: string | null) => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false);

  const gen = async () => {
    if (!studentId.trim()) {
      onMsg('Öğrenci ID girin');
      return;
    }
    setBusy(true);
    try {
      const doc = await createGeneratedDocument({
        student_id: studentId.trim(),
        include_program_pdf: false
      });
      onMsg(`Oluşturuldu: ${doc.contract_number}`);
      void onReload();
    } catch (e) {
      onMsg(e instanceof Error ? e.message : 'Oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!readOnly ? (
        <div className="flex flex-wrap gap-2 items-end rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900 dark:bg-blue-950/20">
          <div>
            <label className="text-xs text-slate-600 dark:text-slate-400">Öğrenci ID (UUID)</label>
            <input
              className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm w-64 dark:bg-slate-950 dark:border-slate-600"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="students.id"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void gen()}
            className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {busy ? '…' : 'Belge üret'}
          </button>
        </div>
      ) : null}
      <ul className="space-y-2 max-h-[480px] overflow-y-auto">
        {docs.map((d) => (
          <li
            key={d.id}
            className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/40 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">{d.contract_number}</p>
              <p className="text-xs text-slate-500">Öğrenci: {d.student_id} · {d.status}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-white dark:border-slate-600"
                onClick={() => void onDownload(d)}
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
              <a
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-white dark:border-slate-600"
                href={`/verify-document?t=${encodeURIComponent(d.verify_token)}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Doğrula
              </a>
              <a
                className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                href={`/sign-contract/${encodeURIComponent(d.signing_token)}`}
                target="_blank"
                rel="noreferrer"
              >
                İmza linki
              </a>
              {!readOnly && d.status === 'draft' ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-blue-700"
                  onClick={async () => {
                    await patchGeneratedDocument(d.id, { status: 'sent' });
                    void onReload();
                  }}
                >
                  Gönderildi işaretle
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PackagesPanel({
  readOnly,
  packages,
  onReload,
  onMsg
}: {
  readOnly: boolean;
  packages: ProgramPackageRow[];
  onReload: () => void;
  onMsg: (s: string | null) => void;
}) {
  const { effectiveUser } = useAuth();
  const [form, setForm] = useState<Partial<ProgramPackageRow>>({ weekly_hours: 6, price_numeric: 0 });
  const [allTpl, setAllTpl] = useState<DocumentTemplateRow[]>([]);

  useEffect(() => {
    void fetchDocumentTemplates().then(setAllTpl).catch(() => setAllTpl([]));
  }, []);

  const tplOpts = (k: DocumentTemplateKind) => allTpl.filter((t) => t.kind === k);

  const save = async () => {
    if (!form.name?.trim()) {
      onMsg('Paket adı gerekli');
      return;
    }
    try {
      const inst =
        effectiveUser?.role === 'super_admin' && form.institution_id
          ? String(form.institution_id)
          : String(effectiveUser?.institutionId || '');
      if (!inst) {
        onMsg('Kurum ID gerekli');
        return;
      }
      await saveProgramPackage({ ...form, name: form.name!, institution_id: inst } as { name: string; institution_id: string });
      onMsg('Paket kaydedildi.');
      setForm({ weekly_hours: 6, price_numeric: 0 });
      void onReload();
    } catch (e) {
      onMsg(e instanceof Error ? e.message : 'Hata');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
          <Package className="w-5 h-5 text-red-600" />
          Paketler
        </h2>
        <ul className="space-y-2 max-h-[400px] overflow-y-auto">
          {packages.map((p) => (
            <li key={p.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
              <p className="text-xs text-slate-500">
                {p.grade_label} · {p.weekly_hours} saat/hafta · kamera: {p.camera_required ? 'evet' : 'hayır'}
              </p>
              {!readOnly ? (
                <button
                  type="button"
                  className="mt-1 text-xs text-red-600"
                  onClick={async () => {
                    if (!confirm('Silinsin mi?')) return;
                    await deleteProgramPackage(p.id);
                    void onReload();
                  }}
                >
                  Sil
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {!readOnly ? (
        <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/30 p-3 dark:border-blue-900 dark:bg-blue-950/20">
          <h3 className="text-sm font-semibold text-blue-950 dark:text-blue-100">Yeni program paketi</h3>
          {effectiveUser?.role === 'super_admin' ? (
            <input
              className="w-full rounded-lg border px-2 py-1.5 text-xs font-mono dark:bg-slate-950 dark:border-slate-600"
              placeholder="Kurum ID (institution_id)"
              value={String(form.institution_id || '')}
              onChange={(e) => setForm((s) => ({ ...s, institution_id: e.target.value }))}
            />
          ) : null}
          <input
            className="w-full rounded-lg border px-2 py-1.5 text-sm dark:bg-slate-950 dark:border-slate-600"
            placeholder="Paket adı (ör. 9. Sınıf VIP)"
            value={form.name || ''}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-lg border px-2 py-1 text-xs dark:bg-slate-950 dark:border-slate-600"
              placeholder="Sınıf etiketi"
              value={form.grade_label || ''}
              onChange={(e) => setForm((s) => ({ ...s, grade_label: e.target.value }))}
            />
            <input
              className="rounded-lg border px-2 py-1 text-xs dark:bg-slate-950 dark:border-slate-600"
              placeholder="Alan"
              value={form.field_domain || ''}
              onChange={(e) => setForm((s) => ({ ...s, field_domain: e.target.value }))}
            />
          </div>
          <label className="text-xs text-slate-600">Haftalık saat</label>
          <input
            type="number"
            className="w-full rounded-lg border px-2 py-1 text-sm dark:bg-slate-950 dark:border-slate-600"
            value={form.weekly_hours ?? 0}
            onChange={(e) => setForm((s) => ({ ...s, weekly_hours: Number(e.target.value) }))}
          />
          <label className="text-xs text-slate-600">PDF şablonu</label>
          <select
            className="w-full rounded-lg border px-2 py-1 text-sm dark:bg-slate-950 dark:border-slate-600"
            value={form.pdf_template_id || ''}
            onChange={(e) => setForm((s) => ({ ...s, pdf_template_id: e.target.value || null }))}
          >
            <option value="">—</option>
            {tplOpts('program_pdf').map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="text-xs text-slate-600">Sözleşme şablonu</label>
          <select
            className="w-full rounded-lg border px-2 py-1 text-sm dark:bg-slate-950 dark:border-slate-600"
            value={form.contract_template_id || ''}
            onChange={(e) => setForm((s) => ({ ...s, contract_template_id: e.target.value || null }))}
          >
            <option value="">—</option>
            {tplOpts('contract').map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="text-xs text-slate-600">Kurallar şablonu</label>
          <select
            className="w-full rounded-lg border px-2 py-1 text-sm dark:bg-slate-950 dark:border-slate-600"
            value={form.rules_template_id || ''}
            onChange={(e) => setForm((s) => ({ ...s, rules_template_id: e.target.value || null }))}
          >
            <option value="">—</option>
            {tplOpts('rules').map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={Boolean(form.camera_required)}
              onChange={(e) => setForm((s) => ({ ...s, camera_required: e.target.checked }))}
            />
            Kamera zorunlu
          </label>
          <button type="button" onClick={() => void save()} className="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white">
            Paketi kaydet
          </button>
        </div>
      ) : null}
    </div>
  );
}
