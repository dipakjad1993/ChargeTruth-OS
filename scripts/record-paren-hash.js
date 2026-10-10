/* record-paren-hash: store Paren/JDP quarterly PDF hash for VERIFICATION.md audit trail.
   Usage: node scripts/record-paren-hash.js --report "Paren Q3 2026" --pdf ./paren-q3-2026.pdf
   Computes SHA-256 of the PDF + writes entry to data/ingest-manifest.json {report, sha256, recordedAt}.
   Paste the sha into docs/VERIFICATION.md. No network. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
if (!args.pdf || !args.report) {
  console.log('Usage: node scripts/record-paren-hash.js --report "Paren Q3 2026" --pdf ./paren-q3-2026.pdf');
  process.exit(1);
}
const buf = readFileSync(args.pdf);
const sha = createHash('sha256').update(buf).digest('hex');
const mp = 'data/ingest-manifest.json';
const man = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : { runs: [] };
man.runs.push({ script: 'record-paren-hash', report: args.report, sha256: sha, bytes: buf.length, recordedAt: new Date().toISOString() });
man.runs = man.runs.slice(-20);
writeFileSync(mp, JSON.stringify(man, null, 1));
console.log(`${args.report}: sha256 ${sha} (${buf.length}B) → ${mp}`);
