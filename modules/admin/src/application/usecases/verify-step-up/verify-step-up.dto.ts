export interface VerifyStepUpInput {
  userId: string;
  sessionId: string;
  code: string;
  ip: string | null;
}

export interface VerifyStepUpOutput {
  validUntil: Date;
}
