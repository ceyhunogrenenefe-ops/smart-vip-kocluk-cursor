import { useCallback, useEffect, useRef, useState } from 'react';
import type { JuniorVipMascotGender } from './inferMascotGender';

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

/** Chrome: tüm result listesinden birleşik metin */
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
  onError?: (message: string) => void;
}) {
  const { mascotGender, onError } = opts;
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);
  const lastHeardRef = useRef('');
  const voicesReadyRef = useRef(false);
  const listenSessionRef = useRef(0);
  const noSpeechRetriesRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    setMicSupported(Boolean(getRecognitionCtor()));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      voicesReadyRef.current = window.speechSynthesis.getVoices().length > 0;
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
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

  const stopListening = useCallback(() => {
    listenSessionRef.current += 1;
    onTranscriptRef.current = null;
    noSpeechRetriesRef.current = 0;
    lastHeardRef.current = '';
    abortRecognition();
    releaseMicStream();
    setListening(false);
  }, [abortRecognition, releaseMicStream]);

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
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        onErrorRef.current?.('Bu tarayıcıda sesli komut desteklenmiyor. Chrome veya Edge dene.');
        return;
      }

      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        onErrorRef.current?.('Sesli komut yalnızca güvenli bağlantıda (https) çalışır.');
        return;
      }

      stopListening();
      onTranscriptRef.current = onTranscript;
      noSpeechRetriesRef.current = 0;
      const sessionId = listenSessionRef.current;

      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }

      setListening(true);
      armRecognition(sessionId);

      void navigator.mediaDevices
        ?.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        .then((stream) => {
          if (sessionId !== listenSessionRef.current) {
            for (const track of stream.getTracks()) track.stop();
            return;
          }
          releaseMicStream();
          micStreamRef.current = stream;
        })
        .catch(() => {
          /* SpeechRecognition ayrı izin kullanır */
        });
    },
    [armRecognition, releaseMicStream, stopListening]
  );

  /** Dinlemeyi kapat; varsa son duyulan metni döndür */
  const finishListening = useCallback((): string => {
    const heard = (lastHeardRef.current || '').trim();
    listenSessionRef.current += 1;
    onTranscriptRef.current = null;
    noSpeechRetriesRef.current = 0;
    abortRecognition();
    releaseMicStream();
    lastHeardRef.current = '';
    setListening(false);
    return heard;
  }, [abortRecognition, releaseMicStream]);

  return { micSupported, listening, startListening, stopListening, finishListening, speak };
}
