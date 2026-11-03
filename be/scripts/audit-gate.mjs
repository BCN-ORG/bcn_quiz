// Fails on any high/critical production advisory that is not in ACCEPTED.
// An advisory is accepted only with a reason and a review trigger; delete the entry once it is fixed.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ACCEPTED = new Map([
  // minio@8.0.7 (latest) pins query-string@7 -> decode-uri-component@0.2.2. Forcing 0.5.x breaks query-string
  // (ESM-only default export). Reached only through minio's own query building. Review when minio releases.
  ['GHSA-vcc3-ghjq-m6fr', 'decode-uri-component via minio/query-string'],
  ['GHSA-qr28-fpjm-wq7f', 'decode-uri-component via minio/query-string'],
]);

export function blockingAdvisories(report, accepted = ACCEPTED) {
  const found = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via === 'string' || !['high', 'critical'].includes(via.severity)) continue;
      const id = String(via.url ?? '').split('/').pop();
      if (!accepted.has(id)) found.set(id, `${via.severity} ${vulnerability.name}: ${via.title}`);
    }
  }
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let raw;
  try {
    raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    raw = error.stdout; // npm audit exits non-zero when it finds anything
  }
  const blocking = blockingAdvisories(JSON.parse(raw));
  if (blocking.size) {
    for (const [id, text] of blocking) console.error(`BLOCKING ${id} ${text}`);
    process.exit(1);
  }
  console.log(`No new high/critical advisories (accepted: ${[...ACCEPTED.keys()].join(', ')})`);
}
