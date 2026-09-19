import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const vars = JSON.parse(process.env.PRODUCTION_VARS || '{}');
const secrets = JSON.parse(process.env.PRODUCTION_SECRETS || '{}');
const values = {};
const optional = new Set();
for (const line of readFileSync('.env.example', 'utf8').split('\n')) {
  const match = line.match(
    /^([A-Z][A-Z0-9_]*)=(.*?)(?:\s+# optional\b.*)?$/,
  );
  if (!match) continue;
  const [, key, fallback] = match;
  if (/\s+# optional\b.*$/.test(line)) optional.add(key);
  values[key] =
    secrets[key] ||
    vars[key] ||
    (optional.has(key) ? fallback.replace(/^"|"$/g, '') : '');
}
for (const [key, value] of Object.entries(values)) {
  if (!optional.has(key) && !value)
    throw new Error(`Missing production configuration: ${key}`);
  if (/[\r\n\x00]/.test(value))
    throw new Error(`Invalid multiline configuration: ${key}`);
}
const namespace =
  process.env.PROJECT_NAME === 'bcn_profiles' ? 'profiles' : 'quizzes';
if (
  values.DB_HOST !== 'postgres' ||
  values.DB_PORT !== '5432' ||
  values.DB_DATABASE !== namespace ||
  values.DB_USERNAME !== `${namespace}_app` ||
  values.DB_SCHEMA !== 'public'
) {
  throw new Error(
    'PostgreSQL must use the shared host and the application database/user',
  );
}
if (
  values.REDIS_HOST !== 'redis' ||
  values.REDIS_PORT !== '6379' ||
  values.REDIS_PREFIX !== `${namespace}:`
)
  throw new Error('Invalid shared Redis host/port/prefix');
if (
  values.MINIO_ENDPOINT !== 'https://storage.bcn.id.vn' ||
  values.MINIO_FORCE_PATH_STYLE !== 'true' ||
  values.MINIO_BUCKET !== namespace
)
  throw new Error('Invalid shared MinIO endpoint/bucket');
const publicUrl = new URL(values.MINIO_ENDPOINT);
if (
  publicUrl.protocol !== 'https:' ||
  publicUrl.pathname !== '/' ||
  publicUrl.search ||
  publicUrl.hash ||
  publicUrl.username ||
  publicUrl.password
)
  throw new Error('MINIO_ENDPOINT must be an HTTPS origin');
for (const key of ['APP_PORT', 'HOST_PORT', 'FE_APP_PORT', 'FE_HOST_PORT']) {
  if (
    !/^\d+$/.test(values[key]) ||
    Number(values[key]) < 1 ||
    Number(values[key]) > 65535
  )
    throw new Error(`Invalid ${key}`);
}
if (
  values.BCN_OAUTH_REDIRECT_URI &&
  !values.BCN_OAUTH_REDIRECT_URI.includes('/api/auth/callback')
) {
  throw new Error('BCN_OAUTH_REDIRECT_URI must include /api/auth/callback');
}
if (values.JWT_SECRET && values.JWT_SECRET === values.JWT_REFRESH_SECRET)
  throw new Error('JWT secrets must be different');
const dbUrl = new URL(
  `postgresql://${values.DB_HOST}:${values.DB_PORT}/${values.DB_DATABASE}`,
);
dbUrl.username = encodeURIComponent(values.DB_USERNAME);
dbUrl.password = encodeURIComponent(values.DB_PASSWORD);
dbUrl.searchParams.set('schema', values.DB_SCHEMA);
Object.assign(values, {
  DATABASE_URL: dbUrl.href,
  REDIS_URL: '',
  PORT: values.APP_PORT,
  NODE_ENV: 'production',
  LOG_FILE_ENABLED: 'false',
  IMAGE_NAME: process.env.IMAGE_NAME,
  IMAGE_TAG: process.env.GITHUB_SHA,
  APP_VERSION: process.env.GITHUB_SHA,
  FE_IMAGE_NAME: process.env.FE_IMAGE_NAME,
  FE_IMAGE_TAG: process.env.GITHUB_SHA,
  FE_APP_PORT: values.FE_APP_PORT || '3000',
  FE_HOST_PORT: values.FE_HOST_PORT || '18088',
});
// Compose raw env_file values preserve secrets without interpolation or quoting.
const output = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
const target = process.argv[2];
if (!target)
  throw new Error(
    'Usage: node scripts/generate-production-env.mjs /path/to/.env',
  );
writeFileSync(`${target}.tmp`, output, { mode: 0o600 });
renameSync(`${target}.tmp`, target);
console.log('Production environment validated and generated');

// Keep interpolation config separate so Compose never parses secrets as dotenv syntax.
const composeValues = [
  'IMAGE_NAME',
  'IMAGE_TAG',
  'HOST_PORT',
  'APP_PORT',
  'FE_IMAGE_NAME',
  'FE_IMAGE_TAG',
  'FE_HOST_PORT',
  'FE_APP_PORT',
];
writeFileSync(
  `${target}.compose`,
  composeValues.map((key) => `${key}=${values[key]}`).join('\n') + '\n',
  { mode: 0o600 },
);
