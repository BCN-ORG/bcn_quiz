const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/$/, '');

type Envelope<T> = { data?: T; message?: string | string[] };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string | null,
  ) {
    super(message);
  }
}

export type UploadStage = 'signature' | 'storage' | 'confirm';

export class UploadStageError extends Error {
  constructor(
    readonly stage: UploadStage,
    message: string,
    readonly details: {
      status?: number;
      code?: string;
      requestId?: string | null;
      fileSize?: number;
      mime?: string;
    } = {},
  ) {
    super(message);
  }
}

let refreshPromise: Promise<boolean> | null = null;

// Offset to the server clock taken from the Date response header (1 s resolution, display only).
let serverOffsetMs = 0;
export const serverNow = () => Date.now() + serverOffsetMs;
const MAX_CLOCK_OFFSET_MS = 24 * 3600_000;
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
function noteServerTime(response: Response) {
  // Only a well-formed HTTP-date counts: Date.parse('1') would otherwise read as the year 2001.
  const raw = response.headers.get('date');
  if (!raw || !HTTP_DATE.test(raw)) return;
  const parsed = Date.parse(raw);
  // A well-formed but wildly wrong date (broken or hostile proxy) must not hijack every countdown.
  if (!Number.isNaN(parsed) && Math.abs(parsed - Date.now()) <= MAX_CLOCK_OFFSET_MS) serverOffsetMs = parsed - Date.now();
}

// The access cookie lives 15 minutes, the refresh cookie 30 days. Profiles rotates the refresh token on every use and
// revokes the whole app session if an old one is replayed, so two refreshes must never run with the same cookie:
// one lock for every tab, plus a marker so a tab that waited behind the lock does not rotate a second time.
const REFRESH_LOCK = 'bcn-quiz-refresh';
const REFRESHED_AT = 'quiz:auth:refreshedAt';
// Not retried: the refresh call itself and logout (a 401 there is final).
const NO_REFRESH_RETRY = new Set(['/auth/refresh', '/auth/logout']);

function lastRefreshedAt(): number {
  try { return Number(localStorage.getItem(REFRESHED_AT)) || 0; } catch { return 0; }
}

function markRefreshed() {
  try { localStorage.setItem(REFRESHED_AT, String(Date.now())); } catch { /* private mode: the lock alone still serialises */ }
}

async function callRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (response.ok) markRefreshed();
    return response.ok;
  } catch {
    return false;
  }
}

async function refresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const run = async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.locks) return callRefresh();
    const asked = Date.now();
    const result = await navigator.locks.request(REFRESH_LOCK, async () => {
      // Another tab finished a refresh after we asked: the shared cookie is already new, rotating again would only add risk.
      if (lastRefreshedAt() >= asked) return true;
      return callRefresh();
    });
    return result === true;
  };
  refreshPromise = run().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) throw new TypeError('Mất kết nối mạng. Kiểm tra kết nối rồi thử lại.');
    throw error;
  }
  noteServerTime(response);
  const body = (await response.json().catch(() => null)) as Envelope<T> | T | null;

  if (response.status === 401 && !retried && !NO_REFRESH_RETRY.has(path)) {
    if (await refresh()) return api<T>(path, init, true);
  }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
    const friendly = response.status === 429
      ? 'Bạn thao tác quá nhanh. Hãy chờ vài giây rồi thử lại.'
      : response.status >= 502 && response.status <= 504
        ? 'Máy chủ đang bận. Hãy thử lại sau ít phút.'
        : undefined;
    throw new ApiError(
      friendly ?? (Array.isArray(message) ? message.join(', ') : message || 'Không thể xử lý yêu cầu'),
      response.status,
      response.headers.get('x-request-id'),
    );
  }
  if (body && typeof body === 'object' && 'data' in body) return (body as Envelope<T>).data as T;
  return body as T;
}

export const request = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
};

export const apiUrl = (path = '') => `${API_URL}${path}`;

export async function downloadFile(path: string, filename: string): Promise<void> {
  let response = await fetch(apiUrl(path), { credentials: 'include' });
  if (response.status === 401 && await refresh()) response = await fetch(apiUrl(path), { credentials: 'include' });
  if (!response.ok) throw new ApiError('Không thể tải file', response.status, response.headers.get('x-request-id'));
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function uploadFile(signaturePath: string, file: File) {
  const signed = await createUploadSignature(signaturePath, file);
  if (file.size > signed.maxBytes) throw new Error('File vượt quá dung lượng cho phép');
  await putSignedFile(signed.uploadUrl, file, file.type || 'application/octet-stream');
  return signed;
}

type PostSignature = { method: 'POST'; postUrl: string; fields: Record<string, string>; secureUrl: string; publicId: string; maxBytes: number };

export async function uploadFileWithProgress(
  signaturePath: string,
  file: File,
  options: { onProgress?: (loadedBytes: number) => void; signal?: AbortSignal } = {},
) {
  // A presigned POST: the storage server enforces size, type and key (a presigned PUT could not limit size).
  const signed = await createUploadSignature<PostSignature>(signaturePath, file, { method: 'POST' });
  if (file.size > signed.maxBytes) throw new Error('File vượt quá dung lượng cho phép');
  const form = new FormData();
  for (const [name, value] of Object.entries(signed.fields)) form.append(name, value);
  form.append('file', file); // must be the last part
  await xhrPost(signed.postUrl, form, file, options);
  return signed;
}

function xhrPost(
  url: string,
  body: FormData,
  file: File,
  { onProgress, signal }: { onProgress?: (loadedBytes: number) => void; signal?: AbortSignal },
) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    const details = { fileSize: file.size, mime: file.type };
    xhr.open('POST', url);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
      reject(new UploadStageError('storage', `Unable to upload file to storage. (${xhr.status})`, {
        ...details,
        status: xhr.status,
        code: xhr.responseText.match(/<Code>([^<]+)<\/Code>/)?.[1],
      }));
    };
    xhr.onerror = () => reject(new UploadStageError('storage', 'Network error while uploading file.', details));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export async function uploadImageFile(signaturePath: string, file: File) {
  validateImageType(file);
  const signed = await createUploadSignature(signaturePath, file);
  validateFileSize(file, signed.maxBytes);
  await putSignedFile(signed.uploadUrl, file, file.type);
  return signed;
}

export function markConfirmUploadError(error: unknown, file?: File): never {
  if (error instanceof UploadStageError) throw error;
  if (error instanceof ApiError) {
    throw new UploadStageError('confirm', `Image uploaded, but saving it failed. ${error.message}`, {
      status: error.status,
      requestId: error.requestId,
      fileSize: file?.size,
      mime: file?.type,
    });
  }
  throw new UploadStageError(
    'confirm',
    error instanceof Error ? `Image uploaded, but saving it failed. ${error.message}` : 'Image uploaded, but saving it failed.',
    { fileSize: file?.size, mime: file?.type },
  );
}

export function logUploadStageError(error: unknown) {
  if (!(error instanceof UploadStageError)) return;
  console.warn('upload_failed', {
    stage: error.stage,
    ...error.details,
  });
}

async function createUploadSignature<
  T = { uploadUrl: string; secureUrl: string; publicId: string; maxBytes: number },
>(signaturePath: string, file: File, body: object = {}) {
  try {
    return await request.post<T>(signaturePath, body);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new UploadStageError('signature', `Unable to prepare upload. ${error.message}`, {
        status: error.status,
        requestId: error.requestId,
        fileSize: file.size,
        mime: file.type,
      });
    }
    throw new UploadStageError('signature', 'Unable to prepare upload.', {
      fileSize: file.size,
      mime: file.type,
    });
  }
}

function validateImageType(file: File) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!file.type) throw new Error('Unsupported image format. Please use JPEG, PNG or WebP.');
  if (!allowed.has(file.type)) {
    throw new Error(
      file.type === 'image/heic' || file.type === 'image/heif'
        ? 'HEIC/HEIF is not currently supported. Please use JPEG, PNG or WebP.'
        : 'Unsupported image format. Please use JPEG, PNG or WebP.',
    );
  }
}

function validateFileSize(file: File, maxBytes: number) {
  if (file.size < 1 || file.size > maxBytes) throw new Error('File vượt quá dung lượng cho phép');
}

async function putSignedFile(uploadUrl: string, file: File, contentType: string) {
  const uploaded = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!uploaded.ok) {
    const storage = await readStorageError(uploaded);
    throw new UploadStageError('storage', `Unable to upload file to storage. (${uploaded.status})`, {
      status: uploaded.status,
      code: storage.code,
      requestId: storage.requestId,
      fileSize: file.size,
      mime: contentType,
    });
  }
}

async function readStorageError(response: Response) {
  const text = await response.text().catch(() => '');
  return {
    code: text.match(/<Code>([^<]+)<\/Code>/)?.[1],
    requestId:
      text.match(/<RequestId>([^<]+)<\/RequestId>/)?.[1] ||
      response.headers.get('x-amz-request-id') ||
      response.headers.get('x-request-id'),
  };
}
