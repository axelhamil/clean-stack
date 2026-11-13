export interface ExecuteAccountWipeInput {
  userId: string;
}

export interface ExecuteAccountWipeOutput {
  deletedOrgIds: string[];
  storageKeysDeleted: number;
}
