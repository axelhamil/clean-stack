import type { StaffNoteSubject } from "../../ports/repositories/staff-note-store.port";

export interface AddStaffNoteInput {
  actorUserId: string;
  subject: StaffNoteSubject;
  body: string;
}
