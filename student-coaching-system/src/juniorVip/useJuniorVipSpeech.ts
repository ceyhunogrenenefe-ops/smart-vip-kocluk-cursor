import { useCallback, useEffect, useRef, useState } from 'react';
import type { JuniorVipMascotGender } from './inferMascotGender';
import { juniorVipTranscribeAudio } from './juniorVipApi';

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
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechCtor = new () => SpeechRecognitionInstance;

function getRecognitionCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Telefonda Web Speech iyi; masaüstü Windows Chrome sık bozuk → sunucu Whisper. */
export function prefersDesktopRecorderMode(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
  return typeof MediaRecorder !== 'undefined';
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

function mapSpeechError(code: string): string {
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

export function useJuniorVipSpeech(opts: {
  mascotGender: JuniorVipMascotGender;
  studentId: string;
  onError?: (message: string) => void;
}) {
  const { mascotGender, studentId, onError } = opts;
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);
  const lastHeardRef = useRef('');
  const listenSessionRef = useRef(0);
  const noSpeechRetriesRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const useRecorderRef = useRef(prefersDesktopRecorderMode());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recorderMimeRef = useRef('audio/webm');
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const ok = prefersDesktopRecorderMode() ? true : Boolean(getRecognitionCtor());
    setMicSupported(ok);
  }, []);

  const releaseMicStream = useCallback(() => {
    const stream = micStreamRef.current;
    micStreamRef.current = null;
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  }, []);

  const abortRecognition = useCallback(() => {
    try {
      recRef.current?.abort();
    } catch {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
    }
    recRef.current = null;
  }, []);

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

  const ensureMicReady = useCallback(async (): Promise<boolean> => {
    const stream = micStreamRef.current;
    if (stream?.active && stream.getAudioTracks().some((t) => t.readyState === 'live')) {
      return true;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.('Mikrofon API’si yok.');
      return false;
    }
    try {
      releaseMicStream();
      const next = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      micStreamRef.current = next;
      return true;
    } catch {
      onErrorRef.current?.('Mikrofon izni gerekli (kilit simgesi → İzin ver).');
      return false;
    }
  }, [releaseMicStream]);

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
        onErrorRef.current?.('Ses kaydı hatası.');
        setListening(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(300);
      setListening(true);
    },
    []
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

      rec.onresult = (event) => {
        const text = transcriptFromResults(event.results);
        if (!text) return;
        lastHeardRef.current = text;
        onTranscriptRef.current?.(text);
      };

      rec.onerror = (ev) => {
        const code = ev?.error || 'unknown';
        if (code === 'aborted' || sessionId !== listenSessionRef.current) return;

        if (code === 'no-speech' && onTranscriptRef.current && noSpeechRetriesRef.current < 12) {
          noSpeechRetriesRef.current += 1;
          window.setTimeout(() => armRecognition(sessionId), 200);
          return;
        }

        if (code === 'no-speech' && lastHeardRef.current.trim()) return;

        setListening(false);
        onErrorRef.current?.(mapSpeechError(code));
      };

      rec.onend = () => {
        if (sessionId !== listenSessionRef.current) return;
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
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (/already started|InvalidState/i.test(message) && onTranscriptRef.current) {
          window.setTimeout(() => armRecognition(sessionId), 100);
          return;
        }
        setListening(false);
        onErrorRef.current?.(message || 'Mikrofon başlatılamadı');
      }
    },
    [abortRecognition]
  );

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        onErrorRef.current?.('Sesli komut yalnızca güvenli bağlantıda (https) çalışır.');
        return;
      }

      const desktopRec = prefersDesktopRecorderMode();
      useRecorderRef.current = desktopRec;

      if (!desktopRec && !getRecognitionCtor()) {
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

      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }

      if (desktopRec) {
        void ensureMicReady().then((ok) => {
          if (!ok || sessionId !== listenSessionRef.current) return;
          startRecorder(sessionId);
        });
        return;
      }

      setListening(true);
      armRecognition(sessionId);

      void ensureMicReady();
    },
    [armRecognition, ensureMicReady, startRecorder]
  );

  const finishListening = useCallback(async (): Promise<string> => {
    const desktopRec = useRecorderRef.current;

    if (desktopRec && mediaRecorderRef.current) {
      const sessionId = listenSessionRef.current;
      setListening(false);
      setTranscribing(true);

      const recorder = mediaRecorderRef.current;
      const mime = recorderMimeRef.current;
      const textPromise = new Promise<string>((resolve) => {
        recorder.onstop = () => {
          mediaRecorderRef.current = null;
          const blob = new Blob(recordChunksRef.current, { type: mime });
          recordChunksRef.current = [];
          if (blob.size < 200) {
            resolve('');
            return;
          }
          void juniorVipTranscribeAudio(blob, studentId)
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
  }, [abortRecognition, releaseMicStream, studentId]);

  return {
    micSupported,
    listening,
    transcribing,
    desktopRecorderMode: useRecorderRef.current,
    startListening,
    stopListening,
    finishListening,
    ensureMicReady,
    releaseMicWarmup,
    speak
  };
}
