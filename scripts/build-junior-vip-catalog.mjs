/**
 * Junior VIP ders/konu kataloğunu üretir.
 *
 * Kaynak: student-coaching-system/src/data/mockData.ts → `topicPool` (planlayıcı ve konu takibi ekranlarının
 * kullandığı havuz) + src/lib/studyTrackSubjects.ts → STUDY_TRACK_SUBJECTS.
 * Çıktı: api/_lib/junior-vip-topic-catalog.json (sunucu tarafında ders/konu eşleştirme için).
 *
 * Çalıştırma (repo kökünden):  node scripts/build-junior-vip-catalog.mjs
 * Konu havuzu değişince yeniden çalıştırın. `--check`: yalnız karşılaştırır, eskiyse 1 ile çıkar (testte kullanılır).
 */
import { build } from '../student-coaching-system/node_modules/esbuild/lib/main.js';
import { writeFileSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'student-coaching-system');

const entry = `
import { topicPool } from './src/data/mockData';
import { STUDY_TRACK_SUBJECTS } from './src/lib/studyTrackSubjects';
export { topicPool, STUDY_TRACK_SUBJECTS };
`;

const dir = mkdtempSync(join(tmpdir(), 'jv-catalog-'));
const outfile = join(dir, 'catalog.mjs');
try {
  await build({
    stdin: { contents: entry, resolveDir: app, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'error'
  });
  const mod = await import(pathToFileURL(outfile).href);
  const subjects = {};
  for (const [subject, levels] of Object.entries(mod.topicPool)) {
    const byLevel = {};
    for (const [level, topics] of Object.entries(levels || {})) {
      byLevel[level] = [...new Set((topics || []).map((t) => String(t).trim()).filter(Boolean))];
    }
    subjects[subject] = byLevel;
  }
  const out = {
    generated_from: 'student-coaching-system/src/data/mockData.ts#topicPool',
    study_track_subjects: [...mod.STUDY_TRACK_SUBJECTS],
    subjects
  };
  const target = join(root, 'api', '_lib', 'junior-vip-topic-catalog.json');
  const text = `${JSON.stringify(out)}\n`;
  if (process.argv.includes('--check')) {
    const cur = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (cur !== text) {
      console.error('[junior-vip-catalog] katalog eski — node scripts/build-junior-vip-catalog.mjs çalıştırın');
      process.exitCode = 1;
    } else console.log('[junior-vip-catalog] güncel');
  } else {
    writeFileSync(target, text);
    console.log(`[junior-vip-catalog] ${Object.keys(subjects).length} ders yazıldı → ${target}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
