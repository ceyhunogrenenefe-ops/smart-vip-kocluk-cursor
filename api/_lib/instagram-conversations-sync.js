/**
 * Instagram DM backfill — Meta Conversations API.
 * Webhook kaçırılan (Kommo’ya giden) IG reklam / DM’leri CRM’e çeker.
 */
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';
import { resolveSocialToken, resolvePageId, igBusinessIdEnv } from './meta-social-inbound.js';
import { syncInstagramMessagingToCrm } from './crm-inbox.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

async function graphGet(path, tok) {
  const url = path.startsWith('http')
    ? path
    : `https://graph.facebook.com/${GRAPH()}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(tok)}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function graphErr(json, fallback) {
  const err = json?.error;
  if (!err) return fallback;
  return [err.message || fallback, err.code != null ? `code=${err.code}` : null].filter(Boolean).join(' | ');
}

/** Graph conversation message → webhook-benzeri messaging event */
export function graphMessageToMessagingEvent(msg, { igBusinessId, pageId } = {}) {
  if (!msg || typeof msg !== 'object') return null;
  const fromId = String(msg.from?.id || '').trim();
  if (!fromId) return null;
  const selfIds = new Set(
    [igBusinessId, pageId].map((x) => String(x || '').trim()).filter(Boolean)
  );
  if (selfIds.has(fromId)) return null;

  const text = msg.message != null ? String(msg.message) : null;
  const attachments = Array.isArray(msg.attachments?.data) ? msg.attachments.data : [];
  const mid = msg.id ? String(msg.id) : null;
  const ts = msg.created_time ? Date.parse(msg.created_time) : Date.now();
  if (!text && !attachments.length) return null;

  return {
    sender: { id: fromId },
    recipient: { id: igBusinessId || pageId || undefined },
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
    message: {
      mid,
      text,
      attachments: attachments.length
        ? attachments.map((a) => ({
            type: a?.mime_type || 'file',
            payload: {
              url: a?.image_data?.url || a?.file_url || a?.video_data?.url || null
            }
          }))
        : undefined
    },
    _sync_source: 'graph_conversations'
  };
}

/**
 * Son IG konuşmalarını Graph’tan çekip CRM’e yazar.
 * @param {{ limit?: number, messagesPerThread?: number, apply?: boolean }} opts
 */
export async function syncInstagramConversationsFromGraph(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 15, 1), 40);
  const messagesPerThread = Math.min(Math.max(Number(opts.messagesPerThread) || 20, 1), 50);
  const apply = opts.apply !== false;

  await loadMetaWhatsAppSecretsFromDb().catch(() => null);
  const { token, source } = resolveSocialToken();
  const pageId = resolvePageId();
  const igId = igBusinessIdEnv();

  const out = {
    ok: false,
    token_present: Boolean(token),
    token_source: source,
    page_id: pageId || null,
    instagram_business_id: igId || null,
    conversations_scanned: 0,
    events_built: 0,
    crm: null,
    error: null,
    hint: null
  };

  if (!token) {
    out.error = 'page_token_missing';
    out.hint = 'META_BOUND_PAGE_TOKEN / sayfa token yok — Widgetler’den Instagram bağlayın.';
    return out;
  }
  if (!pageId && !igId) {
    out.error = 'page_or_ig_id_missing';
    out.hint = 'META_PAGE_ID veya META_IG_BUSINESS_ID gerekli.';
    return out;
  }

  const rootId = pageId || igId;
  const fields = [
    'id',
    'updated_time',
    `messages.limit(${messagesPerThread}){id,message,from,created_time,attachments}`
  ].join(',');

  const path = `${encodeURIComponent(rootId)}/conversations?platform=instagram&limit=${limit}&fields=${encodeURIComponent(fields)}`;
  const list = await graphGet(path, token);
  if (!list.ok) {
    out.error = graphErr(list.json, `http_${list.status}`);
    out.hint =
      'Graph conversations okunamadı. pages_messaging + instagram_manage_messages ve Page–IG bağlantısı gerekir.';
    return out;
  }

  const threads = Array.isArray(list.json?.data) ? list.json.data : [];
  out.conversations_scanned = threads.length;

  const events = [];
  for (const thread of threads) {
    const msgs = Array.isArray(thread?.messages?.data) ? thread.messages.data : [];
    const ordered = [...msgs].reverse();
    for (const msg of ordered) {
      const ev = graphMessageToMessagingEvent(msg, { igBusinessId: igId, pageId });
      if (ev) events.push(ev);
    }
  }
  out.events_built = events.length;

  if (!apply) {
    out.ok = true;
    out.hint = `Dry-run: ${threads.length} konuşma, ${events.length} inbound aday.`;
    return out;
  }

  if (!events.length) {
    out.ok = true;
    out.crm = { processed: 0, skipped: 0, issues: [] };
    out.hint = 'Graph’ta yeni inbound IG mesajı yok (veya hepsi bizden).';
    return out;
  }

  try {
    const crm = await syncInstagramMessagingToCrm(events, { channel: 'instagram' });
    out.crm = crm;
    out.ok = true;
    out.hint = `IG Graph sync: ${crm?.processed || 0} yazıldı, ${crm?.skipped || 0} atlandı (${events.length} aday).`;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    out.hint = 'CRM yazımı başarısız.';
  }
  return out;
}
