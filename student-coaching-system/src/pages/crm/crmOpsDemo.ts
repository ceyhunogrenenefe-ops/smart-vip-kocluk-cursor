import type { CrmOpsDashboard, CrmOpsTask, RegCoach } from '../../lib/registrationTrackingApi';

export const CRM_OPS_DEMO_COACHES: RegCoach[] = [
  { id: 'demo-muzaffer', name: 'Muzaffer Apaydın', email: 'muzaffer@onlinevipdershane.com', kind: 'crm_agent' },
  { id: 'demo-elif', name: 'Elif Yıldız', email: 'elif@onlinevipdershane.com', kind: 'crm_agent' },
  { id: 'demo-can', name: 'Can Demir', email: 'can@onlinevipdershane.com', kind: 'coach' }
];

export const CRM_OPS_DEMO_DASHBOARD: CrmOpsDashboard = {
  range: { from: '2026-09-08', to: '2026-09-14', preset: 'this_week' },
  contacts: 47,
  trial_lessons: 12,
  confirmed: 6,
  avg_first_response_ms: 252000,
  avg_first_response_label: '4 dk 12 sn',
  first_response_samples: 31,
  coaches: CRM_OPS_DEMO_COACHES,
  agents: [
    {
      id: 'demo-muzaffer',
      name: 'Muzaffer Apaydın',
      leads: 28,
      contacts: 22,
      trial_lessons: 7,
      confirmed: 4,
      response_ms: 198000,
      response_label: '3 dk 18 sn',
      conversion_rate: 14.3
    },
    {
      id: 'demo-elif',
      name: 'Elif Yıldız',
      leads: 19,
      contacts: 15,
      trial_lessons: 3,
      confirmed: 2,
      response_ms: 312000,
      response_label: '5 dk 12 sn',
      conversion_rate: 10.5
    },
    {
      id: 'demo-can',
      name: 'Can Demir',
      leads: 11,
      contacts: 10,
      trial_lessons: 2,
      confirmed: 0,
      response_ms: 480000,
      response_label: '8 dk',
      conversion_rate: 0
    }
  ],
  series: [
    { day: '2026-09-08', contacts: 6, confirmed: 1 },
    { day: '2026-09-09', contacts: 8, confirmed: 0 },
    { day: '2026-09-10', contacts: 7, confirmed: 2 },
    { day: '2026-09-11', contacts: 9, confirmed: 1 },
    { day: '2026-09-12', contacts: 10, confirmed: 1 },
    { day: '2026-09-13', contacts: 4, confirmed: 1 },
    { day: '2026-09-14', contacts: 3, confirmed: 0 }
  ],
  segments: [
    { id: 'all_tracking', label: 'Tüm takip lead’leri' },
    { id: 'trial_no_show', label: 'Deneme dersine gelmeyenler' },
    { id: 'offer_pending', label: 'Fiyat teklifi bekleyenler' }
  ]
};

export const CRM_OPS_DEMO_TASKS: CrmOpsTask[] = [
  {
    id: 'demo-task-1',
    lead_id: 'demo-lead-1',
    assigned_to: 'demo-muzaffer',
    title: '14:00 — Arama / Takip',
    description: 'Bu kişi aranacak. Deneme dersi sonrası fiyat soruldu.',
    task_type: 'call_parent',
    status: 'pending',
    due_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    lead_name: 'Zeynep Kaya',
    lead_phone: '0532 411 22 33',
    lead_stage: 'considering'
  },
  {
    id: 'demo-task-2',
    lead_id: 'demo-lead-2',
    assigned_to: 'demo-muzaffer',
    title: 'WhatsApp — deneme hatırlatması',
    description: 'LGS 8. sınıf deneme dersine gelmedi.',
    task_type: 'whatsapp',
    status: 'overdue',
    due_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    lead_name: 'Ahmet Yılmaz',
    lead_phone: '0541 800 12 12',
    lead_stage: 'trial_lesson_scheduled'
  },
  {
    id: 'demo-task-3',
    lead_id: 'demo-lead-3',
    assigned_to: 'demo-elif',
    title: 'Teklif gönderildi — takip',
    description: 'YKS paket fiyatı iletildi.',
    task_type: 'send_offer',
    status: 'completed',
    due_at: new Date(Date.now() - 86400000).toISOString(),
    completed_at: new Date(Date.now() - 3600000).toISOString(),
    lead_name: 'Selin Arslan',
    lead_phone: '0555 321 00 44',
    lead_stage: 'offer_sent'
  }
];

export const CRM_OPS_DEMO_SEGMENT = [
  { id: 'demo-lead-2', full_name: 'Ahmet Yılmaz', phone: '05418001212', stage: 'trial_lesson_scheduled' },
  { id: 'demo-lead-4', full_name: 'Merve Çetin', phone: '05339990011', stage: 'trial_lesson_scheduled' },
  { id: 'demo-lead-5', full_name: 'Burak Şahin', phone: '05071112233', stage: 'offer_sent' }
];
