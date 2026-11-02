import type { AppError, Option, Result } from "@packages/ddd-kit";

export type StaffNoteStoreError = AppError<"ADMIN_NOTE_PROVIDER_FAILURE">;

export type StaffNoteSubject = { type: "user" | "org"; id: string };

export interface StaffNoteRow {
  id: string;
  authorName: Option<string>;
  body: string;
  createdAt: Date;
}

export interface NewStaffNote {
  id: string;
  subject: StaffNoteSubject;
  authorId: string;
  body: string;
}

export interface IStaffNoteStore {
  list(
    subject: StaffNoteSubject,
    limit: number,
  ): Promise<Result<StaffNoteRow[], StaffNoteStoreError>>;
  lockSubject(subject: StaffNoteSubject): Promise<Result<boolean, StaffNoteStoreError>>;
  insert(note: NewStaffNote): Promise<Result<void, StaffNoteStoreError>>;
}
