import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Client } from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly bucket = process.env.MINIO_BUCKET || '';
  private readonly publicEndpoint = process.env.MINIO_ENDPOINT || '';
  private readonly client?: Client;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT;
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;
    if (
      !endpoint ||
      !this.publicEndpoint ||
      !this.bucket ||
      !accessKey ||
      !secretKey
    ) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MinIO configuration is required in production');
      }
      this.logger.warn('MinIO is not configured; upload is unavailable');
      return;
    }
    if (
      process.env.MINIO_FORCE_PATH_STYLE &&
      process.env.MINIO_FORCE_PATH_STYLE !== 'true'
    ) {
      throw new Error('MINIO_FORCE_PATH_STYLE must be true');
    }
    if (
      process.env.NODE_ENV === 'production' &&
      endpoint !== 'https://storage.bcn.id.vn'
    ) {
      throw new Error('Production MinIO must use https://storage.bcn.id.vn');
    }
    const create = (value: string) => {
      const url = new URL(value);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      ) {
        throw new Error(
          'MinIO endpoint must be an HTTP(S) origin without a path',
        );
      }
      return new Client({
        endPoint: url.hostname,
        port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
        useSSL: url.protocol === 'https:',
        accessKey,
        secretKey,
        region: process.env.MINIO_REGION || 'us-east-1',
        pathStyle: true,
      });
    };
    this.client = create(endpoint);
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) return;
    try {
      await this.ensureBucketReady();
    } catch (error) {
      this.logger.error(
        'MinIO bucket setup failed; upload may be unavailable',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async ensureBucketReady(): Promise<void> {
    const client = this.ensureConfigured();
    const exists = await client.bucketExists(this.bucket);
    if (!exists) {
      await client.makeBucket(
        this.bucket,
        process.env.MINIO_REGION || 'us-east-1',
      );
      this.logger.log(`Created MinIO bucket "${this.bucket}"`);
    }
    try {
      await this.ensurePublicReadPolicy(client);
    } catch (error) {
      this.logger.warn(
        `MinIO public-read policy skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      await this.ensureBrowserCors(client);
    } catch (error) {
      this.logger.warn(
        `MinIO CORS update skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Catalog images + requirement briefs are shown in the browser without signed GET. */
  private async ensurePublicReadPolicy(client: Client): Promise<void> {
    const folders = [
      process.env.MINIO_COURSE_IMAGE_FOLDER ?? 'course-images',
      process.env.MINIO_TOPIC_IMAGE_FOLDER ?? 'topic-images',
      process.env.MINIO_QUIZ_IMAGE_FOLDER ?? 'quiz-images',
      process.env.MINIO_PROJECT_REQUIREMENT_FOLDER ?? 'project-requirements',
    ]
      .map((folder) => folder.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: folders.map(
            (folder) => `arn:aws:s3:::${this.bucket}/${folder}/*`,
          ),
        },
      ],
    };
    await client.setBucketPolicy(this.bucket, JSON.stringify(policy));
    this.logger.log(
      `Applied MinIO public GetObject for ${folders.join(', ')} on bucket "${this.bucket}"`,
    );
  }

  private async ensureBrowserCors(client: Client): Promise<void> {
    const origins = new Set<string>([
      'https://quizzes.bcn.id.vn',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
    for (const origin of (process.env.CORS_ORIGINS ?? '').split(',')) {
      const value = origin.trim();
      if (value) origins.add(value);
    }
    const allowedOrigins = [...origins]
      .map(
        (origin) => `    <AllowedOrigin>${escapeXml(origin)}</AllowedOrigin>`,
      )
      .join('\n');
    const corsXml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
${allowedOrigins}
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;
    await (
      client as Client & {
        makeRequestAsyncOmit: (
          opts: Record<string, unknown>,
          body: string,
          statusCodes: number[],
          region: string,
        ) => Promise<unknown>;
      }
    ).makeRequestAsyncOmit(
      { method: 'PUT', bucketName: this.bucket, query: 'cors' },
      corsXml,
      [200],
      '',
    );
  }

  private ensureConfigured(): Client {
    if (!this.client)
      throw new InternalServerErrorException('MinIO is not configured');
    return this.client;
  }

  private validateKey(key: string): void {
    if (
      !key ||
      key.startsWith('/') ||
      key.split('/').some((part) => !part || part === '.' || part === '..') ||
      key.includes('\\') ||
      [...key].some((char) => char.charCodeAt(0) < 32)
    ) {
      throw new BadRequestException('Invalid object key');
    }
  }

  objectUrl(key: string): string {
    this.ensureConfigured();
    this.validateKey(key);
    return `${this.publicEndpoint.replace(/\/$/, '')}/${encodeURIComponent(this.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  assertObjectUrl(value: string, key: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('Invalid object URL');
    }
    if (url.href !== this.objectUrl(key)) {
      throw new BadRequestException(
        'Object URL does not match the configured MinIO bucket and object key',
      );
    }
  }

  getImageMaxBytes(): number {
    const size = Number(process.env.MINIO_IMAGE_MAX_BYTES);
    return Number.isFinite(size) && size > 0 ? Math.floor(size) : 3145728;
  }

  async createUploadSignature(params: {
    timestamp: number;
    folder: string;
    publicId?: string;
    format?: string;
    quality?: string;
    includeMaxBytes?: boolean;
  }) {
    this.ensureConfigured();
    // Unique keys prevent a new upload from overwriting an already approved asset.
    const publicId = `${params.folder}/${params.publicId || 'upload'}-${randomUUID()}`;
    this.validateKey(publicId);
    const maxBytes = params.includeMaxBytes
      ? this.getImageMaxBytes()
      : 20 * 1024 * 1024;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const uploadUrl = await this.ensureConfigured().presignedPutObject(
      this.bucket,
      publicId,
      300,
    );
    const downloadUrl = await this.createDownloadUrl(publicId);
    return {
      provider: 'minio',
      method: 'PUT',
      uploadUrl,
      downloadUrl,
      publicId,
      secureUrl: this.objectUrl(publicId),
      maxBytes,
      maxFileSizeMb: maxBytes / 1024 / 1024,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async createDownloadUrl(key: string): Promise<string> {
    const client = this.ensureConfigured();
    this.validateKey(key);
    return client.presignedGetObject(this.bucket, key, 300);
  }

  async assertObjectWithinMaxBytes(
    key: string,
    maxBytes: number,
    imageOnly = false,
  ): Promise<void> {
    const client = this.ensureConfigured();
    this.validateKey(key);
    let stat: Awaited<ReturnType<Client['statObject']>>;
    try {
      stat = await client.statObject(this.bucket, key);
    } catch {
      throw new BadRequestException(
        'Unable to verify uploaded object; please upload again',
      );
    }
    if (
      stat.size < 1 ||
      stat.size > maxBytes ||
      (imageOnly &&
        !String(stat.metaData['content-type'] || '').startsWith('image/'))
    ) {
      throw new BadRequestException(
        imageOnly
          ? 'Image exceeds the maximum size or has an invalid content type'
          : 'File exceeds the maximum size',
      );
    }
  }

  async assertImageWithinMaxBytes(key: string): Promise<void> {
    await this.assertObjectWithinMaxBytes(key, this.getImageMaxBytes(), true);
  }

  async uploadRawFile(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    folder: string,
    requestedId: string,
  ) {
    const client = this.ensureConfigured();
    if (!file?.buffer?.length || file.buffer.length > 20 * 1024 * 1024)
      throw new BadRequestException('Invalid file size');
    const publicId = `${folder}/${requestedId}-${randomUUID()}`;
    this.validateKey(publicId);
    await client.putObject(
      this.bucket,
      publicId,
      file.buffer,
      file.buffer.length,
      { 'Content-Type': file.mimetype || 'application/octet-stream' },
    );
    return {
      secureUrl: this.objectUrl(publicId),
      publicId,
      resourceType: 'raw',
      bytes: file.buffer.length,
      format: '',
    };
  }

  async deleteRawFile(key: string): Promise<void> {
    const client = this.ensureConfigured();
    this.validateKey(key);
    try {
      await client.removeObject(this.bucket, key);
    } catch {
      this.logger.warn('Unable to delete MinIO object');
    }
  }

  async deleteImage(key: string): Promise<void> {
    await this.deleteRawFile(key);
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
