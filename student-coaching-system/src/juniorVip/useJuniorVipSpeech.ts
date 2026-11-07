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

function transcriptPiece(
  result: { isFinal: boolean; length: number; 0?: { transcript?: string }; item?: (i: number) => { transcript?: string } }
): string {
  const alt = result[0] ?? result.item?.(0);
  return String(alt?.transcript || '').trim();
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
  const onInterimRef = useRef<((text: string) => void) | null>(null);
  const lastHeardRef = useRef('');
  const voicesReadyRef = useRef(false);
  const listenSessionRef = useRef(0);
  const noSpeechRetriesRef = useRef(0);
  const deliveredRef = useRef(false);

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
    listenSessionRef.current += 1;
    pendingStartRef.current = null;
    onInterimRef.current = null;
    noSpeechRetriesRef.current = 0;
    deliveredRef.current = false;
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

  const deliverTranscript = useCallback((text: string) => {
    const t = text.trim();
    if (!t || deliveredRef.current) return;
    deliveredRef.current = true;
    const cb = pendingStartRef.current;
    pendingStartRef.current = null;
    onInterimRef.current = null;
    lastHeardRef.current = '';
    cb?.(t);
    listenSessionRef.current += 1;
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
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

  const armRecognition = useCallback(
    (sessionId: number) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor || sessionId !== listenSessionRef.current) return;

      const rec = new Ctor();
      rec.lang = 'tr-TR';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      lastHeardRef.current = '';

      rec.onstart = () => setListening(true);

      rec.onresult = (event) => {
        let finalText = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = transcriptPiece(event.results[i]);
          if (!piece) continue;
          if (event.results[i].isFinal) finalText += (finalText ? ' ' : '') + piece;
          else interim += piece;
        }
        const text = (finalText || interim).trim();
        if (text) {
          lastHeardRef.current = text;
          if (!finalText) onInterimRef.current?.(text);
        }
        if (finalText) deliverTranscript(finalText);
      };

      rec.onerror = (ev) => {
        const code = ev?.error || 'unknown';
        if (code === 'aborted') return;

        if (code === 'no-speech' && pendingStartRef.current && noSpeechRetriesRef.current < 2) {
          noSpeechRetriesRef.current += 1;
          window.setTimeout(() => armRecognition(sessionId), 120);
          return;
        }

        setListening(false);
        onError?.(mapSpeechError(code));
      };

      rec.onend = () => {
        if (sessionId !== listenSessionRef.current) return;
        const heard = lastHeardRef.current.trim();
        if (pendingStartRef.current && heard) deliverTranscript(heard);
        if (!pendingStartRef.current) setListening(false);
        recRef.current = null;
      };

      recRef.current = rec;
      try {
        rec.start();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (/already started|InvalidState/i.test(message) && pendingStartRef.current) {
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          window.setTimeout(() => armRecognition(sessionId), 60);
          return;
        }
        setListening(false);
        onError?.(message || 'Mikrofon başlatılamadı');
      }
    },
    [deliverTranscript, onError]
  );

  const startListening = useCallback(
    (onFinal: (transcript: string) => void, onInterim?: (transcript: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        onError?.('Bu tarayıcıda sesli komut desteklenmiyor. Chrome veya Edge dene.');
        return;
      }

      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        onError?.('Sesli komut yalnızca güvenli bağlantıda (https) çalışır.');
        return;
      }

      stopListening();
      pendingStartRef.current = onFinal;
      onInterimRef.current = onInterim ?? null;
      deliveredRef.current = false;
      noSpeechRetriesRef.current = 0;

      const sessionId = listenSessionRef.current;

      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }

      // ÖNEMLİ: Chrome recognition.start() kullanıcı tıklamasıyla aynı anda çağrılmalı.
      // await getUserMedia() önce yapılırsa user activation kaybolur ve dinleme sessizce çalışmaz.
      armRecognition(sessionId);

      void navigator.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((stream) => {
          for (const track of stream.getTracks()) track.stop();
        })
        .catch(() => {
          /* recognition kendi iznini de isteyebilir; hata burada tek başına fatal değil */
        });
    },
    [armRecognition, onError, stopListening]
  );

  return { micSupported, listening, startListening, stopListening, speak };
}
