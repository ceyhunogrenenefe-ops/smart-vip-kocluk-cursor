import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCrmTaskReminderText, isCrmTaskReminderWindow } from './crm-task-reminders.js';

test('isCrmTaskReminderWindow is true ~5 minutes before due', () => {
  const now = Date.parse('2026-09-14T10:00:00.000Z');
  assert.equal(isCrmTaskReminderWindow(new Date(now + 5 * 60 * 1000).toISOString(), now), true);
  assert.equal(isCrmTaskReminderWindow(new Date(now + 4 * 60 * 1000).toISOString(), now), true);
  assert.equal(isCrmTaskReminderWindow(new Date(now + 20 * 60 * 1000).toISOString(), now), false);
  assert.equal(isCrmTaskReminderWindow(new Date(now - 10 * 60 * 1000).toISOString(), now), false);
  assert.equal(isCrmTaskReminderWindow(new Date(now - 60 * 1000).toISOString(), now), true);
});

test('formatCrmTaskReminderText addresses the agent not the lead', () => {
  const text = formatCrmTaskReminderText({
    agentName: 'Muzaffer',
    title: 'Arama / Takip',
    leadName: 'Zeynep Kaya',
    leadPhone: '0532 411 22 33',
    dueAt: '2026-09-14T10:05:00.000Z',
    gradeLabel: 'YKS',
    panelUrl: 'https://www.dersonlinevipkocluk.com/crm?rt_lead=x'
  });
  assert.match(text, /Muzaffer/);
  assert.match(text, /5 dakika/);
  assert.match(text, /Zeynep Kaya/);
  assert.match(text, /YKS/);
  assert.doesNotMatch(text, /velimize/);
});
