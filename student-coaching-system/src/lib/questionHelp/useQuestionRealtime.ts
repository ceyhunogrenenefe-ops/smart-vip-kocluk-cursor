import { useEffect } from 'react';
import { supabase, isSupabaseReady } from '../supabase';

type QuestionRealtimeOpts = {
  /** Öğrenci: yalnız kendi sorularında yenile */
  studentId?: string | null;
};

/** Soru havuzu / öğrenci listesi — postgres_changes ile yenile */
export function useQuestionRealtime(
  onChange: () => void,
  enabled = true,
  opts?: QuestionRealtimeOpts
) {
  const studentId = opts?.studentId?.trim() || null;

  useEffect(() => {
    if (!enabled || !isSupabaseReady) return;
    const channel = supabase
      .channel(studentId ? `question-help-${studentId}` : 'question-help-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'questions',
          ...(studentId ? { filter: `student_id=eq.${studentId}` } : {})
        },
        () => {
          onChange();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, onChange, studentId]);
}
