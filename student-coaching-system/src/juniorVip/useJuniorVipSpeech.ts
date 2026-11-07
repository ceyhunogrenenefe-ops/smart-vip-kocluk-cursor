import { useCallback, useEffect, useRef, useState } from 'react';
import type { JuniorVipMascotGender } from './inferMascotGender';

type SpeechResultList = {
  length: number;
  [index: number]: { isFinal: boolean; 0?: { transcript?: string } };
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

function mapSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verip tekrar dene.';
    case 'no-speech':
      return 'Ses duyamadım. Biraz daha yüksek ve net konuşur musun?';
    case 'audio-capture':
      return 'Mikrofon bulunamadı veya başka uygulama kullanıyor.';
    case 'network':
      return 'Ses tanıma için internet bağlantısı gerekir.';
    case 'aborted':
      return 'Dinleme durdu.';
    default:
      return 'Ses tanıma hatası. Yazarak da devam edebilirsin.';
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
  const pendingStartRef = useRef<((text: string) => void) | null>(null);
  const lastHeardRef = useRef('');
  const voicesReadyRef = useRef(false);

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

  const stopListening = useCallback(() => {
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
    setListening(false);
  }, []);

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

  const startListening = useCallback(
    async (onFinal: (transcript: string) => void, onInterim?: (transcript: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        onError?.('Bu tarayıcıda sesli komut desteklenmiyor. Chrome veya Edge dene.');
        return;
      }

      stopListening();
      pendingStartRef.current = onFinal;

      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          for (const track of stream.getTracks()) track.stop();
        }
      } catch {
        onError?.('Mikrofon izni gerekli. İzin verip mikrofona tekrar bas.');
        return;
      }

      const rec = new Ctor();
      rec.lang = 'tr-TR';
      rec.continuous = true;
      rec.interimResults = true;
      lastHeardRef.current = '';
      rec.maxAlternatives = 1;

      rec.onstart = () => setListening(true);

      rec.onresult = (event) => {
        let finalText = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = String(event.results[i][0]?.transcript || '').trim();
          if (!piece) continue;
          if (event.results[i].isFinal) finalText += (finalText ? ' ' : '') + piece;
          else interim += piece;
        }
        const text = (finalText || interim).trim();
        if (text) {
          lastHeardRef.current = text;
          if (!finalText) onInterim?.(text);
        }
        if (finalText && pendingStartRef.current) {
          const cb = pendingStartRef.current;
          pendingStartRef.current = null;
          lastHeardRef.current = '';
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          cb(finalText.trim());
        }
      };

      rec.onerror = (ev) => {
        setListening(false);
        const code = ev?.error || 'unknown';
        if (code !== 'aborted') onError?.(mapSpeechError(code));
      };

      rec.onend = () => {
        const heard = lastHeardRef.current.trim();
        if (pendingStartRef.current && heard) {
          const cb = pendingStartRef.current;
          pendingStartRef.current = null;
          cb(heard);
        }
        setListening(false);
        recRef.current = null;
      };

      recRef.current = rec;
      try {
        rec.start();
      } catch (e) {
        setListening(false);
        onError?.(e instanceof Error ? e.message : 'Mikrofon başlatılamadı');
      }
    },
    [onError, stopListening]
  );

  return { micSupported, listening, startListening, stopListening, speak };
}
