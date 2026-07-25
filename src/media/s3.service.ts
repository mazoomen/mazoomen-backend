import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
  private readonly s3Client?: S3Client;
  private readonly bucketName?: string;
  private readonly region: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.bucketName = this.configService.get<string>('AWS_BUCKET_NAME');

    if (accessKeyId && secretAccessKey && this.bucketName) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      this.logger.warn(
        'AWS S3 is not fully configured (missing AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, or AWS_BUCKET_NAME). S3 uploads and deletions will fail.',
      );
    }
  }

  async uploadFile(fileBuffer: Buffer, key: string, mimeType: string): Promise<string> {
    if (!this.s3Client) {
      throw new InternalServerErrorException('AWS S3 is not configured on this server.');
    }
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      });
      await this.s3Client.send(command);
      return this.getPublicUrl(key);
    } catch (error) {
      this.logger.error(`S3 upload error for key ${key}:`, error);
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  async deleteFile(key: string): Promise<void> {
    if (!this.s3Client) {
      throw new InternalServerErrorException('AWS S3 is not configured on this server.');
    }
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error(`S3 delete error for key ${key}:`, error);
      throw new InternalServerErrorException('Failed to delete file from S3');
    }
  }

  getPublicUrl(key: string): string {
    const cleanKey = key.replace(/^\/+/, '');
    const cloudFrontUrl =
      this.configService.get<string>('CLOUDFRONT_URL') ||
      process.env.CLOUDFRONT_URL;

    if (cloudFrontUrl) {
      const baseUrl = cloudFrontUrl.replace(/\/+$/, '');
      return `${baseUrl}/${cleanKey}`;
    }

    if (this.bucketName && this.region) {
      return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${cleanKey}`;
    }

    return `/${cleanKey}`;
  }

  extractKeyFromUrl(url: string): string | null {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.split('?')[0].trim();
    if (!cleanUrl) return null;

    let path = cleanUrl;

    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      try {
        const parsed = new URL(cleanUrl);
        path = parsed.pathname;
      } catch {
        return null;
      }
    }

    const cleanKey = path.replace(/^\/+/, '');
    if (!cleanKey) return null;

    const knownPrefixes = ['guest-moments/', 'invitations/', 'templates/', 'users/', 'media/', 'uploads/'];
    if (knownPrefixes.some((prefix) => cleanKey.startsWith(prefix))) {
      return cleanKey;
    }

    const cloudFrontUrl = this.configService.get<string>('CLOUDFRONT_URL') || process.env.CLOUDFRONT_URL;
    if (this.bucketName && cleanUrl.includes(`${this.bucketName}.s3.`)) {
      return cleanKey;
    }
    if (cloudFrontUrl && cleanUrl.includes(cloudFrontUrl.replace(/^https?:\/\//, ''))) {
      return cleanKey;
    }

    return null;
  }

  async deleteFileByUrl(url: string): Promise<boolean> {
    const key = this.extractKeyFromUrl(url);
    if (!key) {
      return false;
    }
    try {
      await this.deleteFile(key);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete file from S3 by URL (${url}, key: ${key}):`, error);
      return false;
    }
  }

  async deleteFilesByUrls(urls: string[]): Promise<void> {
    if (!urls || urls.length === 0) return;
    const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
    for (const url of uniqueUrls) {
      await this.deleteFileByUrl(url);
    }
  }
}

