import type { WeeklyPlannerEntryRow } from './weeklyPlannerApi';
import { formatDdMmYyyyDots } from './pdfLiveWeekGrid';

export type PrevWeekPlannerReview = {
  weekStart: string;
  weekEnd: string;
  taskTotal: number;
  taskCompleted: number;
  taskPartial: number;
  taskMissed: number;
  activeDays: number;
  completionRate: number;
};

export function evaluatePreviousWeekPlanner(
  entries: WeeklyPlannerEntryRow[],
  weekStart: string,
  weekEnd: string
): PrevWeekPlannerReview {
  const inRange = entries.filter((e) => {
    const d = String(e.planner_date || '').slice(0, 10);
    return d >= weekStart && d <= weekEnd;
  });
  const taskCompleted = inRange.filter((e) => e.status === 'completed').length;
  const taskPartial = inRange.filter((e) => e.status === 'partial').length;
  const taskMissed = inRange.filter((e) => e.status === 'missed').length;
  const taskTotal = inRange.length;
  const activeDays = new Set(
    inRange.filter((e) => e.status === 'completed' || e.status === 'partial').map((e) => String(e.planner_date).slice(0, 10))
  ).size;
  const completionRate =
    taskTotal > 0 ? (taskCompleted + taskPartial * 0.5) / taskTotal : 0;

  return {
    weekStart,
    weekEnd,
    taskTotal,
    taskCompleted,
    taskPartial,
    taskMissed,
    activeDays,
    completionRate,
  };
}

/** Önceki hafta performansına göre 2–3 motive edici cümle */
export function buildWeeklyMotivationMessages(opts: {
  studentName: string;
  review: PrevWeekPlannerReview | null;
}): string[] {
  const { studentName, review } = opts;
  const firstName = studentName.trim().split(/\s+/)[0] || studentName || 'Öğrenci';

  if (!review || review.taskTotal === 0) {
    return [
      `${firstName}, yeni hafta temiz bir sayfa! İlk küçük adımı bugün at — momentum seninle birlikte büyür.`,
      `Planına sadık kalmak alışkanlık kazandırır; bu hafta her gün en az bir hedefini tamamla.`,
      `Küçük adımlar büyük başarıları getirir. Bu hafta senin haftan! 💪`,
    ];
  }

  const rangeLabel = `${formatDdMmYyyyDots(review.weekStart)} – ${formatDdMmYyyyDots(review.weekEnd)}`;
  const { taskTotal, taskCompleted, taskPartial, taskMissed, activeDays, completionRate } = review;
  const messages: string[] = [];

  if (completionRate >= 0.85) {
    messages.push(
      `${rangeLabel} haftasında planının büyük kısmını tamamladın (${taskCompleted}/${taskTotal} görev) — harika bir disiplin gösterdin!`
    );
    messages.push(
      `Bu ivmeyi koru, ${firstName}. Zorlandığın anlarda bile devam etmiş olman en güçlü tarafın; şimdi biraz daha zorlayıcı hedefler tam senlik!`
    );
  } else if (completionRate >= 0.55) {
    messages.push(
      `${rangeLabel} haftasında ${taskCompleted} görevi bitirdin${taskPartial > 0 ? `, ${taskPartial} görevde ilerleme kaydettin` : ''}. İyi bir tempodaydın!`
    );
    messages.push(
      `Tamamlanmayan ${taskTotal - taskCompleted - taskPartial} blok için bu hafta telafi planı yapalım. Düzenli çalışmak mükemmellikten önce gelir — her gün aynı saatte masaya oturmak fark yaratır.`
    );
  } else if (completionRate >= 0.25) {
    messages.push(
      `Geçen hafta (${rangeLabel}) planın zorlayıcı olmuş olabilir${taskMissed > 0 ? ` — ${taskMissed} görev kaçırıldı` : ''}, ama vazgeçmek yok!`
    );
    messages.push(
      `Bu haftayı daha küçük, yapılabilir parçalara bölelim. Her tamamlanan görev özgüvenini artıracak — ${firstName}, sen bunu yapabilirsin!`
    );
  } else {
    messages.push(
      `Yeni hafta yeni bir başlangıç! Geçen haftaki ${taskTotal} planlanmış görevden ${taskCompleted} tanesini tamamladın; sıfırdan değil, kaldığın yerden devam ediyorsun.`
    );
    messages.push(
      `Bugün sadece bir görev bile tamamlasan bu hafta farklı biter. Küçük adımlar büyük başarıları getirir — hadi başlayalım! 💪`
    );
  }

  if (activeDays >= 4) {
    messages.push(
      `${activeDays} gün boyunca planına sadık kaldın — bu alışkanlık seni hedefe taşıyor. Bu hafta bir gün daha ekleyerek rekor kır!`
    );
  } else if (activeDays >= 2 && completionRate < 0.55) {
    messages.push(
      `${activeDays} günde çalıştın; bu hafta hedefimiz en az 4 gün düzenli çalışmak. Her gün 30 dakika bile büyük fark yaratır.`
    );
  }

  return messages.slice(0, 3);
}
