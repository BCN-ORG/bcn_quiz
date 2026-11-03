import test from 'node:test';
import assert from 'node:assert/strict';
import { blockingAdvisories } from './audit-gate.mjs';

const report = (...via) => ({ vulnerabilities: { pkg: { name: 'pkg', via } } });
const adv = (id, severity) => ({ url: `https://github.com/advisories/${id}`, severity, title: 't' });

test('accepted advisories do not block', () => {
  assert.equal(blockingAdvisories(report(adv('GHSA-a', 'high')), new Map([['GHSA-a', 'x']])).size, 0);
});
test('a new high advisory blocks', () => {
  assert.deepEqual([...blockingAdvisories(report(adv('GHSA-b', 'high')), new Map()).keys()], ['GHSA-b']);
});
test('critical blocks, moderate and package-name references do not', () => {
  assert.equal(blockingAdvisories(report(adv('GHSA-c', 'critical'), adv('GHSA-d', 'moderate'), 'other-pkg'), new Map()).size, 1);
});
