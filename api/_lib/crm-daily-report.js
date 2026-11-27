/**
 * CRM günlük rapor — görüşmeler, kaynaklar, durum analizi, pipeline, toplu mesaj.
 * Rapor tarih bazında crm_daily_reports tablosunda arşivlenir ve
 * admin + temsilcilere WhatsApp ile gönderilir.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { GRADE_PROGRAM_LABELS, STAGE_LABELS, istanbulDayBounds } from './registration-tracking-utils.js';
import {
  CRM_BULK_PIPELINE_COLUMNS,
  bulkColumnIdForLead,
  classifyLeadSource,
  istanbulYmd,
  summarizeInternalContacts,
  summarizeLeadFunnel
} from './crm-ops-metrics.js';
import { summarizeCampaignMessages } from './crm-delivery-status.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { insertWhatsAppAutomationLog } from './message-log.js';

export const CRM_DAILY_REPORT_KIND = 'crm_daily_report';
const PANEL_ORIGIN = 'https://www.dersonlinevipkocluk.com';
const REPORT_ROLES = ['super_admin', 'admin', 'crm_agent'];

/** Bot / sistem kullanıcıları — temsilci sayılmaz */
const BOT_USER_IDS = new Set(['ai-assistant', 'system', 'auto-greeting', 'bot']);

/** Otomatik (sistem) etkileşim başlıkları — temsilci notu sayılmaz */
const AUTO_INTERACTION = /^(gelen |giden |website formu)/i;

function inRange(iso, startMs, endMs) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= startMs && t <= endMs;
}

function userRoles(u) {
  const list = Array.isArray(u?.roles) && u.roles.length ? u.roles : [u?.role];
  return list.map((r) => String(r || '').toLowerCase()).filter(Boolean);
}

export function campaignFilterLabel(filters) {
  if (!filters || typeof filters !== 'object') return '';
  const grades = (Array.isArray(filters.grades) ? filters.grades : []).map((g) => GRADE_PROGRAM_LABELS[g] || g);
  const colLabel = Object.fromEntries(CRM_BULK_PIPELINE_COLUMNS.map((c) => [c.id, c.label]));
  const cols = (Array.isArray(filters.columns) ? filters.columns : []).map((c) => colLabel[c] || c);
  return [grades.join(', '), cols.join(', ')].filter(Boolean).join(' · ');
}

/**
 * Saf hesap: ham satırlardan rapor. Tüm girdiler kurum ve gün için önceden süzülmüş olabilir;
 * yine de tarih aralığı burada tekrar uygulanır.
 */
export function computeCrmDailyReport({
  date,
  institutionName = null,
  leads = [],
  users = [],
  inboundMessages = [],
  outboundLeadMessages = [],
  inboxAgentMessages = [],
  interactions = [],
  stageHistory = [],
  campaigns = [],
  campaignMessages = [],
  waitingConversations = 0,
  tasks = [],
  leadMessages = [],
  conversationNotes = [],
  createdTasks = [],
  calls = []
}) {
  const bounds = istanbulDayBounds(date);
  const startMs = new Date(bounds.start).getTime();
  const endMs = new Date(bounds.end).getTime();
  const nameById = Object.fromEntries(users.map((u) => [String(u.id), u.name || u.email || 'Temsilci']));
  const leadById = new Map(leads.map((l) => [String(l.id), l]));
  const isHuman = (id) => {
    const k = String(id || '').trim();
    return Boolean(k) && !BOT_USER_IDS.has(k);
  };

  // Gelen başvurular (yeni lead) kaynak kırılımı
  const sources = { whatsapp: 0, instagram: 0, website: 0, facebook: 0, other: 0, total: 0 };
  for (const l of leads) {
    if (!inRange(l.created_at, startMs, endMs)) continue;
    const b = classifyLeadSource(l);
    sources[b] = (sources[b] || 0) + 1;
    sources.total += 1;
  }

  /**
   * Gelen mesaj = adayın yazdığı DM. Instagram / Facebook YORUMLARI ayrı sayılır:
   * yorum bir görüşme başlatmaz, toplamı şişirip raporu yanıltıyordu.
   */
  const inbound = { whatsapp: 0, instagram: 0, facebook: 0, total: 0 };
  const comments = { instagram: 0, facebook: 0, total: 0 };
  for (const m of inboundMessages) {
    if (!inRange(m.occurred_at, startMs, endMs)) continue;
    const ch = String(m.channel || '').toLowerCase();
    if (String(m.message_type || '').toLowerCase() === 'comment') {
      if (ch in comments) comments[ch] += 1;
      comments.total += 1;
      continue;
    }
    if (ch in inbound) inbound[ch] += 1;
    inbound.total += 1;
  }

  // Temsilci bazında görüşme (toplu mesaj hariç)
  const reps = new Map();
  const rep = (id) => {
    const key = String(id || '').trim();
    if (!key || !isHuman(key)) return null;
    if (!reps.has(key)) {
      reps.set(key, { user_id: key, name: nameById[key] || 'Temsilci', messages: 0, contacts: new Set(), notes: 0, stage_changes: 0, confirmed: 0, alarms: 0 });
    }
    return reps.get(key);
  };
  const contactedAll = new Set();
  let outboundCount = 0;

  for (const m of outboundLeadMessages) {
    if (m.campaign_id || !inRange(m.occurred_at, startMs, endMs)) continue;
    outboundCount += 1;
    const key = m.lead_id ? `lead:${m.lead_id}` : `msg:${m.id}`;
    contactedAll.add(key);
    const r = rep(m.payload?.actor_user_id);
    if (r) {
      r.messages += 1;
      r.contacts.add(key);
    }
  }
  for (const m of inboxAgentMessages) {
    if (!inRange(m.created_at, startMs, endMs)) continue;
    outboundCount += 1;
    const key = m.lead_id ? `lead:${m.lead_id}` : `conv:${m.conversation_id}`;
    contactedAll.add(key);
    const r = rep(m.sender_id);
    if (r) {
      r.messages += 1;
      r.contacts.add(key);
    }
  }
  let notes = 0;
  for (const i of interactions) {
    if (!inRange(i.interaction_at || i.created_at, startMs, endMs)) continue;
    if (AUTO_INTERACTION.test(String(i.title || ''))) continue;
    if (!i.created_by || i.created_by === 'system' || !isHuman(i.created_by)) continue;
    notes += 1;
    if (i.lead_id) contactedAll.add(`lead:${i.lead_id}`);
    const r = rep(i.created_by);
    if (r) {
      r.notes += 1;
      if (i.lead_id) r.contacts.add(`lead:${i.lead_id}`);
    }
  }

  for (const n of conversationNotes) {
    if (!inRange(n.created_at, startMs, endMs) || !isHuman(n.author_user_id)) continue;
    notes += 1;
    const key = n.lead_id ? `lead:${n.lead_id}` : `conv:${n.conversation_id}`;
    contactedAll.add(key);
    const r = rep(n.author_user_id);
    if (r) {
      r.notes += 1;
      r.contacts.add(key);
    }
  }

  // Durum analizi
  const stageCounts = {};
  let confirmedToday = 0;
  let lostToday = 0;
  let stageChanges = 0;
  for (const h of stageHistory) {
    if (!inRange(h.changed_at, startMs, endMs)) continue;
    stageChanges += 1;
    const st = String(h.new_stage || '');
    stageCounts[st] = (stageCounts[st] || 0) + 1;
    const r = rep(h.changed_by);
    if (r) {
      r.stage_changes += 1;
      if (h.lead_id) r.contacts.add(`lead:${h.lead_id}`);
    }
    // Temsilci aşama kaydettiyse o kişiyle görüşülmüş demektir
    if (h.lead_id && isHuman(h.changed_by)) contactedAll.add(`lead:${h.lead_id}`);
    if (h.new_primary_status === 'confirmed' || st === 'confirmed') {
      confirmedToday += 1;
      if (r) r.confirmed += 1;
    } else if (h.new_primary_status === 'lost' || st === 'lost') {
      lostToday += 1;
    }
  }

  const pipelineCounts = Object.fromEntries(CRM_BULK_PIPELINE_COLUMNS.map((c) => [c.id, 0]));
  for (const l of leads) pipelineCounts[bulkColumnIdForLead(l)] += 1;

  // Toplu mesaj
  const msgsByCampaign = new Map();
  for (const m of campaignMessages) {
    const id = String(m.campaign_id || '');
    if (!msgsByCampaign.has(id)) msgsByCampaign.set(id, []);
    msgsByCampaign.get(id).push(m);
  }
  const bulkTotals = { campaigns: 0, planned: 0, attempted: 0, accepted: 0, delivered: 0, read: 0, failed: 0, pending: 0 };
  const bulkCampaigns = [];
  for (const c of campaigns) {
    if (!inRange(c.created_at, startMs, endMs)) continue;
    const s = summarizeCampaignMessages(msgsByCampaign.get(String(c.id)) || [], c.planned_count);
    bulkCampaigns.push({
      id: c.id,
      template_name: c.template_name || 'Şablon',
      audience: campaignFilterLabel(c.filters),
      created_by_name: nameById[String(c.created_by || '')] || null,
      created_at: c.created_at,
      ...s
    });
    bulkTotals.campaigns += 1;
    for (const k of ['planned', 'attempted', 'accepted', 'delivered', 'read', 'failed', 'pending']) bulkTotals[k] += s[k];
  }

  const taskSummary = { due: 0, completed: 0, open: 0 };
  for (const t of tasks) {
    if (!inRange(t.due_at, startMs, endMs)) continue;
    taskSummary.due += 1;
    if (t.status === 'completed') taskSummary.completed += 1;
    else if (t.status !== 'cancelled') taskSummary.open += 1;
  }

  /**
   * Bugün yazan KİŞİLER (mesaj değil kişi sayılır) — kanal kırılımı, ilk kez / tekrar yazan,
   * ve bunlardan kaçıyla görüşüldü (temsilci mesajı, not ya da aşama kaydı).
   */
  const writers = new Map();
  const leadMsgCounts = { whatsapp: 0, instagram: 0, facebook: 0, total: 0 };
  for (const m of leadMessages) {
    if (!inRange(m.created_at, startMs, endMs)) continue;
    const ch = String(m.channel || '').toLowerCase();
    if (ch in leadMsgCounts) leadMsgCounts[ch] += 1;
    leadMsgCounts.total += 1;
    const key = m.lead_id ? `lead:${m.lead_id}` : `conv:${m.conversation_id}`;
    if (writers.has(key)) continue;
    const lead = m.lead_id ? leadById.get(String(m.lead_id)) : null;
    const first = lead ? inRange(lead.created_at, startMs, endMs) : inRange(m.conversation_created_at, startMs, endMs);
    writers.set(key, { channel: ch, first });
  }
  for (const l of leads) {
    if (!inRange(l.created_at, startMs, endMs) || classifyLeadSource(l) !== 'website') continue;
    const key = `lead:${l.id}`;
    if (!writers.has(key)) writers.set(key, { channel: 'website', first: true });
  }
  const chanZero = () => ({ whatsapp: 0, instagram: 0, website: 0, facebook: 0, other: 0 });
  const people = chanZero();
  const peopleContacted = chanZero();
  let firstTime = 0;
  for (const [key, w] of writers) {
    const ch = w.channel in people ? w.channel : 'other';
    people[ch] += 1;
    if (w.first) firstTime += 1;
    if (contactedAll.has(key)) peopleContacted[ch] += 1;
  }
  const peopleTotal = writers.size;
  const contactedTotal = Object.values(peopleContacted).reduce((a, b) => a + b, 0);
  const incoming = {
    people: { ...people, total: peopleTotal },
    first_time: firstTime,
    returning: peopleTotal - firstTime,
    messages: leadMsgCounts,
    contacted: { ...peopleContacted, total: contactedTotal },
    not_contacted: peopleTotal - contactedTotal,
    contact_rate: peopleTotal ? Math.round((contactedTotal / peopleTotal) * 100) : 0
  };

  // Takvim alarmları (temsilcinin elle kurduğu görev) ve AI asistan randevuları
  const alarmSetters = new Map();
  let alarmTotal = 0;
  const aiAppointments = { total: 0, by_consultant: [] };
  const aiByUser = new Map();
  for (const t of createdTasks) {
    if (!inRange(t.created_at, startMs, endMs)) continue;
    const by = String(t.created_by || '');
    const isAiBooking = String(t.deduplication_key || '').startsWith('ai-callback:');
    if (isAiBooking || BOT_USER_IDS.has(by)) {
      if (isAiBooking || t.task_type === 'call_parent') {
        aiAppointments.total += 1;
        const name = nameById[String(t.assigned_to || '')] || 'Atanmamış';
        aiByUser.set(name, (aiByUser.get(name) || 0) + 1);
      }
      continue;
    }
    if (t.auto_generated === true || !isHuman(by)) continue;
    alarmTotal += 1;
    alarmSetters.set(by, (alarmSetters.get(by) || 0) + 1);
    const r = rep(by);
    if (r) r.alarms += 1;
  }
  aiAppointments.by_consultant = [...aiByUser.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const alarms = {
    total: alarmTotal,
    setters: alarmSetters.size,
    by_user: [...alarmSetters.entries()]
      .map(([id, count]) => ({ user_id: id, name: nameById[id] || 'Temsilci', count }))
      .sort((a, b) => b.count - a.count)
  };

  const callSummary = { inbound: 0, answered: 0, missed: 0, outbound: 0 };
  for (const c of calls) {
    if (!inRange(c.started_at, startMs, endMs)) continue;
    if (String(c.direction || '') === 'outbound') {
      callSummary.outbound += 1;
      continue;
    }
    callSummary.inbound += 1;
    if (c.answered === true) callSummary.answered += 1;
    else callSummary.missed += 1;
  }

  const representatives = [...reps.values()]
    .map((r) => ({ ...r, contacts: r.contacts.size }))
    .filter((r) => r.messages || r.notes || r.stage_changes || r.alarms)
    .sort((a, b) => b.contacts - a.contacts || b.messages - a.messages);

  return {
    date,
    institution_name: institutionName,
    sources,
    inbound_messages: inbound,
    comments,
    waiting_reply: Number(waitingConversations) || 0,
    conversations: { contacted: contactedAll.size, outbound_messages: outboundCount, notes },
    representatives,
    status: {
      stage_changes: stageChanges,
      confirmed: confirmedToday,
      lost: lostToday,
      by_stage: Object.entries(stageCounts)
        .map(([stage, count]) => ({ stage, label: STAGE_LABELS[stage] || stage, count }))
        .sort((a, b) => b.count - a.count)
    },
    pipeline: CRM_BULK_PIPELINE_COLUMNS.map((c) => ({ id: c.id, label: c.label, count: pipelineCounts[c.id] || 0 })),
    /** KURUM DIŞI — o gün gelen yeni adaylar (satış hunisi) */
    external: summarizeLeadFunnel(
      leads.filter((l) => l.is_internal !== true && inRange(l.created_at, startMs, endMs))
    ),
    /** KURUM İÇİ — kendi öğrencimizden/velimizden gelenler, satış sayılarına girmez */
    internal: summarizeInternalContacts(
      leads.filter(
        (l) =>
          l.is_internal === true &&
          (inRange(l.created_at, startMs, endMs) || inRange(l.last_contact_at, startMs, endMs))
      )
    ),
    bulk: { totals: bulkTotals, campaigns: bulkCampaigns },
    tasks: taskSummary,
    incoming,
    alarms,
    ai_appointments: aiAppointments,
    calls: callSummary
  };
}

export function reportHasActivity(p) {
  return Boolean(
    p?.sources?.total ||
      p?.incoming?.people?.total ||
      p?.inbound_messages?.total ||
      p?.conversations?.outbound_messages ||
      p?.conversations?.notes ||
      p?.status?.stage_changes ||
      p?.internal?.total ||
      p?.bulk?.totals?.campaigns
  );
}

function trDateLabel(ymd) {
  const d = new Date(`${ymd}T12:00:00+03:00`);
  return d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
}

export function formatCrmDailyReportText(p) {
  const inc = p.incoming || null;
  const lines = [`📊 *CRM Günlük Rapor — kurum dışı adaylar*`, `${trDateLabel(p.date)}${p.institution_name ? ` · ${p.institution_name}` : ''}`, ''];

  if (inc) {
    const pp = inc.people;
    lines.push(`📥 *Bugün yazan kişi: ${pp.total}*`);
    lines.push(`WhatsApp ${pp.whatsapp} · Instagram ${pp.instagram} · Web sitesi ${pp.website} · Facebook ${pp.facebook}${pp.other ? ` · Diğer ${pp.other}` : ''}`);
    lines.push(`İlk kez yazan ${inc.first_time} · Daha önce yazmış ${inc.returning}`);
    lines.push(`💬 Gelen mesaj: ${inc.messages.total} (WA ${inc.messages.whatsapp} · IG ${inc.messages.instagram} · FB ${inc.messages.facebook})`);
  } else {
    const s = p.sources;
    lines.push(`📥 *Gelen başvuru: ${s.total}*`);
    lines.push(`WhatsApp ${s.whatsapp} · Instagram ${s.instagram} · Web sitesi ${s.website} · Facebook ${s.facebook}${s.other ? ` · Diğer ${s.other}` : ''}`);
    lines.push(`💬 Gelen mesaj: ${p.inbound_messages.total} (WA ${p.inbound_messages.whatsapp} · IG ${p.inbound_messages.instagram} · FB ${p.inbound_messages.facebook})`);
  }
  if (p.comments?.total) {
    lines.push(`💭 Yorum: ${p.comments.total} (IG ${p.comments.instagram} · FB ${p.comments.facebook}) — mesaj sayısına dahil değil`);
  }
  if (p.calls?.inbound) {
    lines.push(`📞 Gelen arama: ${p.calls.inbound} (açılan ${p.calls.answered} · cevapsız ${p.calls.missed})`);
  }

  lines.push('', `🗣️ *Görüşmeler*`);
  if (inc && inc.people.total) {
    const c = inc.contacted;
    const pp = inc.people;
    lines.push(`Bugün yazanlardan görüşülen: *${c.total} / ${pp.total}* (%${inc.contact_rate})`);
    const parts = [];
    for (const [k, label] of [['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['website', 'Web sitesi'], ['facebook', 'Facebook']]) {
      if (pp[k]) parts.push(`${label} ${c[k]}/${pp[k]}`);
    }
    if (parts.length) lines.push(parts.join(' · '));
    if (inc.not_contacted > 0) lines.push(`⚠️ ${inc.not_contacted} kişiye henüz dönüş yapılmadı.`);
  }
  lines.push(
    `Toplam görüşülen kişi (eski adaylar dahil): ${p.conversations.contacted} · Temsilci mesajı: ${p.conversations.outbound_messages} · Not: ${p.conversations.notes}`
  );
  lines.push(`_Görüşüldü sayılır: temsilci mesaj yazdıysa, not girdiyse ya da aşama kaydettiyse._`);

  if (p.representatives.length) {
    lines.push('', `👤 *Temsilci bazında*`);
    for (const r of p.representatives) {
      const parts = [`*${r.contacts} kişi*`, `${r.messages} mesaj`];
      if (r.notes) parts.push(`${r.notes} not`);
      parts.push(`${r.stage_changes} aşama`);
      parts.push(`${r.alarms || 0} alarm`);
      if (r.confirmed) parts.push(`${r.confirmed} kesin kayıt`);
      lines.push(`• ${r.name}: ${parts.join(' · ')}`);
    }
  }
  if (p.ai_appointments?.total) {
    const a = p.ai_appointments;
    lines.push(`🤖 AI asistan randevusu: ${a.total} (${a.by_consultant.map((x) => `${x.name} ${x.count}`).join(' · ')})`);
  }

  lines.push('', `📈 *Aşama değişiklikleri: ${p.status.stage_changes}*`);
  lines.push(`✅ Kesin kayıt: ${p.status.confirmed} · ❌ Kaybedilen: ${p.status.lost}`);
  for (const st of p.status.by_stage) lines.push(`• ${st.label}: ${st.count}`);

  if (p.alarms) {
    const a = p.alarms;
    lines.push('', `⏰ *Takvim alarmı: ${a.total}* (${a.setters} kişi kurdu)`);
    if (a.by_user.length) lines.push(a.by_user.map((u) => `${u.name} ${u.count}`).join(' · '));
  }
  if (p.tasks.due) {
    lines.push(`Bugüne ait görev/alarm: ${p.tasks.due} · tamamlanan ${p.tasks.completed} · açık ${p.tasks.open}`);
  }

  const b = p.bulk.totals;
  if (b.campaigns) {
    lines.push('', `📣 *Toplu mesaj*`);
    lines.push(
      `${b.campaigns} gönderim · ${b.attempted} kişiye gönderildi · Ulaştı ${b.delivered} (okundu ${b.read}) · Beklemede ${b.pending} · Hatalı ${b.failed}`
    );
    for (const c of p.bulk.campaigns) {
      lines.push(
        `• ${c.template_name}${c.audience ? ` (${c.audience})` : ''}: ${c.attempted} kişi → ${c.delivered} ulaştı, ${c.pending} beklemede, ${c.failed} hatalı`
      );
    }
  }

  lines.push('', `🧭 *Pipeline (tüm adaylar)*`);
  lines.push(p.pipeline.map((c) => `${c.label} ${c.count}`).join(' · '));
  lines.push('', `Detay: ${PANEL_ORIGIN}/crm/gunluk-rapor?tarih=${p.date}`);
  return lines.join('\n');
}

async function safeSelect(query) {
  const { data, error } = await query;
  if (error) {
    console.warn('[crm-daily-report]', error.message);
    return [];
  }
  return data || [];
}

/**
 * Supabase tek sorguda en fazla 1000 satır döndürür; .limit(10000) bunu aşmaz.
 * Aday sayısı 1000'i geçince bugünkü yeni adaylar okunmuyor, rapor neredeyse sıfır çıkıyordu.
 * Bu yardımcı sayfa sayfa hepsini okur.
 */
async function fetchAll(makeQuery, pageSize = 1000, maxRows = 50000) {
  const out = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) {
      console.warn('[crm-daily-report]', error.message);
      break;
    }
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

export async function buildCrmDailyReport(institutionId, date) {
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : istanbulYmd();
  const { start, end } = istanbulDayBounds(ymd);
  const sb = supabaseAdmin;

  const [inst, leads, users] = await Promise.all([
    safeSelect(sb.from('institutions').select('id, name').eq('id', institutionId).limit(1)),
    fetchAll(() =>
      sb
        .from('registration_leads')
        .select(
          'id, first_name, last_name, full_name, phone, normalized_phone, grade_program, primary_status, stage, source, last_inbound_channel, created_at, first_contact_at, last_contact_at, is_internal'
        )
        .eq('institution_id', institutionId)
        .eq('is_internal', false)
        .is('deleted_at', null)
        .order('id')
    ),
    fetchAll(() => sb.from('users').select('id, name, email, role, roles').order('id'))
  ]);
  const leadIds = new Set(leads.map((l) => String(l.id)));

  const [msgs, crmMsgs, interactions, history, campaigns, waiting, tasks, createdTasks, calls, notesRaw] = await Promise.all([
    fetchAll(() =>
      sb
        .from('registration_channel_messages')
        .select('id, lead_id, channel, direction, occurred_at, payload, campaign_id, message_type')
        .eq('institution_id', institutionId)
        .gte('occurred_at', start)
        .lte('occurred_at', end)
        // CRM'den silinen mesajlar rapora girmez
        .is('deleted_at', null)
        .order('id')
    ),
    // Gelen kutusu: adayın (lead) ve temsilcinin (agent) yazdığı mesajlar
    fetchAll(() =>
      sb
        .from('crm_messages')
        .select('id, conversation_id, sender_type, sender_id, created_at')
        .eq('institution_id', institutionId)
        .in('sender_type', ['agent', 'lead'])
        .gte('created_at', start)
        .lte('created_at', end)
        .order('id')
    ),
    fetchAll(() =>
      sb
        .from('registration_interactions')
        .select('lead_id, interaction_type, interaction_at, title, created_by, created_at')
        .eq('institution_id', institutionId)
        .gte('interaction_at', start)
        .lte('interaction_at', end)
        .order('id')
    ),
    fetchAll(() =>
      sb
        .from('registration_stage_history')
        .select('lead_id, new_stage, new_primary_status, changed_by, changed_at')
        .gte('changed_at', start)
        .lte('changed_at', end)
        .order('id')
    ),
    safeSelect(
      sb
        .from('crm_bulk_campaigns')
        .select('id, template_name, planned_count, created_by, created_at, filters')
        .eq('institution_id', institutionId)
        .gte('created_at', start)
        .lte('created_at', end)
    ),
    fetchAll(() =>
      sb
        .from('crm_conversations')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('status', 'open')
        .eq('is_internal', false)
        .gt('unread_count', 0)
        .order('id')
    ),
    fetchAll(() =>
      sb
        .from('registration_tasks')
        .select('status, due_at')
        .eq('institution_id', institutionId)
        .gte('due_at', start)
        .lte('due_at', end)
        .order('id')
    ),
    // Bugün KURULAN alarmlar / görevler (temsilci elle kurduysa alarm sayılır)
    fetchAll(() =>
      sb
        .from('registration_tasks')
        .select('id, lead_id, created_by, assigned_to, auto_generated, task_type, deduplication_key, created_at')
        .eq('institution_id', institutionId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('id')
    ),
    fetchAll(() =>
      sb
        .from('crm_phone_calls')
        .select('id, lead_id, direction, answered, started_at')
        .eq('institution_id', institutionId)
        .gte('started_at', start)
        .lte('started_at', end)
        .order('id')
    ),
    fetchAll(() =>
      sb
        .from('crm_conversation_notes')
        .select('id, conversation_id, author_user_id, created_at')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('id')
    )
  ]);

  const convIds = [...new Set([...crmMsgs, ...notesRaw].map((m) => m.conversation_id).filter(Boolean))];
  const convInfo = new Map();
  for (let i = 0; i < convIds.length; i += 200) {
    const part = await safeSelect(
      sb.from('crm_conversations').select('id, lead_id, channel, is_internal, created_at, institution_id').in('id', convIds.slice(i, i + 200))
    );
    for (const c of part) convInfo.set(c.id, c);
  }
  /** Kurum dışı mı? Kurum içi sohbet ya da kurum içi/silinmiş adaya bağlıysa hayır. */
  const externalConv = (c) =>
    c && String(c.institution_id) === String(institutionId) && c.is_internal !== true && (!c.lead_id || leadIds.has(String(c.lead_id)));

  const inboxAgentMessages = [];
  const leadMessages = [];
  for (const m of crmMsgs) {
    const c = convInfo.get(m.conversation_id);
    if (!externalConv(c)) continue;
    const row = { ...m, lead_id: c.lead_id || null, channel: c.channel, conversation_created_at: c.created_at };
    if (m.sender_type === 'agent') inboxAgentMessages.push(row);
    else leadMessages.push(row);
  }
  const conversationNotes = [];
  for (const n of notesRaw) {
    const c = convInfo.get(n.conversation_id);
    if (!externalConv(c)) continue;
    conversationNotes.push({ ...n, lead_id: c.lead_id || null });
  }

  let campaignMessages = [];
  if (campaigns.length) {
    campaignMessages = await fetchAll(() =>
      sb
        .from('registration_channel_messages')
        .select('campaign_id, delivery_status, payload')
        .in(
          'campaign_id',
          campaigns.map((c) => c.id)
        )
        .order('id')
    );
  }

  const ofLead = (id) => leadIds.has(String(id));
  return computeCrmDailyReport({
    date: ymd,
    institutionName: inst[0]?.name || null,
    leads,
    users,
    // Kurum içi adayların mesaj / not / görüşmeleri rapora girmez
    inboundMessages: msgs.filter((m) => m.direction === 'inbound' && ofLead(m.lead_id)),
    outboundLeadMessages: msgs.filter((m) => m.direction === 'outbound' && (!m.lead_id || ofLead(m.lead_id))),
    inboxAgentMessages,
    leadMessages,
    conversationNotes,
    interactions: interactions.filter((i) => !i.lead_id || ofLead(i.lead_id)),
    stageHistory: history.filter((h) => ofLead(h.lead_id)),
    campaigns,
    campaignMessages,
    waitingConversations: waiting.length,
    tasks,
    createdTasks: createdTasks.filter((t) => !t.lead_id || ofLead(t.lead_id)),
    calls: calls.filter((c) => !c.lead_id || ofLead(c.lead_id))
  });
}

/** Raporu hesaplar ve arşive yazar; daha önceki gönderim bilgisini korur. */
export async function saveCrmDailyReport(institutionId, date) {
  const payload = await buildCrmDailyReport(institutionId, date);
  if (payload.date < istanbulYmd()) {
    // Pipeline ve yanıt bekleyen sayısı o günün anlık görüntüsüdür; geçmiş gün yeniden hesaplanırsa korunur
    const prev = await safeSelect(
      supabaseAdmin
        .from('crm_daily_reports')
        .select('payload')
        .eq('institution_id', institutionId)
        .eq('report_date', payload.date)
        .limit(1)
    );
    if (prev[0]?.payload?.pipeline) {
      payload.pipeline = prev[0].payload.pipeline;
      payload.waiting_reply = prev[0].payload.waiting_reply ?? payload.waiting_reply;
    }
  }
  const message = formatCrmDailyReportText(payload);
  const { data, error } = await supabaseAdmin
    .from('crm_daily_reports')
    .upsert(
      {
        institution_id: institutionId,
        report_date: payload.date,
        payload,
        message,
        generated_at: new Date().toISOString()
      },
      { onConflict: 'institution_id,report_date' }
    )
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadCrmReportRecipients(institutionId) {
  const users = await safeSelect(
    supabaseAdmin
      .from('users')
      .select('id, name, email, phone, role, roles, institution_id')
      .or(`institution_id.eq.${institutionId},role.eq.super_admin`)
      .limit(500)
  );
  const eligible = users.filter((u) => userRoles(u).some((r) => REPORT_ROLES.includes(r)));
  const out = [];
  const seen = new Set();
  for (const u of eligible) {
    let phone = normalizePhoneToE164(u.phone);
    if (!phone && u.email) {
      const coach = await safeSelect(supabaseAdmin.from('coaches').select('phone').eq('email', u.email).limit(1));
      phone = normalizePhoneToE164(coach[0]?.phone);
    }
    const roles = userRoles(u);
    const row = {
      user_id: u.id,
      name: u.name || u.email,
      role: roles.includes('super_admin') || roles.includes('admin') ? 'admin' : 'temsilci',
      phone: phone || null
    };
    if (phone && seen.has(phone)) continue;
    if (phone) seen.add(phone);
    out.push(row);
  }
  return out;
}

/** Tek alıcı gönderimi takılırsa cron süresi (300 sn) dolmasın */
const RECIPIENT_SEND_TIMEOUT_MS = 45000;

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: `${label} zaman aşımı (${Math.round(ms / 1000)} sn)` }), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

export async function sendCrmDailyReport(reportRow, { force = false } = {}) {
  if (!reportRow) return { sent: 0, failed: 0, skipped: 0, recipients: [] };
  if (reportRow.sent_at && !force) {
    return { sent: 0, failed: 0, skipped: 0, already_sent_at: reportRow.sent_at, recipients: reportRow.delivery?.recipients || [] };
  }
  const { sendGatewayTextMessage } = await import('./whatsapp-gateway-send.js');
  const recipients = await loadCrmReportRecipients(reportRow.institution_id);
  // Alıcılara paralel ve süre sınırlı gönder (sıralı gönderimde gateway yavaşlayınca cron 300 sn'yi aşıyordu)
  const results = await Promise.all(
    recipients.map(async (r) => {
      if (!r.phone) return { ...r, ok: false, error: 'Telefon numarası yok' };
      let res;
      try {
        res = await withTimeout(
          sendGatewayTextMessage({ phone: r.phone, message: reportRow.message, allowSharedFallback: true }),
          RECIPIENT_SEND_TIMEOUT_MS,
          'WhatsApp gönderimi'
        );
      } catch (e) {
        res = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      const ok = Boolean(res?.ok);
      await insertWhatsAppAutomationLog({
        studentId: null,
        kind: CRM_DAILY_REPORT_KIND,
        message: reportRow.message,
        status: ok ? 'sent' : 'failed',
        error: ok ? null : res?.error || 'send_failed',
        phone: r.phone,
        logDate: reportRow.report_date
      });
      return { ...r, ok, error: ok ? null : res?.error || 'Gönderilemedi' };
    })
  );
  const summary = {
    sent: results.filter((x) => x.ok).length,
    failed: results.filter((x) => !x.ok).length,
    recipients: results
  };
  await supabaseAdmin
    .from('crm_daily_reports')
    .update({
      sent_at: summary.sent ? new Date().toISOString() : reportRow.sent_at || null,
      delivery: { ...summary, attempted_at: new Date().toISOString() }
    })
    .eq('id', reportRow.id);
  return summary;
}

/** Cron: tüm CRM kurumları için günün raporu (etkinlik yoksa gönderilmez, yine de arşivlenir). */
export async function runCrmDailyReportJob({ date = null, send = true } = {}) {
  if (String(process.env.CRM_DAILY_REPORT_DISABLED || '').trim() === '1') return { ok: true, disabled: true };
  const ymd = date || istanbulYmd();
  const rows = await fetchAll(() => supabaseAdmin.from('registration_leads').select('institution_id').order('id'));
  const institutions = [...new Set(rows.map((r) => r.institution_id).filter(Boolean))];
  const out = [];
  // Kurumlar paralel: biri yavaşlarsa diğerinin raporu gecikmesin
  await Promise.all(institutions.map(async (inst) => {
    try {
      const report = await saveCrmDailyReport(inst, ymd);
      const active = reportHasActivity(report.payload);
      const delivery = send && active ? await sendCrmDailyReport(report) : null;
      out.push({ institution_id: inst, active, delivery });
    } catch (e) {
      out.push({ institution_id: inst, error: e instanceof Error ? e.message : String(e) });
    }
  }));
  return { ok: true, date: ymd, institutions: out };
}
