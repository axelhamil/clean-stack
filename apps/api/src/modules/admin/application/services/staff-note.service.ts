import { type AppError, type IUnitOfWork, Result, uuidv7 } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type {
  IStaffNoteStore,
  StaffNoteRow,
  StaffNoteStoreError,
  StaffNoteSubject,
} from "../ports/staff-note-store.port";

export const STAFF_NOTES_PAGE = 100;

export type AddStaffNoteError =
  | StaffNoteStoreError
  | AppError<"ADMIN_USER_NOT_FOUND">
  | AppError<"ADMIN_ORG_NOT_FOUND">;

function subjectMissing(subject: StaffNoteSubject): AddStaffNoteError {
  return subject.type === "user"
    ? { code: "ADMIN_USER_NOT_FOUND", message: "This account no longer exists." }
    : { code: "ADMIN_ORG_NOT_FOUND", message: "This organization no longer exists." };
}

export class StaffNoteService {
  constructor(
    private readonly store: IStaffNoteStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  list(subject: StaffNoteSubject): Promise<Result<StaffNoteRow[], StaffNoteStoreError>> {
    return this.store.list(subject, STAFF_NOTES_PAGE);
  }

  async add(input: {
    actorUserId: string;
    subject: StaffNoteSubject;
    body: string;
  }): Promise<Result<void, AddStaffNoteError>> {
    const { actorUserId, subject, body } = input;

    return this.uow.run(async (): Promise<Result<void, AddStaffNoteError>> => {
      const locked = await this.store.lockSubject(subject);
      if (locked.isFailure) return Result.fail(locked.getError());
      if (!locked.getValue()) return Result.fail(subjectMissing(subject));

      const noteId = uuidv7();
      const written = await this.store.insert({ id: noteId, subject, authorId: actorUserId, body });
      if (written.isFailure) return Result.fail(written.getError());

      await emitEvent(this.outbox, EventTypes.ADMIN_NOTE_ADDED, "staff_note", noteId, {
        actorUserId,
        noteId,
        subjectType: subject.type,
        subjectId: subject.id,
      });

      return Result.ok();
    });
  }
}
