import { MinioService } from './minio.service';

describe('MinioService', () => {
  const previous = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, {
      MINIO_ENDPOINT: 'https://storage.bcn.id.vn',
      MINIO_FORCE_PATH_STYLE: 'true',
      MINIO_BUCKET: 'profiles',
      MINIO_ACCESS_KEY: 'test-key',
      MINIO_SECRET_KEY: 'test-secret',
      MINIO_IMAGE_MAX_BYTES: '100',
    });
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  it('signs PUT and GET URLs with the exact public hostname, key, region and expiry', async () => {
    const service = new MinioService();
    const result = await service.createUploadSignature({
      timestamp: 123,
      folder: 'user-avatars/user-1',
      includeMaxBytes: true,
    });
    expect(result.method).toBe('PUT');
    expect(result.maxBytes).toBe(100);
    expect(result.publicId).toMatch(/^user-avatars\/user-1\/upload-/);
    for (const value of [result.uploadUrl, result.downloadUrl]) {
      const url = new URL(value);
      expect(url.origin).toBe('https://storage.bcn.id.vn');
      expect(url.pathname).toBe(`/profiles/${result.publicId}`);
      expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(url.searchParams.get('X-Amz-Credential')).toContain(
        '/us-east-1/s3/aws4_request',
      );
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    }
    expect(result.uploadUrl).not.toBe(result.downloadUrl);
    expect(JSON.stringify(result)).not.toContain('test-secret');
    expect(JSON.stringify(result)).not.toContain('http://minio');
  });

  it('createPostSignature pins key, size range, content type and disposition in the policy', async () => {
    const service = new MinioService();
    const result = await service.createPostSignature({
      folder: 'project-submissions/course-1/user-1',
      publicId: 'report.pdf',
    });
    expect(result.method).toBe('POST');
    expect(result.maxBytes).toBe(20 * 1024 * 1024);
    expect(result.publicId).toMatch(
      /^project-submissions\/course-1\/user-1\/report\.pdf-/,
    );
    const url = new URL(result.postUrl);
    expect(url.origin).toBe('https://storage.bcn.id.vn');
    expect(url.pathname).toBe('/profiles');
    const policy = JSON.parse(
      Buffer.from(result.fields.policy, 'base64').toString('utf8'),
    ) as { expiration: string; conditions: unknown[] };
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', 1, 20 * 1024 * 1024],
        ['eq', '$Content-Type', 'application/octet-stream'],
        ['eq', '$Content-Disposition', 'attachment'],
        ['eq', '$key', result.publicId],
      ]),
    );
    expect(result.fields['Content-Type']).toBe('application/octet-stream');
    expect(result.fields['Content-Disposition']).toBe('attachment');
    expect(result.fields.key).toBe(result.publicId);
    expect(JSON.stringify(result)).not.toContain('test-secret');
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('createPostSignature also returns a short-lived signed GET so the stored object can be read back', async () => {
    const service = new MinioService();
    const result = await service.createPostSignature({
      folder: 'project-submissions/course-1/user-1',
    });
    const url = new URL(result.downloadUrl);
    expect(url.origin).toBe('https://storage.bcn.id.vn');
    expect(url.pathname).toBe(`/profiles/${result.publicId}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('browser CORS rule allows POST so the multipart upload is not blocked in production', async () => {
    const service = new MinioService();
    const spy = jest.fn().mockResolvedValue(undefined);
    const client = (service as unknown as { client: Record<string, unknown> })
      .client;
    client.makeRequestAsyncOmit = spy;
    await (
      service as unknown as { ensureBrowserCors: (c: unknown) => Promise<void> }
    ).ensureBrowserCors(client);
    const body = String(spy.mock.calls[0][1]);
    for (const method of ['GET', 'HEAD', 'PUT', 'POST'])
      expect(body).toContain(`<AllowedMethod>${method}</AllowedMethod>`);
  });

  it('rejects lookalike hosts, another bucket, mismatched keys and path traversal', () => {
    const service = new MinioService();
    expect(() =>
      service.assertObjectUrl('https://evilstorage.bcn.id.vn/profiles/a', 'a'),
    ).toThrow('Object URL does not match');
    expect(() =>
      service.assertObjectUrl('https://storage.bcn.id.vn/quizzes/a', 'a'),
    ).toThrow('Object URL does not match');
    expect(() =>
      service.assertObjectUrl('https://storage.bcn.id.vn/profiles/b', 'a'),
    ).toThrow('Object URL does not match');
    expect(() => service.objectUrl('../other')).toThrow('Invalid object key');
    expect(() =>
      service.assertObjectUrl(service.objectUrl('folder/a'), 'folder/a'),
    ).not.toThrow();
  });

  it('checks file uploads against the server object size, allowing non-image types', async () => {
    const service = new MinioService();
    const client = (service as unknown as { client: { statObject: jest.Mock } })
      .client;
    client.statObject = jest.fn().mockResolvedValue({
      size: 20,
      metaData: { 'content-type': 'application/pdf' },
    });
    await expect(
      service.assertObjectWithinMaxBytes('projects/file', 20),
    ).resolves.toBeUndefined();
    await expect(
      service.assertObjectWithinMaxBytes('projects/file', 19),
    ).rejects.toThrow('File exceeds');
  });

  it('checks actual object size and content type before accepting an image', async () => {
    const service = new MinioService();
    const client = (service as unknown as { client: { statObject: jest.Mock } })
      .client;
    client.statObject = jest.fn().mockResolvedValue({
      size: 99,
      metaData: { 'content-type': 'image/webp' },
    });
    await expect(
      service.assertImageWithinMaxBytes('folder/a'),
    ).resolves.toBeUndefined();
    client.statObject.mockResolvedValue({
      size: 101,
      metaData: { 'content-type': 'image/webp' },
    });
    await expect(service.assertImageWithinMaxBytes('folder/a')).rejects.toThrow(
      'Image exceeds',
    );
    client.statObject.mockResolvedValue({
      size: 99,
      metaData: { 'content-type': 'text/html' },
    });
    await expect(service.assertImageWithinMaxBytes('folder/a')).rejects.toThrow(
      'invalid content type',
    );
    client.statObject.mockRejectedValue(new Error('not found'));
    await expect(service.assertImageWithinMaxBytes('folder/a')).rejects.toThrow(
      'Unable to verify',
    );
  });
});
