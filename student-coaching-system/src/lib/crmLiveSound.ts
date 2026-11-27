/**
 * CRM yeni lead / mesaj sesi — WebAudio (dosya gerekmez).
 *
 * Belirgin olsun diye: üç notalı yükselen zil, iki kez çalar; üçgen dalga
 * (sinüsten daha "dolu"), yüksek kazanç ve kırpılmayı önleyen kompresör.
 */
/**
 * Zil en fazla 20 saniyede bir çalar — tüm sayfalar ve açık sekmeler ortak.
 * Üretimde aynı olay birden çok yerden (kabuk, gelen kutusu, pipeline)
 * ve her poll'da tetiklenip zil hiç susmuyordu.
 */
const CHIME_GAP_MS = 20_000;
const CHIME_KEY = 'crm_chime_last_at';
let lastChimeAt = 0;

function chimeAllowed(): boolean {
  const now = Date.now();
  let last = lastChimeAt;
  try {
    last = Math.max(last, Number(localStorage.getItem(CHIME_KEY) || 0));
  } catch {
    /* ignore */
  }
  if (now - last < CHIME_GAP_MS) return false;
  lastChimeAt = now;
  try {
    localStorage.setItem(CHIME_KEY, String(now));
  } catch {
    /* ignore */
  }
  return true;
}

export function playCrmLeadChime() {
  if (!chimeAllowed()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime + 0.02;

    // Yüksek ses ama hoparlörde cızırtı/kırpılma olmasın
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    comp.connect(master);
    master.connect(ctx.destination);

    const notes = [988, 1319, 1760]; // B5, E6, A6
    const step = 0.13;
    const noteLen = 0.32;
    const repeatGap = 0.55;

    [0, repeatGap].forEach((offset) => {
      notes.forEach((freq, i) => {
        const t = now + offset + i * step;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.7, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + noteLen);
        osc.connect(gain);
        gain.connect(comp);
        osc.start(t);
        osc.stop(t + noteLen + 0.02);
      });
    });

    window.setTimeout(() => void ctx.close(), 2000);
  } catch {
    /* autoplay / unsupported */
  }
}

export function notifyCrmDesktop(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, silent: false });
    }
  } catch {
    /* ignore */
  }
}
