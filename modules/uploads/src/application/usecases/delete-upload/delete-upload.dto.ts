export type DeleteUploadInput = { ownerId: string } & ({ key: string } | { url: string });

export interface DeleteUploadOutput {
  deleted: boolean;
}
