import type { IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  IStaffNoteStore,
  StaffNoteRow,
  StaffNoteStoreError,
  StaffNoteSubject,
} from "../../application/ports/repositories/staff-note-store.port";
import type { IListStaffNotesQuery } from "../../application/queries/list-staff-notes.query";

export const STAFF_NOTES_PAGE = 100;

export class StaffNoteListQuery implements IListStaffNotesQuery {
  constructor(
    private readonly notes: IStaffNoteStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(subject: StaffNoteSubject): Promise<Result<StaffNoteRow[], StaffNoteStoreError>> {
    return this.instrumentation.startSpan({ name: "StaffNoteListQuery > execute" }, () =>
      this.notes.list(subject, STAFF_NOTES_PAGE),
    );
  }
}
