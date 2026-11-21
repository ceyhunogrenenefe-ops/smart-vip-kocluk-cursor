/**
 * Netgsm Netsantral "Webhook Santral Dinleme" olaylarını tek biçime çevirir.
 *
 * Netgsm bu olayları panelde (Ayarlar → Genel Ayarlar → API Talep Ayarları)
 * tanımlanan adrese JSON olarak POST eder. `scenario` alanı olay türünü verir:
 * Inbound_call, Outbound_call, DTMF, Context, Queue, cdr.
 *
 * CRM'e aday yazmak için yalnız `cdr` olayını kullanıyoruz: görüşme bittikten
 * 30-60 sn sonra gelir ve arayan, aranan hat, süre, yön ve ses kaydını taşır.
 *
 * cdr alanları (Netgsm örneğinden): bas, kimlik, ortakkimlik, clid, arayan,
 * aranan, sure, sondurum, santral, yon, seskaydi, asteriskId, trunk, timestamp.
 * `yon` kodları Netgsm görüşme detay API'siyle aynı kabul edildi:
 *   0 giden · 1 gelen · 2 gelen cevapsız · 3 giden cevapsız · 4 iç · 5 iç cevapsız
 */

const YON = {
  0: { direction: 'outbound', answered: true },
  1: { direction: 'inbound', answered: true },
  2: { direction: 'inbound', answered: false },
  3: { direction: 'outbound', answered: false },
  4: { direction: 'internal', answered: true },
  5: { direction: 'internal', answered: false }
};

function str(v) {
  if (v == null) return '';
  return String(v).trim();
}

function digits(v) {
  return str(v).replace(/\D/g, '');
}

/** "2021-01-27 16:05:38" (Türkiye saati) → ISO */
function istanbulDateToIso(value) {
  const m = str(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function msToIso(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

/** clid: "\"NECLA 561523\" <05xxxxxxxxx>" → numara */
function numberFromClid(clid) {
  const m = str(clid).match(/<([^>]+)>/);
  return m ? digits(m[1]) : '';
}

export function parseNetgsmBody(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  const text = String(raw);
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // form-urlencoded olarak gelirse
    try {
      return Object.fromEntries(new URLSearchParams(text));
    } catch {
      return {};
    }
  }
}

/**
 * @returns {{
 *   kind: 'cdr'|'inbound_call'|'other',
 *   scenario: string,
 *   callId: string|null,
 *   caller: string|null,
 *   called: string|null,
 *   pbx: string|null,
 *   direction: 'inbound'|'outbound'|'internal'|null,
 *   answered: boolean|null,
 *   durationSec: number|null,
 *   startedAt: string,
 *   recordingUrl: string|null
 * }}
 */
export function normalizeNetgsmEvent(body) {
  const b = body && typeof body === 'object' ? body : {};
  const scenario = str(b.scenario);
  const lower = scenario.toLowerCase();

  if (lower === 'cdr') {
    const yon = YON[Number(b.yon)] || null;
    const durationRaw = Number(b.sure);
    const caller = digits(b.arayan) || numberFromClid(b.clid);
    return {
      kind: 'cdr',
      scenario,
      callId: str(b.asteriskId) || str(b.kimlik) || str(b.unique_id) || null,
      caller: caller || null,
      called: digits(b.aranan) || null,
      pbx: digits(b.santral) || null,
      direction: yon ? yon.direction : null,
      answered: yon ? yon.answered : null,
      durationSec: Number.isFinite(durationRaw) ? durationRaw : null,
      startedAt: istanbulDateToIso(b.bas) || msToIso(b.timestamp) || new Date().toISOString(),
      recordingUrl: str(b.seskaydi) || null
    };
  }

  if (lower === 'inbound_call') {
    return {
      kind: 'inbound_call',
      scenario,
      callId: str(b.unique_id) || null,
      caller: digits(b.customer_num) || null,
      called: null,
      pbx: digits(b.pbx_num) || null,
      direction: 'inbound',
      answered: null,
      durationSec: null,
      startedAt: msToIso(b.timestamp) || new Date().toISOString(),
      recordingUrl: null
    };
  }

  return {
    kind: 'other',
    scenario,
    callId: str(b.unique_id) || null,
    caller: digits(b.customer_num) || null,
    called: null,
    pbx: digits(b.pbx_num) || null,
    direction: null,
    answered: null,
    durationSec: null,
    startedAt: msToIso(b.timestamp) || new Date().toISOString(),
    recordingUrl: null
  };
}

/** "08503034014, 8503034014" → ['8503034014'] (son 10 hane) */
export function parseTrackedNumbers(value) {
  return str(value)
    .split(/[,;\n]+/)
    .map((p) => digits(p))
    .filter((d) => d.length >= 10)
    .map((d) => d.slice(-10));
}

/**
 * Takip listesi boşsa her çağrı kabul edilir. Doluysa aranan hat (aranan)
 * veya santral numarası listedeki numaralardan birini içermelidir.
 * aranan "85030xxxxx-queue-..." biçiminde gelebildiği için içerme kontrolü yapılır.
 */
export function isTrackedCall(event, trackedNumbers) {
  if (!trackedNumbers || trackedNumbers.length === 0) return true;
  const haystack = [event.called, event.pbx].filter(Boolean).join(' ');
  return trackedNumbers.some((n) => haystack.includes(n));
}

export function formatDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return '0 sn';
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return m > 0 ? `${m} dk ${s} sn` : `${s} sn`;
}
