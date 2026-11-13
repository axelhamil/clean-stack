import type { IQuery } from "@packages/ddd-kit";
import type {
  StaffNoteRow,
  StaffNoteStoreError,
  StaffNoteSubject,
} from "../ports/repositories/staff-note-store.port";

export type IListStaffNotesQuery = IQuery<StaffNoteSubject, StaffNoteRow[], StaffNoteStoreError>;
