import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Facebook,
  FileText,
  Instagram,
  Loader2,
  Plus,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  UserPlus
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import {
  crmAddNote,
  crmAssignConversation,
  crmEnsureInbound,
  crmInboundStatus,
  crmListAgents,
  crmCreateMetaTemplate,
  crmListCanned,
  crmListConversations,
  crmListMessages,
  crmListMetaTemplates,
  crmListNotes,
  crmMarkRead,
  crmPoll,
  crmSendMessage,
  crmSetTags,
  crmTakeConversation,
  crmUpdateStatus,
  type CrmConversation,
  type CrmInboundStatus,
  type CrmMessage,
  type CrmMetaTemplate
} from '../../lib/crmInboxApi';
import { CrmTemplateCreateModal, CrmTemplateSendPreviewModal } from './CrmTemplateModals';

function ChannelBadge({ channel }: { channel: string }) {
  if (channel === 'instagram') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
        <Instagram className="h-3 w-3" /> IG
      </span>
    );
  }
  if (channel === 'facebook') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
        <Facebook className="h-3 w-3" /> FB
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
      <MessageCircle className="h-3 w-3" /> WA
    </span>
  );
}

function formatTime(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function slashQuery(text: string): string | null {
  const lastLine = text.split('\n').pop() ?? '';
  const m = lastLine.match(/(^|\s)\/([^\s]*)$/);
  if (!m) return null;
  return m[2] ?? '';
}

function replaceSlashToken(text: string, replacement: string) {
  return text.replace(/(^|\s)\/([^\s]*)$/, `$1${replacement}`);
}

export default function CrmInboxPage() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const isAdmin = tags.includes('super_admin') || tags.includes('admin');

  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [selected, setSelected] = useState<CrmConversation | null>(null);
  const [q, setQ] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [inbound, setInbound] = useState<CrmInboundStatus | null>(null);
  const [binding, setBinding] = useState(false);
  const [canned, setCanned] = useState<Array<{ id: string; title: string; body: string }>>([]);
  const [metaTemplates, setMetaTemplates] = useState<CrmMetaTemplate[]>([]);
  const [pendingMetaTemplates, setPendingMetaTemplates] = useState<CrmMetaTemplate[]>([]);
  const [metaTplHint, setMetaTplHint] = useState<string | null>(null);
  const [metaTplLoading, setMetaTplLoading] = useState(false);
  const [showCreateTpl, setShowCreateTpl] = useState(false);
  const [createTplName, setCreateTplName] = useState('');
  const [createTplBody, setCreateTplBody] = useState('');
  const [createTplCategory, setCreateTplCategory] = useState<'UTILITY' | 'MARKETING'>('UTILITY');
  const [creatingTpl, setCreatingTpl] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [pendingTpl, setPendingTpl] = useState<CrmMetaTemplate | null>(null);
  const [tplParams, setTplParams] = useState<string[]>([]);
  const [notes, setNotes] = useState<Array<{ id: string; body: string; created_at: string }>>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const pollSinceRef = useRef(new Date().toISOString());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composeRef = useRef<HTMLTextAreaElement | null>(null);

  const loadMetaTemplates = useCallback(async (refresh = false) => {
    setMetaTplLoading(true);
    try {
      const res = await crmListMetaTemplates(refresh);
      setMetaTemplates(res.data || []);
      setPendingMetaTemplates(res.pending || []);
      setMetaTplHint(res.hint || null);
    } catch (e) {
      setMetaTplHint(e instanceof Error ? e.message : 'Şablonlar yüklenemedi');
    } finally {
      setMetaTplLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await crmListConversations({
        q: q || undefined,
        channel: channelFilter || undefined,
        status: statusFilter || undefined
      });
      setConversations(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Konuşmalar yüklenemedi');
    } finally {
      setLoadingList(false);
    }
  }, [q, channelFilter, statusFilter]);

  const loadMessages = useCallback(async (id: string) => {
    setLoadingMsgs(true);
    try {
      const res = await crmListMessages(id);
      setMessages(res.data || []);
      setSelected(res.conversation || null);
      await crmMarkRead(id).catch(() => undefined);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)));
      pollSinceRef.current = new Date().toISOString();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Mesajlar yüklenemedi');
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void crmInboundStatus()
      .then((res) => setInbound(res.data || null))
      .catch(() => undefined);
    void crmListCanned()
      .then((res) => setCanned(res.data || []))
      .catch(() => undefined);
    void loadMetaTemplates(false);
  }, [loadMetaTemplates]);

  useEffect(() => {
    if (!selectedId) {
      setNotes([]);
      return;
    }
    void crmListNotes(selectedId)
      .then((res) => setNotes(res.data || []))
      .catch(() => setNotes([]));
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isAdmin) return;
    void crmListAgents()
      .then((res) => {
        const fromRoles = (res.data?.role_users || []).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email
        }));
        const fromAssign = (res.data?.assignments || [])
          .map((a) => {
            const u = (a as { users?: { id: string; name: string; email: string } }).users;
            return u ? { id: u.id, name: u.name, email: u.email } : null;
          })
          .filter(Boolean) as Array<{ id: string; name: string; email: string }>;
        const map = new Map<string, { id: string; name: string; email: string }>();
        for (const u of [...fromRoles, ...fromAssign]) map.set(u.id, u);
        setAgents([...map.values()]);
      })
      .catch(() => undefined);
  }, [isAdmin]);

  useEffect(() => {
    const t = window.setInterval(() => {
      void crmPoll(pollSinceRef.current, selectedId || undefined)
        .then((res) => {
          if (res.data?.server_time) pollSinceRef.current = res.data.server_time;
          if (selectedId && res.data?.messages?.length) {
            setMessages((prev) => {
              const ids = new Set(prev.map((m) => m.id));
              const next = [...prev];
              for (const m of res.data!.messages!) {
                if (!ids.has(m.id)) next.push(m);
              }
              return next;
            });
          }
          if (res.data?.conversations?.length) {
            setConversations((prev) => {
              const map = new Map(prev.map((c) => [c.id, c]));
              for (const c of res.data!.conversations!) {
                map.set(c.id, { ...(map.get(c.id) || ({} as CrmConversation)), ...c });
              }
              return [...map.values()].sort((a, b) =>
                String(b.last_message_at || '').localeCompare(String(a.last_message_at || ''))
              );
            });
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(t);
  }, [selectedId]);

  const onSend = async () => {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      const res = await crmSendMessage(selectedId, draft.trim());
      if (res.data) setMessages((prev) => [...prev, res.data]);
      setDraft('');
      setSlashOpen(false);
      void loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  const onSendTemplate = async (tpl: CrmMetaTemplate, params: string[]) => {
    if (!selectedId) return;
    const names = tpl.variableNames || [];
    if (tpl.variableCount > 0 && params.some((p) => !String(p || '').trim())) {
      toast.error('Şablon değişkenlerini doldurun.');
      return;
    }
    setSending(true);
    try {
      const res = await crmSendMessage(selectedId, '', {
        template_name: tpl.name,
        template_language: tpl.language,
        template_params: params,
        template_param_names: tpl.variableFormat === 'named' ? names : undefined,
        template_body: tpl.body
      });
      if (res.data) setMessages((prev) => [...prev, res.data]);
      setDraft('');
      setPendingTpl(null);
      setTplParams([]);
      setSlashOpen(false);
      toast.success(
        selected?.channel === 'whatsapp'
          ? `Şablon gönderildi: ${tpl.name}`
          : `Şablon metni ${selected?.channel === 'facebook' ? 'Facebook' : 'Instagram'}’a gönderildi: ${tpl.name}`
      );
      void loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şablon gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  const pickCanned = (body: string) => {
    setDraft(slashQuery(draft) != null ? replaceSlashToken(draft, body) : body);
    setSlashOpen(false);
    composeRef.current?.focus();
  };

  const pickTemplate = (tpl: CrmMetaTemplate) => {
    if (!selectedId) {
      toast.error('Önce bir konuşma seçin.');
      return;
    }
    setDraft(replaceSlashToken(draft, '').replace(/\s+$/, ''));
    setSlashOpen(false);
    setPendingTpl(tpl);
    setTplParams(Array.from({ length: tpl.variableCount }, () => ''));
  };

  const onCreateTemplate = async () => {
    if (!createTplName.trim() || !createTplBody.trim()) {
      toast.error('Şablon adı ve metin gerekli.');
      return;
    }
    setCreatingTpl(true);
    try {
      const res = await crmCreateMetaTemplate({
        name: createTplName.trim(),
        body: createTplBody.trim(),
        category: createTplCategory,
        language: 'tr'
      });
      toast.success(res.message || `Onaya gönderildi: ${res.data?.status || 'PENDING'}`);
      setCreateTplName('');
      setCreateTplBody('');
      setShowCreateTpl(false);
      void loadMetaTemplates(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şablon onaya gönderilemedi');
    } finally {
      setCreatingTpl(false);
    }
  };

  const slashNeedle = slashQuery(draft);
  const slashItems = useMemo(() => {
    if (slashNeedle == null) return [];
    const q = slashNeedle.toLocaleLowerCase('tr');
    const tpls = metaTemplates
      .filter((t) => {
        if (!q) return true;
        const hay = `${t.name} ${t.body} ${t.category || ''}`.toLocaleLowerCase('tr');
        return hay.includes(q);
      })
      .map((t) => ({ kind: 'meta' as const, id: t.id, title: t.name, subtitle: t.body, tpl: t }));
    const cans = canned
      .filter((c) => {
        if (!q) return true;
        const hay = `${c.title} ${c.body}`.toLocaleLowerCase('tr');
        return hay.includes(q);
      })
      .map((c) => ({ kind: 'canned' as const, id: c.id, title: c.title, subtitle: c.body, canned: c }));
    return [...tpls, ...cans].slice(0, 12);
  }, [slashNeedle, metaTemplates, canned]);

  useEffect(() => {
    setSlashOpen(slashNeedle != null && !pendingTpl);
    setSlashHighlight(0);
  }, [slashNeedle, pendingTpl]);

  const adSource = useMemo(() => {
    const d = selected?.ad_source_data;
    if (!d || typeof d !== 'object') return null;
    return d as Record<string, unknown>;
  }, [selected]);

  const lineLabel = inbound?.display_phone || inbound?.company_line || '0850 303 40 14';
  const inboundOk = Boolean(inbound?.bound_to_production);

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs ${
          inboundOk
            ? 'border-emerald-100 bg-emerald-50/90 text-emerald-900'
            : 'border-amber-100 bg-amber-50/90 text-amber-950'
        }`}
      >
        <p className="min-w-0 leading-snug">
          <span className="font-semibold">Kurumsal WhatsApp {lineLabel}</span>
          <span className="mx-1.5 text-current/50">·</span>
          {inboundOk
            ? 'WhatsApp 0850 bağlı.'
            : inbound?.hint || 'WhatsApp hattını bağlayın.'}{' '}
          {inbound?.social?.ok
            ? `Facebook/Instagram: ${inbound.social.page_name || 'sayfa bağlı'}.`
            : inbound?.social?.hint ||
              'Instagram / Facebook için Widgetler’den bağlayın (Kommo gibi tek tık).'}
        </p>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to="/crm/widgetler"
            className="rounded-lg border border-current/20 bg-white/80 px-2.5 py-1 text-[11px] font-semibold hover:bg-white"
          >
            Widgetler
          </Link>
          <button
            type="button"
            disabled={binding}
            onClick={() => {
              setBinding(true);
              void crmEnsureInbound()
                .then((res) => {
                  setInbound(res.data || inbound);
                  toast.success(
                    res.data?.bound_to_production
                      ? 'Kurumsal hat bağlandı — 0850’ye tekrar yazın'
                      : res.data?.hint || 'Bağlama denendi'
                  );
                })
                .catch((e) => toast.error(e instanceof Error ? e.message : 'Bağlanamadı'))
                .finally(() => setBinding(false));
            }}
            className="shrink-0 rounded-lg border border-current/20 bg-white/80 px-2.5 py-1 text-[11px] font-semibold hover:bg-white disabled:opacity-60"
          >
            {binding ? 'Bağlanıyor…' : inboundOk ? 'Hattı yenile' : 'Hattı bağla'}
          </button>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-full max-w-sm flex-col border-r border-slate-200 bg-slate-50/80 sm:w-80">
        <div className="space-y-2 border-b border-slate-200 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ara…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="">Tüm kanallar</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="open">Açık</option>
              <option value="pending">Beklemede</option>
              <option value="closed">Kapalı</option>
              <option value="">Hepsi</option>
            </select>
            <button
              type="button"
              onClick={() => void loadList()}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
              title="Yenile"
            >
              <RefreshCw className={`h-4 w-4 ${loadingList ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList && !conversations.length ? (
            <div className="flex justify-center py-10 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-500">Konuşma yok</p>
          ) : (
            conversations.map((c) => {
              const active = c.id === selectedId;
              const unread = Number(c.unread_count || 0) > 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full flex-col gap-1 border-b border-slate-100 px-3 py-3 text-left transition ${
                    active ? 'bg-emerald-50' : 'hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${
                        unread ? 'font-bold text-slate-900' : 'font-medium text-slate-800'
                      }`}
                    >
                      {c.contact_name || c.contact_identifier}
                    </span>
                    <ChannelBadge channel={c.channel} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">
                      {c.last_message_preview || '—'}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {formatTime(c.last_message_at)}
                    </span>
                  </div>
                  {!c.assigned_user_id && (
                    <span className="text-[10px] font-medium text-amber-600">Havuz · atanmamış</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Bir konuşma seçin
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900">
                    {selected?.contact_name || selected?.contact_identifier || '…'}
                  </h2>
                  {selected && <ChannelBadge channel={selected.channel} />}
                </div>
                <p className="text-xs text-slate-500">{selected?.contact_identifier}</p>
              </div>
              <div className="flex items-center gap-2">
              {selected && !selected.assigned_user_id ? (
                <button
                  type="button"
                  onClick={() => {
                    void crmTakeConversation(selected.id)
                      .then((r) => {
                        setSelected(r.data);
                        toast.success('Konuşma üzerinize alındı');
                        void loadList();
                      })
                      .catch((err) => toast.error(err instanceof Error ? err.message : 'Alınamadı'));
                  }}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  Üzerime al
                </button>
              ) : null}
              <select
                value={selected?.status || 'open'}
                onChange={(e) => {
                  const status = e.target.value as 'open' | 'pending' | 'closed';
                  void crmUpdateStatus(selectedId, status)
                    .then((r) => {
                      setSelected(r.data);
                      void loadList();
                    })
                    .catch((err) => toast.error(err.message));
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              >
                <option value="open">Açık</option>
                <option value="pending">Beklemede</option>
                <option value="closed">Kapalı</option>
              </select>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto bg-gradient-to-b from-white to-slate-50 px-4 py-3">
              {loadingMsgs ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.sender_type === 'agent' || m.sender_type === 'bot';
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          mine
                            ? 'rounded-br-md bg-emerald-600 text-white'
                            : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {m.body || (m.media_url ? '[medya]' : '')}
                        </p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-emerald-100' : 'text-slate-400'}`}>
                          {formatTime(m.created_at)}
                          {m.delivery_status ? ` · ${m.delivery_status}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <div className="relative border-t border-slate-200 p-3">
              {slashOpen && slashNeedle != null ? (
                <div
                  className="absolute bottom-full left-3 right-3 z-20 mb-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
                  role="listbox"
                >
                  <p className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    / şablon ve hazır yanıt
                  </p>
                  {slashItems.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">Eşleşen onaylı şablon veya hazır yanıt yok.</p>
                  ) : null}
                  {slashItems.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={idx === slashHighlight}
                      onMouseEnter={() => setSlashHighlight(idx)}
                      onClick={() => {
                        if (item.kind === 'meta') pickTemplate(item.tpl);
                        else pickCanned(item.canned.body);
                      }}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm ${
                        idx === slashHighlight ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            item.kind === 'meta'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.kind === 'meta' ? 'Meta' : 'Hazır'}
                        </span>
                        <span className="font-medium text-slate-900">{item.title}</span>
                        {item.kind === 'meta' ? (
                          <span className="text-[10px] text-slate-400">{item.tpl.language}</span>
                        ) : null}
                      </span>
                      {item.subtitle ? (
                        <span className="line-clamp-2 text-[11px] text-slate-500">{item.subtitle}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <textarea
                  ref={composeRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (slashOpen && slashItems.length) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSlashHighlight((i) => (i + 1) % slashItems.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSlashHighlight((i) => (i - 1 + slashItems.length) % slashItems.length);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setSlashOpen(false);
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const item = slashItems[slashHighlight];
                        if (item?.kind === 'meta') pickTemplate(item.tpl);
                        else if (item?.kind === 'canned') pickCanned(item.canned.body);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void onSend();
                    }
                  }}
                  rows={2}
                  placeholder="Yanıt yazın…  / ile şablon · Enter = gönder"
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  disabled={sending || !draft.trim()}
                  onClick={() => void onSend()}
                  className="inline-flex h-11 items-center gap-1 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Gönder
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <aside className="hidden w-72 flex-col border-l border-slate-200 bg-slate-50/60 lg:flex">
        <div className="border-b border-slate-200 p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FileText className="h-3.5 w-3.5" />
              Meta şablonları
            </h3>
            <button
              type="button"
              title="Yenile"
              onClick={() => void loadMetaTemplates(true)}
              className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            >
              {metaTplLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <p className="mb-2 text-[10px] text-slate-400">
            WA / IG / FB. <span className="font-mono">/</span> ile seçin. Kommo gibi yeni şablon yazıp Meta’ya onaya
            gönderebilirsiniz.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateTpl(true)}
            className="mb-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Şablon ekle
          </button>
          {metaTemplates.length ? (
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {metaTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={!selectedId}
                  onClick={() => pickTemplate(t)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-[11px] font-semibold text-slate-800">{t.name}</span>
                    <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold uppercase text-emerald-800">
                      {t.status || 'onaylı'}
                    </span>
                  </span>
                  {t.body ? (
                    <span className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{t.body}</span>
                  ) : (
                    <span className="mt-0.5 text-[10px] text-slate-400">{t.language}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">
              {metaTplLoading ? 'Yükleniyor…' : metaTplHint || 'Onaylı şablon yok.'}
            </p>
          )}
          {pendingMetaTemplates.length ? (
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Onay bekleyen</p>
              <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                {pendingMetaTemplates.map((t) => (
                  <div key={t.id} className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5">
                    <p className="truncate text-[11px] font-semibold text-amber-950">{t.name}</p>
                    <p className="text-[10px] text-amber-800">{t.status}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {selected ? (
          <div className="space-y-4 overflow-y-auto p-4 text-sm">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">İletişim</h3>
              <p className="mt-1 font-medium text-slate-900">{selected.contact_name || '—'}</p>
              <p className="text-slate-600">{selected.contact_identifier}</p>
              <p className="mt-1">
                <ChannelBadge channel={selected.channel} />
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Reklam / Kaynak
              </h3>
              {adSource && Object.keys(adSource).length ? (
                <dl className="mt-1 space-y-1 text-xs text-slate-700">
                  {Object.entries(adSource).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="max-w-[55%] truncate text-right font-medium">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Kaynak verisi yok</p>
              )}
            </div>

            {isAdmin && (
              <div>
                <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <UserPlus className="h-3.5 w-3.5" />
                  Ajana ata
                </h3>
                <select
                  value={selected.assigned_user_id || ''}
                  onChange={(e) => {
                    const val = e.target.value || null;
                    void crmAssignConversation(selected.id, val)
                      .then((r) => {
                        setSelected(r.data);
                        toast.success(val ? 'Atandı' : 'Havuza alındı');
                        void loadList();
                      })
                      .catch((err) => toast.error(err.message));
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                >
                  <option value="">— Atanmamış (havuz) —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.email}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {canned.length > 0 && selectedId ? (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Hazır yanıtlar (serbest metin)
                </h3>
                <div className="flex flex-col gap-1">
                  {canned.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setDraft(c.body)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                İç not (ekip)
              </h3>
              <div className="mb-2 max-h-36 space-y-1 overflow-y-auto">
                {notes.length ? (
                  notes.map((n) => (
                    <p key={n.id} className="rounded-md bg-white px-2 py-1 text-[11px] text-slate-700 ring-1 ring-slate-100">
                      {n.body}
                      <span className="mt-0.5 block text-[10px] text-slate-400">{formatTime(n.created_at)}</span>
                    </p>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400">Not yok</p>
                )}
              </div>
              <div className="flex gap-1">
                <input
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Not ekle…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={!selectedId || !noteDraft.trim()}
                  onClick={() => {
                    if (!selectedId || !noteDraft.trim()) return;
                    void crmAddNote(selectedId, noteDraft.trim())
                      .then((r) => {
                        if (r.data) setNotes((prev) => [r.data, ...prev]);
                        setNoteDraft('');
                      })
                      .catch((e) => toast.error(e instanceof Error ? e.message : 'Not eklenemedi'));
                  }}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                  Ekle
                </button>
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Etiketler
              </h3>
              <div className="mb-2 flex flex-wrap gap-1">
                {(selected.metadata?.tags || []).length ? (
                  (selected.metadata?.tags || []).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      title="Kaldır"
                      onClick={() => {
                        const next = (selected.metadata?.tags || []).filter((t) => t !== tag);
                        void crmSetTags(selected.id, next)
                          .then((r) => setSelected(r.data))
                          .catch((e) => toast.error(e instanceof Error ? e.message : 'Etiket silinemedi'));
                      }}
                      className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-rose-100"
                    >
                      {tag} ×
                    </button>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400">Etiket yok</p>
                )}
              </div>
              <div className="flex gap-1">
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const t = tagDraft.trim();
                    if (!t) return;
                    const next = [...new Set([...(selected.metadata?.tags || []), t])].slice(0, 12);
                    void crmSetTags(selected.id, next)
                      .then((r) => {
                        setSelected(r.data);
                        setTagDraft('');
                      })
                      .catch((err) => toast.error(err instanceof Error ? err.message : 'Eklenemedi'));
                  }}
                  placeholder="Etiket + Enter"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                />
              </div>
            </div>

            {selected.lead_id && (
              <p className="text-xs text-slate-500">
                Kayıt:{' '}
                <Link
                  to={`/crm?rt_lead=${encodeURIComponent(selected.lead_id)}`}
                  className="font-medium text-emerald-700 underline"
                >
                  Hunide aç
                </Link>
              </p>
            )}
          </div>
        ) : (
          <p className="p-4 text-xs text-slate-400">Detay için konuşma seçin</p>
        )}
      </aside>
      </div>

      <CrmTemplateCreateModal
        open={showCreateTpl}
        creating={creatingTpl}
        name={createTplName}
        body={createTplBody}
        category={createTplCategory}
        onName={setCreateTplName}
        onBody={setCreateTplBody}
        onCategory={setCreateTplCategory}
        onClose={() => setShowCreateTpl(false)}
        onSubmit={() => void onCreateTemplate()}
      />
      <CrmTemplateSendPreviewModal
        open={Boolean(pendingTpl)}
        template={pendingTpl}
        params={tplParams}
        channel={selected?.channel || 'whatsapp'}
        sending={sending}
        onParams={setTplParams}
        onClose={() => {
          setPendingTpl(null);
          setTplParams([]);
        }}
        onConfirm={() => {
          if (pendingTpl) void onSendTemplate(pendingTpl, tplParams);
        }}
      />
    </div>
  );
}
