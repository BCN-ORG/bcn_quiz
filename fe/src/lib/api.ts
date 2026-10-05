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

async function refresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as Envelope<T> | T | null;

  if (response.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, init, true);
  }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
    throw new ApiError(
      Array.isArray(message) ? message.join(', ') : message || 'Không thể xử lý yêu cầu',
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

export async function uploadFile(signaturePath: string, file: File) {
  const signed = await createUploadSignature(signaturePath, file);
  if (file.size > signed.maxBytes) throw new Error('File vượt quá dung lượng cho phép');
  await putSignedFile(signed.uploadUrl, file, file.type || 'application/octet-stream');
  return signed;
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

async function createUploadSignature(signaturePath: string, file: File) {
  try {
    return await request.post<{
      uploadUrl: string;
      secureUrl: string;
      publicId: string;
      maxBytes: number;
    }>(signaturePath, {});
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
