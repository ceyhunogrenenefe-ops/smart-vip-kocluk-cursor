/**
 * Profil düzenleme erişimi — canEditProfile kuralları
 * node --test api/_lib/teacher-profile-edit-access.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canEditProfile } from './teacher-profile-edit-access.js';

describe('canEditProfile — always open except passive/deleted', () => {
  it('allows published / update_pending / pending_approval / rejected / draft even if editing_enabled false', () => {
    for (const status of [
      'published',
      'update_pending',
      'pending_approval',
      'rejected',
      'draft',
      'incomplete',
      'changes_pending'
    ]) {
      assert.equal(
        canEditProfile({ status, editing_enabled: false, deleted_at: null }),
        true,
        `expected editable for ${status}`
      );
    }
  });

  it('blocks passive and deleted', () => {
    assert.equal(canEditProfile({ status: 'passive' }), false);
    assert.equal(canEditProfile({ status: 'deleted' }), false);
    assert.equal(canEditProfile({ status: 'published', deleted_at: '2026-01-01' }), false);
    assert.equal(canEditProfile(null), false);
  });
});

describe('approval-before-publish invariants', () => {
  it('working/pending differs from published_snapshot until approve', () => {
    const profile = {
      status: 'update_pending',
      published_snapshot: { display_name: 'Eski Onaylı' },
      pending_data: { display_name: 'Yeni Taslak' },
      editing_enabled: true
    };
    assert.equal(canEditProfile(profile), true);
    assert.notEqual(profile.published_snapshot.display_name, profile.pending_data.display_name);
  });
});

describe('role surface matrix (permissions)', () => {
  const EDIT_ROLES = new Set(['teacher', 'coach']);
  const APPROVE_ROLES = new Set(['admin', 'super_admin']);

  it('teacher and coach can open Profilimi Düzenle; admin approves', () => {
    for (const r of ['teacher', 'coach']) assert.equal(EDIT_ROLES.has(r), true);
    for (const r of ['admin', 'super_admin']) {
      assert.equal(EDIT_ROLES.has(r), false);
      assert.equal(APPROVE_ROLES.has(r), true);
    }
  });
});
