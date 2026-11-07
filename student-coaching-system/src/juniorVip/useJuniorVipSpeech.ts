import { useCallback, useEffect, useRef, useState } from 'react';
import type { JuniorVipMascotGender } from './inferMascotGender';
import { juniorVipTranscribeAudio, type JuniorVipScope } from './juniorVipApi';

/**
 * Junior VIP ses katmanı.
 *
 * Motorlar:
 *  - webspeech: tarayıcının yerleşik SpeechRecognition / webkitSpeechRecognition (Chrome, Edge, Safari).
 *  - recorder: getUserMedia + MediaRecorder → sunucu Whisper (/api/junior-vip?op=transcribe).
 *
 * Telefon (mobil UA): değişmedi — Web Speech + paralel mikrofon ısıtma.
 * Masaüstü: önce Web Speech (sunucu anahtarı gerektirmez). Web Speech servisi yoksa/çalışmazsa
 * (network, service-not-allowed, ses gelmiyor…) aynı oturumda otomatik olarak kayıt moduna geçer.
 * Masaüstünde Web Speech çalışırken ayrı bir getUserMedia akışı AÇIK TUTULMAZ (aynı cihazı iki
 * yakalayıcının paylaşması Windows'ta sessiz/boş tanımaya yol açabiliyor).
 */

type SpeechResultList = {
  length: number;
  [index: number]: { isFinal: boolean; 0?: { transcript?: string }; item?: (i: number) => { transcript?: string } };
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onerror: ((ev: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechCtor = new () => SpeechRecognitionInstance;

export type JuniorVipSpeechEngine = 'webspeech' | 'recorder';
export type JuniorVipMicDevice = { deviceId: string; label: string };

const WS_BROKEN_KEY = 'junior_vip_webspeech_broken';
const MIC_DEVICE_KEY = 'junior_vip_mic_device';
/** RMS eşiği — bunun altı "sessiz/yanlış mikrofon" sayılır. */
const SILENCE_RMS = 0.006;
/** Web Speech start() sonrası ses yakalama başlamazsa kayıt moduna geç (ms). */
const AUDIOSTART_WATCHDOG_MS = 4500;

function getRecognitionCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Telefon / mobil tarayıcı — mevcut (çalışan) Web Speech yolu aynen korunur. */
export function isMobileSpeechDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

/** iPadOS Safari masaüstü UA gönderir; önceki sürümde kayıt modundaydı — davranışı korunur. */
function isTouchDesktopUa(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Macintosh/i.test(navigator.userAgent || '') && (navigator.maxTouchPoints || 0) > 1;
}

function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** Geriye uyum: eski API. Artık yalnızca dokunmatik masaüstü UA (iPad) veya Web Speech yoksa true. */
export function prefersDesktopRecorderMode(): boolean {
  if (typeof window === 'undefined' || isMobileSpeechDevice()) return false;
  if (!canRecord()) return false;
  return isTouchDesktopUa() || !getRecognitionCtor();
}

function webSpeechMarkedBroken(): boolean {
  try {
    return sessionStorage.getItem(WS_BROKEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markWebSpeechBroken(): void {
  try {
    sessionStorage.setItem(WS_BROKEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

function readStoredDevice(): string {
  try {
    return localStorage.getItem(MIC_DEVICE_KEY) || '';
  } catch {
    return '';
  }
}

function pickRecorderMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'audio/webm';
}

function pickTurkishVoice(gender: JuniorVipMascotGender) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const tr = voices.filter((v) => v.lang.toLowerCase().startsWith('tr'));
  if (!tr.length) return null;
  const femaleHint = /kadın|kadin|female|woman|zira|ayşe|google türkçe/i;
  const maleHint = /erkek|male|man|yetişkin/i;
  if (gender === 'girl') {
    return tr.find((v) => femaleHint.test(v.name)) || tr[0];
  }
  return tr.find((v) => maleHint.test(v.name)) || tr.find((v) => !femaleHint.test(v.name)) || tr[0];
}

function transcriptPiece(result: SpeechResultList[number]): string {
  const alt = result[0] ?? result.item?.(0);
  return String(alt?.transcript || '').trim();
}

function transcriptFromResults(results: SpeechResultList): string {
  let out = '';
  for (let i = 0; i < results.length; i++) {
    const piece = transcriptPiece(results[i]);
    if (!piece) continue;
    out += (out ? ' ' : '') + piece;
  }
  return out.trim();
}

export function mapSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Mikrofon izni verilmedi. Adres çubuğundaki kilit → Mikrofon → İzin ver.';
    case 'no-speech':
      return 'Ses duyamadım. Mikrofonu kapatıp tekrar aç, net ve yüksek konuş.';
    case 'audio-capture':
      return 'Mikrofon bulunamadı veya başka uygulama kullanıyor.';
    case 'network':
      return 'Ses tanıma Google sunucusu ister. İnternet / reklam engelleyici kontrol et.';
    case 'aborted':
      return 'Dinleme durdu.';
    default:
      return `Ses tanıma hatası (${code}). Yazarak da devam edebilirsin.`;
  }
}

/** getUserMedia hatasını kullanıcıya anlaşılır, çözüm içeren mesaja çevirir. */
export function describeMicError(e: unknown): { code: string; message: string } {
  const name = (e as { name?: string })?.name || '';
  const msg = (e as { message?: string })?.message || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    if (/system/i.test(msg)) {
      return {
        code: 'os_blocked',
        message:
          'Bilgisayar ayarları tarayıcının mikrofonu kullanmasını engelliyor. Windows: Ayarlar → Gizlilik ve güvenlik → Mikrofon → “Masaüstü uygulamalarının mikrofona erişmesine izin ver”i açın. Mac: Sistem Ayarları → Gizlilik ve Güvenlik → Mikrofon → tarayıcıyı açın. Sonra sayfayı yenileyin.'
      };
    }
    return {
      code: 'site_blocked',
      message:
        'Bu site için mikrofon engellenmiş. Adres çubuğundaki kilit/ayar simgesi → Mikrofon → “İzin ver” seçin ve sayfayı yenileyin.'
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      code: 'not_found',
      message:
        'Mikrofon bulunamadı. Mikrofonun/kulaklığın takılı olduğundan ve Windows Ses ayarlarında (Giriş) etkin olduğundan emin olun.'
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      code: 'busy',
      message:
        'Mikrofon başka bir uygulama tarafından kullanılıyor veya sürücü yanıt vermiyor. Zoom/Teams/Discord gibi uygulamaları kapatıp tekrar deneyin.'
    };
  }
  if (name === 'SecurityError') {
    return { code: 'insecure', message: 'Mikrofon yalnızca güvenli bağlantıda (https) kullanılabilir.' };
  }
  return { code: 'unknown', message: `Mikrofon açılamadı${name ? ` (${name})` : ''}. Yazarak da devam edebilirsin.` };
}

export function useJuniorVipSpeech(opts: {
  mascotGender: JuniorVipMascotGender;
  scope: JuniorVipScope;
  /** Sunucuda Whisper var mı (null = bilinmiyor). false ise kayıt moduna düşülmez. */
  serverTranscribe?: boolean | null;
  onError?: (message: string) => void;
  onInfo?: (message: string) => void;
}) {
  const { mascotGender, scope, serverTranscribe = null, onError, onInfo } = opts;
  const mobile = isMobileSpeechDevice();

  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [engine, setEngine] = useState<JuniorVipSpeechEngine>('webspeech');
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState<JuniorVipMicDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string>(readStoredDevice);

  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);
  const lastHeardRef = useRef('');
  const listenSessionRef = useRef(0);
  const noSpeechRetriesRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<JuniorVipSpeechEngine>('webspeech');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recorderMimeRef = useRef('audio/webm');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const peakRef = useRef(0);
  const wsAudioStartedRef = useRef(false);
  const wsSoundStartedRef = useRef(false);
  const watchdogRef = useRef<number | null>(null);
  const fallbackSessionRef = useRef(0);
  const selectedDeviceRef = useRef(selectedDeviceId);
  selectedDeviceRef.current = selectedDeviceId;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const serverTranscribeRef = useRef(serverTranscribe);
  serverTranscribeRef.current = serverTranscribe;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;

  const setEngineBoth = useCallback((e: JuniorVipSpeechEngine) => {
    engineRef.current = e;
    setEngine(e);
  }, []);

  /** Bu dinleme için motor seçimi. */
  const chooseEngine = useCallback((): JuniorVipSpeechEngine => {
    if (mobile) return 'webspeech';
    if (isTouchDesktopUa() && canRecord()) return 'recorder';
    const ctor = getRecognitionCtor();
    // Web Speech yalnızca sistem varsayılan mikrofonunu kullanır; başka cihaz seçildiyse kayıt modu.
    const customDevice = Boolean(selectedDeviceRef.current) && selectedDeviceRef.current !== 'default';
    // Sunucu yedeği kapalıysa Web Speech'ten vazgeçme (tek çalışan yol odur).
    const brokenFlag = webSpeechMarkedBroken() && serverTranscribeRef.current !== false;
    if (ctor && !brokenFlag && !customDevice) return 'webspeech';
    if (canRecord()) return 'recorder';
    return 'webspeech';
  }, [mobile]);

  useEffect(() => {
    const ok = mobile ? Boolean(getRecognitionCtor()) : Boolean(getRecognitionCtor()) || canRecord();
    setMicSupported(ok);
    setEngineBoth(chooseEngine());
  }, [chooseEngine, mobile, setEngineBoth]);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Mikrofon ${i + 1}` }));
      setDevices(inputs);
      const sel = selectedDeviceRef.current;
      if (sel && inputs.length && !inputs.some((d) => d.deviceId === sel)) {
        setSelectedDeviceIdState('');
        try {
          localStorage.removeItem(MIC_DEVICE_KEY);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (mobile || typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    void refreshDevices();
    const md = navigator.mediaDevices;
    const onChange = () => void refreshDevices();
    md.addEventListener?.('devicechange', onChange);
    return () => md.removeEventListener?.('devicechange', onChange);
  }, [mobile, refreshDevices]);

  const setSelectedDeviceId = useCallback(
    (id: string) => {
      setSelectedDeviceIdState(id);
      selectedDeviceRef.current = id;
      try {
        if (id) localStorage.setItem(MIC_DEVICE_KEY, id);
        else localStorage.removeItem(MIC_DEVICE_KEY);
      } catch {
        /* ignore */
      }
      setEngineBoth(chooseEngine());
    },
    [chooseEngine, setEngineBoth]
  );

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current != null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (meterTimerRef.current != null) {
      window.clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) void ctx.close().catch(() => undefined);
    setLevel(0);
  }, []);

  const startMeter = useCallback(
    (stream: MediaStream) => {
      stopMeter();
      peakRef.current = 0;
      try {
        const AC =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        void ctx.resume().catch(() => undefined);
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        meterTimerRef.current = window.setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          if (rms > peakRef.current) peakRef.current = rms;
          setLevel(Math.min(1, Math.sqrt(rms) * 2.5));
        }, 90);
      } catch {
        /* ölçer opsiyonel */
      }
    },
    [stopMeter]
  );

  const releaseMicStream = useCallback(() => {
    stopMeter();
    const stream = micStreamRef.current;
    micStreamRef.current = null;
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  }, [stopMeter]);

  const abortRecognition = useCallback(() => {
    clearWatchdog();
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onend = null;
    rec.onerror = null;
    rec.onresult = null;
    try {
      rec.abort();
    } catch {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, [clearWatchdog]);

  const stopRecorder = useCallback(() => {
    const rec = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    listenSessionRef.current += 1;
    onTranscriptRef.current = null;
    noSpeechRetriesRef.current = 0;
    lastHeardRef.current = '';
    abortRecognition();
    stopRecorder();
    recordChunksRef.current = [];
    releaseMicStream();
    setListening(false);
    setTranscribing(false);
  }, [abortRecognition, releaseMicStream, stopRecorder]);

  const stopListeningRef = useRef(stopListening);
  stopListeningRef.current = stopListening;

  /**
   * Mikrofon akışını açar (izin ister). Hata türüne göre çözüm mesajı verir.
   * `silent`: yalnızca ısıtma — hata gösterme.
   */
  const ensureMicReady = useCallback(
    async (silent = false): Promise<boolean> => {
      const stream = micStreamRef.current;
      if (stream?.active && stream.getAudioTracks().some((t) => t.readyState === 'live')) {
        return true;
      }
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!silent) onErrorRef.current?.('Bu tarayıcı mikrofon erişimini desteklemiyor. Chrome veya Edge kullanın.');
        return false;
      }
      const base: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      const dev = selectedDeviceRef.current;
      const attempt = (withDevice: boolean) =>
        navigator.mediaDevices.getUserMedia({
          audio: withDevice && dev ? { ...base, deviceId: { exact: dev } } : base
        });
      try {
        releaseMicStream();
        let next: MediaStream;
        try {
          next = await attempt(true);
        } catch (e) {
          const n = (e as { name?: string })?.name;
          // Seçili cihaz çıkarılmışsa varsayılana dön.
          if (dev && (n === 'OverconstrainedError' || n === 'NotFoundError')) {
            setSelectedDeviceIdState('');
            selectedDeviceRef.current = '';
            try {
              localStorage.removeItem(MIC_DEVICE_KEY);
            } catch {
              /* ignore */
            }
            next = await attempt(false);
          } else {
            throw e;
          }
        }
        micStreamRef.current = next;
        if (!mobile) void refreshDevices(); // izin sonrası cihaz adları görünür
        return true;
      } catch (e) {
        if (!silent) onErrorRef.current?.(describeMicError(e).message);
        return false;
      }
    },
    [mobile, refreshDevices, releaseMicStream]
  );

  /** Web Speech mikrofonu açamadığında gerçek nedeni getUserMedia ile teşhis eder. */
  const diagnoseMic = useCallback(async (): Promise<string | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const t of s.getTracks()) t.stop();
      return null; // mikrofon sağlam → sorun tanıma servisinde
    } catch (e) {
      return describeMicError(e).message;
    }
  }, []);

  /** Panel açılınca: telefonda önceki gibi mikrofonu ısıt; masaüstünde akış tutma (yalnızca cihaz listesi). */
  const warmupMic = useCallback(() => {
    if (mobile) {
      void ensureMicReady(true);
      return;
    }
    void refreshDevices();
  }, [ensureMicReady, mobile, refreshDevices]);

  const releaseMicWarmup = useCallback(() => {
    if (listening || transcribing) return;
    stopListening();
  }, [listening, stopListening, transcribing]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const t = String(text || '').trim();
      if (!t) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'tr-TR';
      u.rate = 0.94;
      u.pitch = mascotGender === 'girl' ? 1.28 : 1.12;
      u.volume = 1;
      const voice = pickTurkishVoice(mascotGender);
      if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
    },
    [mascotGender]
  );

  const startRecorder = useCallback(
    (sessionId: number) => {
      const stream = micStreamRef.current;
      if (!stream || sessionId !== listenSessionRef.current) return;

      recordChunksRef.current = [];
      const mime = pickRecorderMime();
      recorderMimeRef.current = mime;
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime });
      } catch {
        recorder = new MediaRecorder(stream);
        recorderMimeRef.current = recorder.mimeType || 'audio/webm';
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data?.size) recordChunksRef.current.push(ev.data);
      };

      recorder.onerror = () => {
        onErrorRef.current?.('Ses kaydı hatası. Mikrofonu kapatıp tekrar deneyin.');
        setListening(false);
      };

      mediaRecorderRef.current = recorder;
      startMeter(stream);
      recorder.start(300);
      setListening(true);
    },
    [startMeter]
  );

  /**
   * Kayıt moduna geç. `cause`: Web Speech'ten düşülüyorsa kısa neden (masaüstü yedeği).
   * Sunucu Whisper kapalıysa kayda geçmez, nedeni ve çözümü söyler.
   */
  const startRecorderSession = useCallback(
    async (sessionId: number, cause?: string): Promise<void> => {
      const prefix = cause ? `${cause} ` : '';
      if (!canRecord()) {
        onTranscriptRef.current = null;
        setListening(false);
        onErrorRef.current?.(`${prefix}Bu tarayıcıda sesli komut desteklenmiyor. Chrome veya Edge kullanın ya da yazın.`);
        return;
      }
      if (serverTranscribeRef.current === false) {
        onTranscriptRef.current = null;
        setListening(false);
        onErrorRef.current?.(
          `${prefix}Yedek ses çözümü sunucuda kapalı (yönetici: Vercel’de OPENAI_API_KEY tanımlanmalı). Şimdilik yazarak devam edebilirsin.`
        );
        return;
      }
      setEngineBoth('recorder');
      const ok = await ensureMicReady();
      if (!ok || sessionId !== listenSessionRef.current) {
        if (sessionId === listenSessionRef.current) {
          onTranscriptRef.current = null;
          setListening(false);
        }
        return;
      }
      if (cause) onInfoRef.current?.(`${prefix}Kayıt moduna geçtim — konuş, bitince mikrofona tekrar bas.`);
      startRecorder(sessionId);
    },
    [ensureMicReady, setEngineBoth, startRecorder]
  );

  /** Masaüstü: Web Speech kullanılamıyor → bu tarayıcı oturumu için kayıt moduna geç (dinleme başına bir kez). */
  const fallbackToRecorder = useCallback(
    (sessionId: number, cause: string) => {
      if (mobile || sessionId !== listenSessionRef.current || fallbackSessionRef.current === sessionId) return;
      fallbackSessionRef.current = sessionId;
      if (serverTranscribeRef.current !== false) markWebSpeechBroken();
      abortRecognition();
      void startRecorderSession(sessionId, cause);
    },
    [abortRecognition, mobile, startRecorderSession]
  );

  const armRecognition = useCallback(
    (sessionId: number) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor || sessionId !== listenSessionRef.current) return;

      abortRecognition();

      const rec = new Ctor();
      rec.lang = 'tr-TR';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => setListening(true);
      rec.onaudiostart = () => {
        wsAudioStartedRef.current = true;
        clearWatchdog();
      };
      rec.onsoundstart = () => {
        wsSoundStartedRef.current = true;
      };

      rec.onresult = (event) => {
        const text = transcriptFromResults(event.results);
        if (!text) return;
        lastHeardRef.current = text;
        onTranscriptRef.current?.(text);
      };

      rec.onerror = (ev) => {
        const code = ev?.error || 'unknown';
        if (code === 'aborted' || sessionId !== listenSessionRef.current) return;

        if (!mobile) {
          // Tanıma servisi yok / engelli (Brave, Chromium, kurumsal ağ…) → kayıt modu.
          if (code === 'network' || code === 'service-not-allowed' || code === 'language-not-supported') {
            fallbackToRecorder(sessionId, 'Tarayıcının ses tanıma servisine ulaşılamadı.');
            return;
          }
          if (code === 'not-allowed' || code === 'audio-capture') {
            // Teşhis bitene kadar onend yeniden başlatmasın.
            abortRecognition();
            void diagnoseMic().then((micProblem) => {
              if (sessionId !== listenSessionRef.current) return;
              if (micProblem) {
                stopListeningRef.current();
                onErrorRef.current?.(micProblem);
                return;
              }
              // Mikrofon getUserMedia ile açılabiliyor ama tanıma servisi açamıyor → kayıt modu.
              fallbackToRecorder(sessionId, 'Tarayıcının ses tanıması mikrofonu açamadı.');
            });
            return;
          }
          // Mikrofon sessiz / yanlış giriş cihazı: hiç ses algılanmadan no-speech → ölçerli kayıt moduna geç.
          if (code === 'no-speech' && !lastHeardRef.current.trim() && !wsSoundStartedRef.current) {
            fallbackToRecorder(
              sessionId,
              'Ses tanıma mikrofondan ses alamadı; konuşurken ses seviyesi çubuğunun hareket ettiğini kontrol et.'
            );
            return;
          }
        }

        if (code === 'no-speech' && onTranscriptRef.current && noSpeechRetriesRef.current < 12) {
          noSpeechRetriesRef.current += 1;
          window.setTimeout(() => armRecognition(sessionId), 200);
          return;
        }

        if (code === 'no-speech' && lastHeardRef.current.trim()) return;

        // Kalıcı hata: onend yeniden başlatmasın (aksi hâlde aynı hata sonsuz döngüde tekrar eder).
        onTranscriptRef.current = null;
        setListening(false);
        onErrorRef.current?.(mapSpeechError(code));
      };

      rec.onend = () => {
        if (sessionId !== listenSessionRef.current || engineRef.current !== 'webspeech') return;
        recRef.current = null;
        if (onTranscriptRef.current) {
          window.setTimeout(() => armRecognition(sessionId), 120);
        } else {
          setListening(false);
        }
      };

      recRef.current = rec;
      try {
        rec.start();
        if (!mobile && !wsAudioStartedRef.current) {
          clearWatchdog();
          watchdogRef.current = window.setTimeout(() => {
            watchdogRef.current = null;
            if (sessionId !== listenSessionRef.current || wsAudioStartedRef.current) return;
            fallbackToRecorder(sessionId, 'Tarayıcının ses tanıması başlamadı.');
          }, AUDIOSTART_WATCHDOG_MS);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (/already started|InvalidState/i.test(message) && onTranscriptRef.current) {
          window.setTimeout(() => armRecognition(sessionId), 100);
          return;
        }
        if (!mobile) {
          fallbackToRecorder(sessionId, 'Tarayıcının ses tanıması başlatılamadı.');
          return;
        }
        setListening(false);
        onErrorRef.current?.(message || 'Mikrofon başlatılamadı');
      }
    },
    [abortRecognition, clearWatchdog, diagnoseMic, fallbackToRecorder, mobile]
  );

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        onErrorRef.current?.('Sesli komut yalnızca güvenli bağlantıda (https) çalışır.');
        return;
      }

      const chosen = chooseEngine();
      setEngineBoth(chosen);

      if (chosen === 'webspeech' && !getRecognitionCtor()) {
        onErrorRef.current?.('Bu tarayıcıda sesli komut desteklenmiyor. Chrome veya Edge dene.');
        return;
      }

      abortRecognition();
      stopRecorder();
      recordChunksRef.current = [];
      listenSessionRef.current += 1;
      const sessionId = listenSessionRef.current;
      onTranscriptRef.current = onTranscript;
      noSpeechRetriesRef.current = 0;
      lastHeardRef.current = '';
      wsAudioStartedRef.current = false;
      wsSoundStartedRef.current = false;

      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }

      if (chosen === 'recorder') {
        setListening(true);
        void startRecorderSession(sessionId);
        return;
      }

      // Web Speech: start() tıklama ile senkron çağrılmalı (Chrome/Safari kullanıcı jesti kuralı).
      setListening(true);
      armRecognition(sessionId);

      // Telefon: önceki çalışan davranış — paralel mikrofon ısıtma. Masaüstünde ikinci yakalayıcı açılmaz.
      if (mobile) void ensureMicReady();
    },
    [abortRecognition, armRecognition, chooseEngine, ensureMicReady, mobile, setEngineBoth, startRecorderSession, stopRecorder]
  );

  const finishListening = useCallback(async (): Promise<string> => {
    if (engineRef.current === 'recorder') {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        // Kayıt henüz başlamadı (izin bekleniyor vb.)
        stopListening();
        return '';
      }
      const sessionId = listenSessionRef.current;
      setListening(false);
      setTranscribing(true);
      const peak = peakRef.current;
      const meterRan = meterTimerRef.current != null;

      const mime = recorderMimeRef.current;
      const textPromise = new Promise<string>((resolve) => {
        recorder.onstop = () => {
          mediaRecorderRef.current = null;
          const blob = new Blob(recordChunksRef.current, { type: mime });
          recordChunksRef.current = [];
          if (meterRan && peak < SILENCE_RMS) {
            onErrorRef.current?.(
              'Mikrofondan ses gelmedi. Doğru mikrofonu seçtiğinden (mikrofon menüsü) ve sessize alınmadığından emin ol.'
            );
            resolve('');
            return;
          }
          if (blob.size < 200) {
            resolve('');
            return;
          }
          void juniorVipTranscribeAudio(blob, scopeRef.current)
            .then(resolve)
            .catch((e) => {
              onErrorRef.current?.(e instanceof Error ? e.message : 'Ses çözülemedi');
              resolve('');
            });
        };
        try {
          recorder.stop();
        } catch {
          resolve('');
        }
      });

      stopMeter();
      const text = await textPromise;
      if (sessionId === listenSessionRef.current) {
        listenSessionRef.current += 1;
        onTranscriptRef.current = null;
      }
      setTranscribing(false);
      releaseMicStream();
      return text.trim();
    }

    const heard = (lastHeardRef.current || '').trim();
    listenSessionRef.current += 1;
    onTranscriptRef.current = null;
    noSpeechRetriesRef.current = 0;
    abortRecognition();
    releaseMicStream();
    lastHeardRef.current = '';
    setListening(false);
    return heard;
  }, [abortRecognition, releaseMicStream, stopListening, stopMeter]);

  useEffect(
    () => () => {
      listenSessionRef.current += 1;
      clearWatchdog();
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      const r = mediaRecorderRef.current;
      if (r && r.state !== 'inactive') {
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      }
      if (meterTimerRef.current != null) window.clearInterval(meterTimerRef.current);
      void audioCtxRef.current?.close().catch(() => undefined);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [clearWatchdog]
  );

  return {
    micSupported,
    listening,
    transcribing,
    engine,
    /** Geriye uyum */
    desktopRecorderMode: engine === 'recorder',
    isMobile: mobile,
    level,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    startListening,
    stopListening,
    finishListening,
    ensureMicReady,
    warmupMic,
    releaseMicWarmup,
    speak
  };
}
