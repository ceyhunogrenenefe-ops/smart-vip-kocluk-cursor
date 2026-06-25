import { useCallback, useState } from 'react';
import { RecordingUnavailableModal } from '../components/liveLessons/RecordingUnavailableModal';

export function recordingUnavailableText(e: unknown, fallback = 'Kayıt henüz hazır değil.'): string {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  const s = String(e ?? '').trim();
  return s || fallback;
}

export function useRecordingUnavailableAlert() {
  const [message, setMessage] = useState<string | null>(null);

  const showRecordingUnavailable = useCallback((text: string) => {
    setMessage(String(text || '').trim() || 'Kayıt henüz hazır değil.');
  }, []);

  const dismissRecordingUnavailable = useCallback(() => setMessage(null), []);

  const recordingAlertModal = (
    <RecordingUnavailableModal
      open={Boolean(message)}
      message={message ?? ''}
      onClose={dismissRecordingUnavailable}
    />
  );

  return { showRecordingUnavailable, recordingAlertModal };
}
