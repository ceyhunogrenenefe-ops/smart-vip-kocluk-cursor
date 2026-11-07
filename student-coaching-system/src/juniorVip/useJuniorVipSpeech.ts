import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognition(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useJuniorVipSpeech(enabled: boolean) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<InstanceType<SpeechCtor> | null>(null);

  useEffect(() => {
    setSupported(Boolean(getRecognition()) && enabled);
  }, [enabled]);

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const t = String(text || '').trim();
    if (!t) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'tr-TR';
    u.rate = 1.02;
    u.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const tr = voices.find((v) => v.lang.startsWith('tr'));
    if (tr) u.voice = tr;
    window.speechSynthesis.speak(u);
  }, []);

  const startListening = useCallback(
    (onFinal: (transcript: string) => void) => {
      if (!enabled) return;
      const Ctor = getRecognition();
      if (!Ctor) return;
      stopListening();
      const rec = new Ctor();
      rec.lang = 'tr-TR';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (ev: unknown) => {
        const e = ev as { results?: { 0?: { 0?: { transcript?: string } } } };
        const text = String(e?.results?.[0]?.[0]?.transcript || '').trim();
        if (text) onFinal(text);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      try {
        rec.start();
      } catch {
        setListening(false);
      }
    },
    [enabled, stopListening]
  );

  return { supported, listening, startListening, stopListening, speak };
}
