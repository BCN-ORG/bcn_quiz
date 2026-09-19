/** MinIO local (`http://127.0.0.1:9010/...`) and prod https URLs. */
export const OBJECT_STORAGE_URL_OPTIONS = {
  require_protocol: true,
  protocols: ['http', 'https'] as string[],
  require_tld: false,
};
