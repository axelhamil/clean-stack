import { type AppError, type IUnitOfWork, type IUseCase, Result, uuidv7 } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type {
  IStaffNoteStore,
  StaffNoteStoreError,
  StaffNoteSubject,
} from "../../ports/repositories/staff-note-store.port";
import type { AddStaffNoteInput } from "./add-staff-note.dto";

export type AddStaffNoteError =
  | StaffNoteStoreError
  | AppError<"ADMIN_USER_NOT_FOUND">
  | AppError<"ADMIN_ORG_NOT_FOUND">;

function subjectMissing(subject: StaffNoteSubject): AddStaffNoteError {
  return subject.type === "user"
    ? { code: "ADMIN_USER_NOT_FOUND", message: "This account no longer exists." }
    : { code: "ADMIN_ORG_NOT_FOUND", message: "This organization no longer exists." };
}

export class AddStaffNoteUseCase implements IUseCase<AddStaffNoteInput, void, AddStaffNoteError> {
  constructor(
    private readonly store: IStaffNoteStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  execute(input: AddStaffNoteInput): Promise<Result<void, AddStaffNoteError>> {
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
