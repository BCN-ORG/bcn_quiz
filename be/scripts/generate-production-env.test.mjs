import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture() {
  const namespace = JSON.parse(readFileSync('package.json')).name === 'bcn_profiles' ? 'profiles' : 'quizzes';
  const vars = {};
  for (const line of readFileSync('.env.example', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*?)(?:\s+# optional\b.*)?$/);
    if (!match || /\s+# optional\b.*$/.test(line)) continue;
    vars[match[1]] = match[2].replace(/^"|"$/g, '') || 'test-value';
  }
  Object.assign(vars, {
    DB_HOST: 'postgres',
    REDIS_HOST: 'redis',
    MINIO_ENDPOINT: 'https://storage.bcn.id.vn',
  });
  const secrets = { DB_PASSWORD: "p@ss:%/#$'\\ word", REDIS_PASSWORD: "'redis${NOT_SET}#\\ password", MINIO_ACCESS_KEY: 'app-key', MINIO_SECRET_KEY: 'app-secret', JWT_SECRET: 'access-secret', JWT_REFRESH_SECRET: 'refresh-secret' };
  return { vars, secrets, PROJECT_NAME: namespace === 'profiles' ? 'bcn_profiles' : 'bcn_quiz' };
}

function generate(root, config) {
  return spawnSync(process.execPath, ['scripts/generate-production-env.mjs', join(root, '.env')], { encoding: 'utf8', env: { ...process.env, PROJECT_NAME: config.PROJECT_NAME, IMAGE_NAME: 'example/app', FE_IMAGE_NAME: 'example/web', GITHUB_SHA: 'test-sha', PRODUCTION_VARS: JSON.stringify(config.vars), PRODUCTION_SECRETS: JSON.stringify(config.secrets) } });
}

test('production env survives Compose parsing and URL-encodes special passwords', () => {
  const root = mkdtempSync(join(tmpdir(), 'bcn-env-'));
  try {
    const config = fixture();
    const result = generate(root, config);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(join(root, '.env')).mode & 0o777, 0o600);
    copyFileSync('docker-compose.prod.yml', join(root, 'compose.yml'));
    const compose = spawnSync('docker', ['compose', '--env-file', join(root, '.env.compose'), '--project-directory', root, '-f', join(root, 'compose.yml'), 'config', '--format', 'json'], { encoding: 'utf8' });
    assert.equal(compose.status, 0, compose.stderr);
    const environment = JSON.parse(compose.stdout).services.app.environment;
    assert.equal(environment.REDIS_PASSWORD.replaceAll('$$', '$'), config.secrets.REDIS_PASSWORD);
    assert.equal(decodeURIComponent(new URL(environment.DATABASE_URL).password), config.secrets.DB_PASSWORD);
    assert.equal(environment.MINIO_SECRET_KEY, 'app-secret');
    const parsed = JSON.parse(compose.stdout);
    assert.deepEqual(Object.keys(parsed.services).sort(), ['app', 'web']);
    assert.equal(parsed.networks['bcn-infra'].external, true);
    assert.equal(parsed.services.app.ports[0].host_ip, '127.0.0.1');
    assert.equal(parsed.services.app.depends_on, undefined);
    assert.equal(environment.NODE_ENV, 'production');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing required key or application isolation violation fails before writing env', () => {
  const root = mkdtempSync(join(tmpdir(), 'bcn-env-'));
  try {
    for (const key of ['DB_PASSWORD', 'MINIO_SECRET_KEY', 'REDIS_PREFIX', 'MINIO_FORCE_PATH_STYLE']) {
      const config = fixture();
      delete config.vars[key]; delete config.secrets[key];
      assert.notEqual(generate(root, config).status, 0);
    }
    const internal = fixture(); internal.vars.MINIO_ENDPOINT = 'http://minio:9000';
    assert.notEqual(generate(root, internal).status, 0);
    const virtual = fixture(); virtual.vars.MINIO_FORCE_PATH_STYLE = 'false';
    assert.notEqual(generate(root, virtual).status, 0);
    const config = fixture(); config.vars.DB_USERNAME = 'bcn_admin';
    assert.notEqual(generate(root, config).status, 0);
    config.vars.DB_USERNAME = 'postgres';
    assert.notEqual(generate(root, config).status, 0);
    const source = readFileSync('scripts/generate-production-env.mjs', 'utf8');
    writeFileSync(join(root, 'generate.mjs'), source);
    writeFileSync(join(root, '.env.example'), readFileSync('.env.example', 'utf8') + '\nNEW_REQUIRED_KEY=\n');
    const extended = fixture();
    const result = spawnSync(process.execPath, ['generate.mjs', join(root, '.env')], { cwd: root, encoding: 'utf8', env: { ...process.env, PROJECT_NAME: extended.PROJECT_NAME, PRODUCTION_VARS: JSON.stringify(extended.vars), PRODUCTION_SECRETS: JSON.stringify(extended.secrets) } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /NEW_REQUIRED_KEY/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('new public web and SSO settings have safe production defaults', () => {
  const root = mkdtempSync(join(tmpdir(), 'bcn-env-'));
  try {
    const config = fixture();
    for (const key of ['FE_APP_PORT', 'FE_HOST_PORT', 'PROFILES_API_BASE_URL', 'BCN_OAUTH_ISSUER', 'BCN_OAUTH_CLIENT_ID', 'BCN_OAUTH_REDIRECT_URI', 'BCN_OAUTH_SUCCESS_REDIRECT_URL']) delete config.vars[key];
    const result = generate(root, config);
    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(join(root, '.env'), 'utf8');
    assert.match(output, /^FE_APP_PORT=3000$/m);
    assert.match(output, /^BCN_OAUTH_REDIRECT_URI=https:\/\/quizzes\.bcn\.id\.vn\/api\/auth\/callback$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
