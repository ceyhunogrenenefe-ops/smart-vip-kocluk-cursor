/**
 * Reklam Videoları — uçtan uca senaryo (bir yönetici, iki öğretmen, kurgu ekibi):
 * görev atama, erişim sınırları, çekim kaydı, teslim (bağlantı + Drive yükleme),
 * düzeltme, onay, rapor sayaçları ve bildirim tekrar önleme.
 *
 * Gerçek handler kodu çalışır; yalnız Supabase bellek içi sahte istemcidir,
 * Google Drive HTTP uçları taklit edilir.
 */
import crypto from 'crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './fake-supabase.js';

const fake = vi.hoisted(() => ({ client: null }));
vi.mock('../supabase-admin.js', () => ({
  get supabaseAdmin() {
    return fake.client;
  }
}));

const INST = 'inst-online-vip';
const OTHER = 'inst-baska';
const users = [
  { id: 'u-admin', name: 'Yönetici Ayşe', role: 'admin', roles: ['admin'], institution_id: INST, is_active: true },
  { id: 'u-t1', name: 'Öğretmen Ali', role: 'teacher', roles: ['teacher'], institution_id: INST, is_active: true },
  { id: 'u-t2', name: 'Öğretmen Banu', role: 'teacher', roles: ['teacher', 'coach'], institution_id: INST, is_active: true },
  { id: 'u-editor', name: 'Kurgu Cem', role: 'crm_agent', roles: ['crm_agent'], institution_id: INST, is_active: true },
  { id: 'u-x', name: 'Diğer Kurum Öğretmeni', role: 'teacher', roles: ['teacher'], institution_id: OTHER, is_active: true },
  { id: 'u-student', name: 'Öğrenci', role: 'student', roles: ['student'], institution_id: INST, is_active: true }
];

let handler;
let signAuthToken;
let core;
let notifyMod;
let driveMod;
const pushes = [];

const tokenFor = (id) => {
  const u = users.find((x) => x.id === id);
  return signAuthToken({ sub: u.id, role: u.role, roles: u.roles, institution_id: u.institution_id });
};

async function call(userId, method, op, { query = {}, body } = {}) {
  const req = {
    method,
    query: { op, ...query },
    body,
    headers: userId ? { authorization: `Bearer ${tokenFor(userId)}`, origin: 'https://www.dersonlinevipkocluk.com' } : {}
  };
  let status = 200;
  let json;
  const res = {
    status(s) {
      status = s;
      return this;
    },
    json(j) {
      json = j;
      return this;
    },
    setHeader() {},
    end() {
      return this;
    }
  };
  await handler(req, res);
  return { status, json };
}

const H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const notifsFor = (uid) => fake.client.db.platform_notifications?.filter((n) => n.target_user_id === uid) || [];

// --- Google Drive taklidi
const drive = { files: new Map(), sessions: new Map(), folder: 'folder-reklam-1', sharedDrive: 'shared-drive-1' };
function driveFetch(url, opts = {}) {
  const u = String(url);
  const json = (status, j, headers = {}) =>
    Promise.resolve(new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json', ...headers } }));
  if (u.startsWith('https://oauth2.googleapis.com/token')) return json(200, { access_token: 'ya29.test', expires_in: 3600 });
  if (u.startsWith('https://www.googleapis.com/upload/drive/v3/files') && opts.method === 'POST') {
    const meta = JSON.parse(opts.body);
    const id = `sess-${drive.sessions.size + 1}`;
    drive.sessions.set(id, { meta, size: Number(opts.headers['X-Upload-Content-Length']), received: 0, origin: opts.headers.Origin });
    return Promise.resolve(new Response(null, { status: 200, headers: { location: `https://upload.example/${id}` } }));
  }
  if (u.startsWith('https://upload.example/')) {
    const s = drive.sessions.get(u.split('/').pop());
    if (!s) return json(404, {});
    if (s.received < s.size) {
      return Promise.resolve(new Response(null, { status: 308, headers: s.received ? { range: `bytes=0-${s.received - 1}` } : {} }));
    }
    return json(200, s.file);
  }
  if (u.startsWith('https://www.googleapis.com/drive/v3/files/')) {
    const id = decodeURIComponent(u.split('/files/')[1].split('?')[0]);
    const f = drive.files.get(id);
    return f ? json(200, f) : json(404, { error: { message: 'not found' } });
  }
  return json(500, { error: 'unexpected ' + u });
}
/** Tarayıcının Google'a parçaları gönderip bitirmesini taklit eder */
function browserFinishesUpload(sessionUri, { partial = false } = {}) {
  const s = drive.sessions.get(sessionUri.split('/').pop());
  if (partial) {
    s.received = Math.floor(s.size / 2);
    return;
  }
  s.received = s.size;
  const id = `file-${drive.files.size + 1}`;
  s.file = { id, name: s.meta.name, mimeType: s.meta.mimeType, size: String(s.size), parents: s.meta.parents, driveId: drive.sharedDrive };
  drive.files.set(id, { ...s.file, webViewLink: `https://drive.google.com/file/d/${id}/view`, trashed: false });
}

beforeAll(async () => {
  process.env.APP_JWT_SECRET = 'test-secret';
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 'reklam-video@proje.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' })
  });
  fake.client = createFakeSupabase({ users, platform_notifications: [] });
  ({ signAuthToken } = await import('../auth.js'));
  handler = (await import('../../../handlers/ad-videos.js')).default;
  core = await import('../ad-videos-core.js');
  notifyMod = await import('../ad-videos-notify.js');
  driveMod = await import('../ad-videos-drive.js');
  driveMod.__setDriveFetch(driveFetch);
  notifyMod.__setPushImpl(async (uid, p) => {
    pushes.push({ uid, p });
    return { sent: 1 };
  });
});

describe('Reklam Videoları — bir yönetici, iki öğretmen', () => {
  const ids = {};
  const now = Date.now();
  const today = () => core.trDateKey(new Date());

  it('kimliksiz istek 401, öğrenci yönetim uçlarına giremez', async () => {
    expect((await call(null, 'GET', 'me')).status).toBe(401);
    expect((await call('u-student', 'GET', 'teachers')).status).toBe(403);
    expect((await call('u-student', 'GET', 'stats')).status).toBe(403);
    const r = await call('u-student', 'GET', 'list');
    expect(r.json.tasks).toEqual([]);
  });

  it('yönetici öğretmeni mevcut kullanıcı listesinden seçer (kurumu dışı ve öğrenci yok)', async () => {
    const r = await call('u-admin', 'GET', 'teachers');
    expect(r.status).toBe(200);
    expect(r.json.teachers.map((t) => t.id).sort()).toEqual(['u-t1', 'u-t2']);
  });

  it('iki öğretmen seçilince her biri için ayrı görev oluşur ve atama bildirimi gider', async () => {
    const body = {
      teacher_ids: ['u-t1', 'u-t2'],
      title: 'LGS kampı tanıtım',
      idea: 'Küçük grup farkı',
      theme: 'Güven',
      shoot_note: 'Dikey 9:16, 30 sn',
      reference_url: 'https://www.instagram.com/reel/abc',
      planned_shoot_at: iso(now + 2 * H),
      due_at: iso(now + 72 * H)
    };
    expect((await call('u-t1', 'POST', 'create', { body })).status).toBe(403);
    expect((await call('u-admin', 'POST', 'create', { body: { ...body, teacher_ids: ['u-x'] } })).status).toBe(403);
    expect((await call('u-admin', 'POST', 'create', { body: { ...body, teacher_ids: ['u-student'] } })).status).toBe(400);
    expect((await call('u-admin', 'POST', 'create', { body: { ...body, due_at: '' } })).status).toBe(400);

    const r = await call('u-admin', 'POST', 'create', { body });
    expect(r.status).toBe(200);
    expect(r.json.tasks).toHaveLength(2);
    ids.t1 = r.json.tasks.find((t) => t.teacher_id === 'u-t1').id;
    ids.t2 = r.json.tasks.find((t) => t.teacher_id === 'u-t2').id;
    expect(r.json.tasks.every((t) => t.status === 'planned' && t.batch_id)).toBe(true);
    expect(notifsFor('u-t1').map((n) => n.title)).toEqual(['Yeni reklam videosu görevi']);
    expect(notifsFor('u-t2')).toHaveLength(1);
    expect(notifsFor('u-t1')[0].link_url).toBe(`/reklam-videolari?gorev=${ids.t1}`);
  });

  it('öğretmen yalnız kendi görevini görür; diğerininkine erişemez', async () => {
    const l1 = await call('u-t1', 'GET', 'list');
    expect(l1.json.tasks.map((t) => t.id)).toEqual([ids.t1]);
    expect(l1.json.tasks[0].created_by).toBeUndefined();
    const l2 = await call('u-t2', 'GET', 'list', { query: { teacher_id: 'u-t1' } });
    expect(l2.json.tasks.map((t) => t.id)).toEqual([ids.t2]);
    expect((await call('u-t1', 'GET', 'get', { query: { id: ids.t2 } })).status).toBe(404);
    expect((await call('u-t1', 'POST', 'mark_shot', { body: { id: ids.t2 } })).status).toBe(404);
    expect((await call('u-t1', 'POST', 'review', { body: { id: ids.t1, action: 'approve' } })).status).toBe(403);
    expect((await call('u-x', 'GET', 'get', { query: { id: ids.t1 } })).status).toBe(404);
  });

  it('kurgu ekibi yetkisi ayarlardan verilir; yönetim işlemleri yine kapalı', async () => {
    expect((await call('u-editor', 'GET', 'stats')).status).toBe(403);
    expect((await call('u-t1', 'POST', 'settings', { body: { editor_user_ids: ['u-t1'] } })).status).toBe(403);
    const s = await call('u-admin', 'POST', 'settings', { body: { editor_user_ids: ['u-editor'], link_folder_url: 'https://drive.google.com/drive/folders/abc123' } });
    expect(s.status).toBe(200);
    const me = await call('u-editor', 'GET', 'me');
    expect(me.json.access).toMatchObject({ manager: false, editor: true, reviewer: true });
    const l = await call('u-editor', 'GET', 'list');
    expect(l.json.tasks).toHaveLength(2);
    expect((await call('u-editor', 'POST', 'create', { body: { teacher_ids: ['u-t1'], title: 'x', due_at: iso(now + H) } })).status).toBe(403);
    expect((await call('u-editor', 'POST', 'delete', { body: { id: ids.t1 } })).status).toBe(403);
  });

  it('"Çektim" bugünün tarihiyle çekimi kaydeder; ileri tarih reddedilir', async () => {
    const future = core.addDaysKey(today(), 1);
    expect((await call('u-t1', 'POST', 'mark_shot', { body: { id: ids.t1, date: future } })).status).toBe(400);
    const r = await call('u-t1', 'POST', 'mark_shot', { body: { id: ids.t1 } });
    expect(r.status).toBe(200);
    expect(r.json.task.status).toBe('shot');
    expect(r.json.task.actual_shoot_date).toBe(today());
  });

  it('öğretmen 2 teslim ekranında çekim tarihini girip Drive bağlantısıyla teslim eder', async () => {
    const fileUrl = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing';
    expect((await call('u-t2', 'POST', 'submit_link', { body: { id: ids.t2, url: fileUrl } })).status).toBe(400); // çekim tarihi yok
    expect(
      (await call('u-t2', 'POST', 'submit_link', { body: { id: ids.t2, url: 'https://drive.google.com/drive/folders/abc123', actual_shoot_date: today() } })).status
    ).toBe(400);
    expect((await call('u-t2', 'POST', 'submit_link', { body: { id: ids.t2, url: 'http://evil.example/x.mp4', actual_shoot_date: today() } })).status).toBe(400);
    const r = await call('u-t2', 'POST', 'submit_link', { body: { id: ids.t2, url: fileUrl, actual_shoot_date: today() } });
    expect(r.status).toBe(200);
    expect(r.json.task.status).toBe('submitted');
    expect(r.json.task.first_submitted_at).toBeTruthy();
    expect(r.json.task.actual_shoot_date).toBe(today());
    expect(r.json.submission).toMatchObject({ source: 'drive_link', version: 1, is_revision: false, drive_file_id: '1AbCdEfGhIjKlMnOp' });
  });

  it('Drive yükleme: kaydedilmeden teslim sayılmaz, tamamlanınca bağlantı göreve otomatik bağlanır', async () => {
    // Etkin değilken reddedilir
    expect((await call('u-t1', 'POST', 'upload_start', { body: { id: ids.t1, file_name: 'IMG_0001.MOV', size: 50_000_000 } })).status).toBe(409);
    await call('u-admin', 'POST', 'settings', {
      body: { drive_upload_enabled: true, drive_folder_id: drive.folder, drive_shared_drive_id: drive.sharedDrive }
    });
    expect((await call('u-t1', 'POST', 'upload_start', { body: { id: ids.t1, file_name: 'video.avi', size: 10 } })).status).toBe(400);
    const st = await call('u-t1', 'POST', 'upload_start', { body: { id: ids.t1, file_name: 'IMG_0001.MOV', mime_type: '', size: 50_000_000 } });
    expect(st.status).toBe(200);
    expect(st.json.resumed).toBe(false);
    const sess = drive.sessions.get(st.json.session_uri.split('/').pop());
    expect(sess.meta.parents).toEqual([drive.folder]);
    expect(sess.meta.mimeType).toBe('video/quicktime');
    expect(sess.origin).toBe('https://www.dersonlinevipkocluk.com');

    // Yarıda kesildi → teslim yok, aynı dosya için oturum devam eder
    browserFinishesUpload(st.json.session_uri, { partial: true });
    const early = await call('u-t1', 'POST', 'upload_finalize', { body: { session_id: st.json.session_id } });
    expect(early.status).toBe(409);
    expect(early.json.received).toBe(25_000_000);
    expect((await call('u-t1', 'GET', 'get', { query: { id: ids.t1 } })).json.task.status).toBe('shot');
    const again = await call('u-t1', 'POST', 'upload_start', { body: { id: ids.t1, file_name: 'IMG_0001.MOV', size: 50_000_000 } });
    expect(again.json).toMatchObject({ resumed: true, session_id: st.json.session_id });
    expect((await call('u-t1', 'GET', 'upload_pending', { query: { id: ids.t1 } })).json.session.id).toBe(st.json.session_id);
    // Başka öğretmen bu oturumu kapatamaz
    expect((await call('u-t2', 'POST', 'upload_finalize', { body: { session_id: st.json.session_id } })).status).toBe(404);

    browserFinishesUpload(st.json.session_uri);
    const fin = await call('u-t1', 'POST', 'upload_finalize', { body: { session_id: st.json.session_id } });
    expect(fin.status).toBe(200);
    expect(fin.json.task.status).toBe('submitted');
    expect(fin.json.submission).toMatchObject({ source: 'drive_upload', version: 1, mime_type: 'video/quicktime', size_bytes: 50_000_000 });
    expect(fin.json.submission.drive_url).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
    // İkinci kez kapatmak teslimi çoğaltmaz
    const dup = await call('u-t1', 'POST', 'upload_finalize', { body: { session_id: st.json.session_id } });
    expect(dup.json.already).toBe(true);
    expect(fake.client.db.ad_video_submissions.filter((s) => s.task_id === ids.t1)).toHaveLength(1);
  });

  it('kurgu ekibi düzeltme ister; öğretmen notu görür ve aynı göreve yeni video yükler', async () => {
    expect((await call('u-editor', 'POST', 'review', { body: { id: ids.t1, action: 'revision', note: '' } })).status).toBe(400);
    const r = await call('u-editor', 'POST', 'review', { body: { id: ids.t1, action: 'revision', note: 'Ses düşük, ilk 3 saniyeyi kısalt.' } });
    expect(r.status).toBe(200);
    expect(r.json.task.status).toBe('revision_requested');
    expect(notifsFor('u-t1').map((n) => n.title)).toContain('Reklam videosu için düzeltme istendi');

    const mine = await call('u-t1', 'GET', 'get', { query: { id: ids.t1 } });
    expect(mine.json.task.review_note).toBe('Ses düşük, ilk 3 saniyeyi kısalt.');
    expect(mine.json.task.review_note_by).toBeUndefined();
    expect(mine.json.can.submit).toBe(true);
    // Öğretmen 2, öğretmen 1'in notunu göremez
    expect((await call('u-t2', 'GET', 'get', { query: { id: ids.t1 } })).status).toBe(404);

    const before = fake.client.db.ad_video_tasks.find((t) => t.id === ids.t1);
    const firstAt = before.first_submitted_at;
    await new Promise((res) => setTimeout(res, 5));
    const re = await call('u-t1', 'POST', 'submit_link', { body: { id: ids.t1, url: 'https://drive.google.com/file/d/2ZyXwVuTsRqPoNm/view' } });
    expect(re.status).toBe(200);
    expect(re.json.task.status).toBe('submitted');
    expect(re.json.task.first_submitted_at).toBe(firstAt);
    expect(re.json.task.last_uploaded_at > firstAt).toBe(true);
    expect(re.json.submission).toMatchObject({ version: 2, is_revision: true });

    const hist = await call('u-t1', 'GET', 'get', { query: { id: ids.t1 } });
    expect(hist.json.submissions.map((s) => [s.version, s.review_status])).toEqual([
      [2, 'pending'],
      [1, 'revision_requested']
    ]);
    expect(hist.json.submissions.every((s) => s.uploaded_at)).toBe(true);
    expect(hist.json.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['created', 'shot', 'submitted', 'revision_requested', 'resubmitted'])
    );
  });

  it('yönetici onaylar; onaylanan göreve yeni teslim yapılamaz', async () => {
    const r = await call('u-admin', 'POST', 'review', { body: { id: ids.t1, action: 'approve' } });
    expect(r.status).toBe(200);
    expect(r.json.task.status).toBe('approved');
    expect(r.json.task.approved_at).toBeTruthy();
    expect((await call('u-t1', 'POST', 'submit_link', { body: { id: ids.t1, url: 'https://drive.google.com/file/d/3abcdefghijk/view' } })).status).toBe(400);
    expect((await call('u-admin', 'POST', 'review', { body: { id: ids.t1, action: 'approve' } })).status).toBe(400);
  });

  it('rapor sayaçları: her görev bir video; düzeltme yüklemesi ilk teslimi artırmaz', async () => {
    const s = await call('u-admin', 'GET', 'stats', { query: { week: today() } });
    expect(s.status).toBe(200);
    const t1 = s.json.rows.find((r) => r.teacher_id === 'u-t1');
    const t2 = s.json.rows.find((r) => r.teacher_id === 'u-t2');
    const plannedThisWeek = core.trWeekRange(today()).endMs > now + 2 * H ? 1 : 0;
    expect(t1.week).toEqual({ planned: plannedThisWeek, shot: 1, first_submitted: 1, approved: 1 });
    expect(t2.week).toEqual({ planned: plannedThisWeek, shot: 1, first_submitted: 1, approved: 0 });
    expect(t1.last_shoot_date).toBe(today());
    expect(t2.awaiting_review.map((x) => x.id)).toEqual([ids.t2]);
    expect(s.json.totals.videos).toBe(2);
    expect(s.json.totals.week.first_submitted).toBe(2);
    expect(s.json.totals.week.approved).toBe(1);
    // Kurgu ekibi raporu görür, öğretmen göremez
    expect((await call('u-editor', 'GET', 'stats')).status).toBe(200);
    expect((await call('u-t1', 'GET', 'stats')).status).toBe(403);
    // Filtre: duruma göre
    const f = await call('u-admin', 'GET', 'list', { query: { status: 'approved' } });
    expect(f.json.tasks.map((t) => t.id)).toEqual([ids.t1]);
    const ft = await call('u-admin', 'GET', 'list', { query: { teacher_id: 'u-t2' } });
    expect(ft.json.tasks.map((t) => t.id)).toEqual([ids.t2]);
    const fd = await call('u-admin', 'GET', 'list', { query: { date_field: 'actual_shoot_date', from: today(), to: today() } });
    expect(fd.json.tasks).toHaveLength(2);
  });

  it('hatırlatma ve gecikme bildirimleri bir kez gider; teslim edilmiş göreve gitmez', async () => {
    const mk = async (dueMs, title) => {
      const r = await call('u-admin', 'POST', 'create', { body: { teacher_ids: ['u-t2'], title, due_at: iso(dueMs) } });
      return r.json.tasks[0].id;
    };
    ids.soon = await mk(now + 10 * H, 'Yaklaşan teslim');
    ids.late = await mk(now - 2 * H, 'Geciken teslim');
    ids.far = await mk(now + 5 * 24 * H, 'Uzak teslim');

    const lateList = await call('u-admin', 'GET', 'list', { query: { status: 'overdue' } });
    expect(lateList.json.tasks.map((t) => t.id)).toEqual([ids.late]);
    expect(lateList.json.tasks[0].display_status).toBe('overdue');

    const run1 = await notifyMod.runAdVideoNotifyJob({ now: new Date(now) });
    expect(run1).toMatchObject({ due_24h: 1, overdue: 1 });
    const run2 = await notifyMod.runAdVideoNotifyJob({ now: new Date(now + 15 * 60 * 1000) });
    expect(run2).toMatchObject({ due_24h: 0, overdue: 0 });
    const titles = notifsFor('u-t2').map((n) => n.title);
    expect(titles.filter((t) => t.includes('24 saat'))).toHaveLength(1);
    expect(titles.filter((t) => t.includes('gecikti'))).toHaveLength(1);
    expect(notifsFor('u-t2').find((n) => n.title.includes('gecikti')).link_url).toBe(`/reklam-videolari?gorev=${ids.late}`);

    // ids.t2 son teslime yakın değil ama teslim edilmiş: ileri bir anda bile hatırlatma almaz
    const later = await notifyMod.runAdVideoNotifyJob({ now: new Date(now + 80 * H) });
    expect(later.overdue).toBe(1); // yalnız 'far' değil, 'soon' geçti → 1 yeni gecikme ('soon'); t2 teslim edildiği için yok
    expect(notifsFor('u-t2').filter((n) => n.link_url.endsWith(ids.t2) && n.title !== 'Yeni reklam videosu görevi')).toHaveLength(0);
  });

  it('günlük özet iş günü 18.00 sonrası yöneticiye ve kurgu ekibine günde bir kez gider', async () => {
    // Bir sonraki pazartesi 18:05 TR
    const base = core.trWeekRange(core.addDaysKey(today(), 7)).startKey;
    const at = (key, hhmm) => new Date(Date.parse(`${key}T${hhmm}:00+03:00`));
    const mon = base;
    const sat = core.addDaysKey(base, 5);
    expect((await notifyMod.runAdVideoNotifyJob({ now: at(mon, '17:45') })).daily_summary).toBe(0);
    expect((await notifyMod.runAdVideoNotifyJob({ now: at(sat, '18:30') })).daily_summary).toBe(0);
    const r = await notifyMod.runAdVideoNotifyJob({ now: at(mon, '18:05') });
    expect(r.daily_summary).toBe(2);
    expect((await notifyMod.runAdVideoNotifyJob({ now: at(mon, '18:20') })).daily_summary).toBe(0);
    const monTitle = `Reklam videoları günlük özet · ${mon.split('-').reverse().join('.')}`;
    const adminSum = notifsFor('u-admin').filter((n) => n.title === monTitle);
    const edSum = notifsFor('u-editor').filter((n) => n.title === monTitle);
    expect(adminSum).toHaveLength(1);
    expect(edSum).toHaveLength(1);
    expect(adminSum[0].body).toMatch(/İnceleme bekleyen: 1/);
    expect(adminSum[0].link_url).toBe(`/reklam-videolari?sekme=gunluk&tarih=${mon}`);
    expect(notifsFor('u-t1').some((n) => n.title.includes('günlük özet'))).toBe(false);

    // Saat ayardan değiştirilebilir
    await call('u-admin', 'POST', 'settings', { body: { daily_summary_time: '09:30', daily_summary_days: [1, 2, 3, 4, 5, 6] } });
    expect((await notifyMod.runAdVideoNotifyJob({ now: at(sat, '09:35') })).daily_summary).toBe(2);
    expect((await call('u-admin', 'POST', 'settings', { body: { daily_summary_time: '25:00' } })).status).toBe(400);
  });

  it('günlük özet ve haftalık rapor panelden açılır', async () => {
    const d = await call('u-admin', 'GET', 'daily_summary', { query: { date: today() } });
    expect(d.status).toBe(200);
    expect(d.json.summary.delivered.map((x) => x.id).sort()).toEqual([ids.t1, ids.t2].sort());
    expect(d.json.summary.awaiting_review.map((x) => x.id)).toEqual([ids.t2]);
    expect(d.json.summary.overdue.map((x) => x.id)).toEqual([ids.late]);
  });

  it('yönetici görevi düzenler ve siler; silinen görev öğretmende görünmez', async () => {
    const u = await call('u-admin', 'POST', 'update', { body: { id: ids.far, title: 'Uzak teslim (güncel)' } });
    expect(u.json.task.title).toBe('Uzak teslim (güncel)');
    expect((await call('u-admin', 'POST', 'delete', { body: { id: ids.far } })).status).toBe(200);
    const l = await call('u-t2', 'GET', 'list');
    expect(l.json.tasks.map((t) => t.id)).not.toContain(ids.far);
    expect(pushes.length).toBeGreaterThan(0);
  });
});
