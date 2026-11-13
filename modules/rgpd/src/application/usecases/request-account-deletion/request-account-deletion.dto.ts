export interface RequestAccountDeletionInput {
  userId: string;
  totpCode?: string;
  password?: string;
}

export interface RequestAccountDeletionOutput {
  pendingDeletionUntil: string;
}
