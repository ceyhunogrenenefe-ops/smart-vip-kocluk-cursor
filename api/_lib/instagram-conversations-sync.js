/**
 * Instagram DM backfill — Meta Conversations API.
 * Webhook kaçırılan (Kommo’ya giden) IG reklam / DM’leri CRM’e çeker.
 *
 * Not: Tek istekte çok mesaj+attachment istersek Meta code=1
 * (“Please reduce the amount of data”) döner → konuşma listesi ile
 * mesajları ayrı, küçük sayfalarda çekeriz.
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

/**
 * Graph `/conversations` hatasını eyleme dönüşür bir engele çevirir.
 * `(#3) Application does not have the capability` = uygulama Advanced Access
 * almamış; Meta o zaman yalnız uygulamada rolü olan hesapların DM’ini teslim eder.
 * Gerçek müşteri ve reklam DM’leri hiç gelmez — yorumlar gelmeye devam eder.
 * Bu kod tarafında düzeltilemez; Meta App Dashboard’da izin yükseltmesi ister.
 */
export function classifyGraphConversationsError(errText) {
  const s = String(errText || '');
  const isCapability =
    /\|\s*code=3\b/.test(s) ||
    /does not have the capability/i.test(s) ||
    /\(#3\)/.test(s);
  const isPermission =
    /\|\s*code=(10|200|299)\b/.test(s) ||
    /permission|not been granted|advanced access/i.test(s);

  if (isCapability || isPermission) {
    return {
      blocker: 'META_ADVANCED_ACCESS_REQUIRED',
      hint:
        'Meta uygulaması Instagram DM okuma yetkisine sahip değil (Graph code=3). ' +
        'Bu yüzden reklam DM’leri ve yeni kullanıcı DM’leri CRM’e hiç düşmüyor; yorumlar gelmeye devam ediyor. ' +
        'Kod tarafında çözülemez — Meta App Dashboard’da Advanced Access verilmeli.',
      steps: [
        'Meta App Dashboard → Uygulama → App Review → Permissions and Features',
        'instagram_manage_messages için Advanced Access isteyin (Standard Access yetmez)',
        'pages_messaging + pages_manage_metadata için de Advanced Access isteyin',
        'Uygulamayı Development değil Live moda alın',
        'Onaydan sonra Widgetler → Hattı bağla ile sayfayı yeniden yetkilendirin (token yeni scope’ları alsın)'
      ]
    };
  }
  return {
    blocker: null,
    hint: 'Graph conversations okunamadı. pages_messaging + instagram_manage_messages ve Page–IG bağlantısı gerekir.',
    steps: null
  };
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

async function listConversationIds(rootId, tok, limit) {
  const attempts = [
    `${encodeURIComponent(rootId)}/conversations?platform=instagram&limit=${limit}&fields=id,updated_time`,
    `${encodeURIComponent(rootId)}/conversations?platform=instagram&limit=${Math.min(limit, 5)}&fields=id`
  ];
  let last = null;
  for (const path of attempts) {
    const res = await graphGet(path, tok);
    last = res;
    if (res.ok) {
      const rows = Array.isArray(res.json?.data) ? res.json.data : [];
      return { ok: true, ids: rows.map((r) => String(r.id || '').trim()).filter(Boolean), raw: res };
    }
  }
  return { ok: false, ids: [], raw: last };
}

async function fetchThreadMessages(conversationId, tok, messagesPerThread) {
  const fields = `messages.limit(${messagesPerThread}){id,message,from,created_time}`;
  const attempts = [
    `${encodeURIComponent(conversationId)}?fields=${encodeURIComponent(fields)}`,
    `${encodeURIComponent(conversationId)}?fields=${encodeURIComponent(
      `messages.limit(${Math.min(messagesPerThread, 5)}){id,message,from,created_time}`
    )}`
  ];
  for (const path of attempts) {
    const res = await graphGet(path, tok);
    if (res.ok) {
      const msgs = Array.isArray(res.json?.messages?.data) ? res.json.messages.data : [];
      return { ok: true, messages: msgs, error: null };
    }
    // code=1 → daha küçük dene
    if (String(res.json?.error?.code) !== '1') {
      return { ok: false, messages: [], error: graphErr(res.json, `http_${res.status}`) };
    }
  }
  return { ok: false, messages: [], error: 'reduce_data_failed' };
}

/**
 * Son IG konuşmalarını Graph’tan çekip CRM’e yazar.
 * @param {{ limit?: number, messagesPerThread?: number, apply?: boolean }} opts
 */
export async function syncInstagramConversationsFromGraph(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 20);
  const messagesPerThread = Math.min(Math.max(Number(opts.messagesPerThread) || 8, 1), 20);
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
    thread_errors: 0,
    crm: null,
    error: null,
    blocker: null,
    blocker_steps: null,
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

  // Page id ile platform=instagram tercih; olmazsa IG business id dene
  const roots = [pageId, igId].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  let ids = [];
  let listErr = null;
  for (const rootId of roots) {
    const listed = await listConversationIds(rootId, token, limit);
    if (listed.ok) {
      ids = listed.ids;
      break;
    }
    listErr = graphErr(listed.raw?.json, `http_${listed.raw?.status}`);
  }

  if (!ids.length && listErr) {
    out.error = listErr;
    const diag = classifyGraphConversationsError(listErr);
    out.blocker = diag.blocker;
    out.blocker_steps = diag.steps;
    out.hint = diag.hint;
    return out;
  }

  out.conversations_scanned = ids.length;
  const events = [];
  for (const cid of ids) {
    const thread = await fetchThreadMessages(cid, token, messagesPerThread);
    if (!thread.ok) {
      out.thread_errors += 1;
      continue;
    }
    const ordered = [...thread.messages].reverse();
    for (const msg of ordered) {
      const ev = graphMessageToMessagingEvent(msg, { igBusinessId: igId, pageId });
      if (ev) events.push(ev);
    }
  }
  out.events_built = events.length;

  if (!apply) {
    out.ok = true;
    out.hint = `Dry-run: ${ids.length} konuşma, ${events.length} inbound aday.`;
    return out;
  }

  if (!events.length) {
    out.ok = true;
    out.crm = { processed: 0, skipped: 0, issues: [] };
    out.hint =
      ids.length === 0
        ? 'Graph’ta IG konuşması yok (veya token bu inbox’u görmüyor).'
        : 'Graph’ta yeni inbound IG mesajı yok (veya hepsi bizden).';
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
