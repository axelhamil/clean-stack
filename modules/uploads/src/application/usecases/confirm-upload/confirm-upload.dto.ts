export interface ConfirmUploadInput {
  ownerId: string;
  key: string;
  expectedSize: number;
  expectedContentType: string;
}

export interface ConfirmUploadOutput {
  key: string;
  size: number;
  contentType: string;
  publicUrl: string;
}
