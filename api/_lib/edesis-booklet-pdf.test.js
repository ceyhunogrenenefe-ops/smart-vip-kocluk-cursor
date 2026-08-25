/**
 * node --test api/_lib/edesis-booklet-pdf.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fileDtoFromJson,
  listEdesisMvcFileBases,
  edesisTempFileDownloadUrls,
  collectDersGrupIdsFromStructureRows,
  collectEdesisBookletFiles,
  extractEdesisStructureRows
} from './edesis-client.js';

const API = 'https://onlinevipdershane.api.edesis.com';

describe('fileDtoFromJson', () => {
  it('unwraps ABP result FileDto', () => {
    const dto = fileDtoFromJson({
      success: true,
      result: { fileName: 'sorular.pdf', fileToken: 'tok-1', fileType: 'application/pdf' }
    });
    assert.equal(dto.fileToken, 'tok-1');
    assert.equal(dto.fileName, 'sorular.pdf');
  });

  it('reads nested fileDto', () => {
    const dto = fileDtoFromJson({ result: { fileDto: { FileToken: 'abc', FileName: 'a.pdf' } } });
    assert.equal(dto.fileToken, 'abc');
  });

  it('returns null without token', () => {
    assert.equal(fileDtoFromJson({ result: { fileName: 'x.pdf' } }), null);
  });
});

describe('edesisTempFileDownloadUrls', () => {
  it('uses API + tenant web FileController, not CDN', () => {
    const bases = listEdesisMvcFileBases({ baseUrl: API });
    assert.deepEqual(bases, [API, 'https://onlinevipdershane.edesis.com']);
    const urls = edesisTempFileDownloadUrls(
      { fileToken: 't1', fileName: 'kitapcik.pdf', fileType: 'application/pdf' },
      { baseUrl: API }
    );
    assert.ok(urls.some((u) => u.startsWith(`${API}/File/DownloadTempFile?`)));
    assert.ok(urls.some((u) => u.startsWith('https://onlinevipdershane.edesis.com/File/DownloadTempFile?')));
    assert.equal(urls.some((u) => /cdn\.edesis\.com/.test(u)), false);
  });
});

describe('collectDersGrupIdsFromStructureRows', () => {
  it('dedupes dersGrupId from structure', () => {
    const rows = extractEdesisStructureRows([
      { kitapcikTuru: 'A', lessonId: 1, dersGrupId: 10, lessonName: 'Türkçe', questionCount: 20 },
      { kitapcikTuru: 'A', lessonId: 2, dersGrupId: 10, lessonName: 'Matematik', questionCount: 20 },
      { kitapcikTuru: 'B', lessonId: 1, dersGrupId: 11, lessonName: 'Türkçe', questionCount: 20 }
    ]);
    assert.deepEqual(collectDersGrupIdsFromStructureRows(rows), [10, 11]);
  });
});

describe('collectEdesisBookletFiles fileToken', () => {
  it('keeps FileDto token when URL is empty', () => {
    const files = collectEdesisBookletFiles({
      fileName: 'sorular.pdf',
      fileToken: 'tok-pdf',
      fileType: 'application/pdf'
    });
    assert.equal(files.length, 1);
    assert.equal(files[0].fileToken, 'tok-pdf');
    assert.equal(files[0].url, 'file-token:tok-pdf');
  });
});
