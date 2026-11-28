import test from 'node:test';
import assert from 'node:assert/strict';
import {
  publicDriveStatus,
  putDriveChunk,
  queryResumeOffset,
  readDriveConfig,
  safeDriveError,
  startResumableUpload,
  verifyDriveFile
} from './ad-video-drive.js';
import { decideStoredResult } from './ad-video-logic.js';

test('eksik Drive ayarı hazır sayılmaz ve gizli anahtar dönmez', () => {
  const empty = readDriveConfig({});
  assert.equal(empty.ready, false);
  assert.deepEqual(empty.missing, [
    'AD_VIDEO_SHARED_DRIVE_ID',
    'AD_VIDEO_FOLDER_ID',
    'GOOGLE_SERVICE_ACCOUNT_JSON'
  ]);
  assert.equal(publicDriveStatus(empty).ready, false);
  const full = readDriveConfig({
    AD_VIDEO_SHARED_DRIVE_ID: 'drive',
    AD_VIDEO_FOLDER_ID: 'klasor',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'kurum@proje.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN-----\\nabc\\n-----END-----'
  });
  assert.equal(full.ready, true);
  assert.match(full.credentials.private_key, /\nabc\n/);
  assert.equal(JSON.stringify(publicDriveStatus(full)).includes('BEGIN'), false);
});

test('devam ettirilebilir oturum ve doğrulama olmadan teslim yok', async () => {
  const session = await startResumableUpload({
    token: 'gizli',
    name: 'ham.mp4',
    mime: 'video/mp4',
    size: 10,
    parentId: 'klasor',
    fetchImpl: async (_url, options) => {
      assert.match(options.headers.Authorization, /Bearer gizli/);
      assert.match(options.body, /klasor/);
      return {
        ok: true,
        headers: { get: (name) => (name === 'location' ? 'https://upload.example/session' : null) },
        text: async () => ''
      };
    }
  });
  assert.equal(session, 'https://upload.example/session');

  const offset = await queryResumeOffset('https://upload.example/session', 10, async () => ({
    status: 308,
    headers: { get: () => 'bytes=0-3' },
    text: async () => ''
  }));
  assert.equal(offset.offset, 4);

  const chunk = await putDriveChunk({
    sessionUrl: 'https://upload.example/session',
    start: 4,
    total: 10,
    buffer: Buffer.from('abcde'),
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers['Content-Range'], 'bytes 4-8/10');
      return { status: 308, text: async () => '' };
    }
  });
  assert.equal(chunk.ok, true);
  assert.equal(chunk.done, false);

  const missing = await verifyDriveFile({
    token: 'gizli',
    fileId: 'yok',
    fetchImpl: async () => ({ ok: false, status: 404, text: async () => 'ya29.gizli-anahtar yok' })
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.includes('ya29'), false);
  assert.equal(decideStoredResult(missing, 'drive').stored, false);
  assert.match(safeDriveError('ya29.abcdef private_key'), /\[token\]/);
});
