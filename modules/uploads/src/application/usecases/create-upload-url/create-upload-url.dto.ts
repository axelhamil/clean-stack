export interface CreateUploadUrlInput {
  ownerId: string;
  filename: string;
  contentType: string;
  size: number;
  scope: string;
  expiresInSeconds: number;
}

export interface CreateUploadUrlOutput {
  url: string;
  key: string;
  publicUrl: string;
  expiresAt: string;
  expectedSize: number;
  expectedContentType: string;
}
