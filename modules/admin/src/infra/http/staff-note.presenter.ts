import type { StaffNoteRow } from "../../application/ports/repositories/staff-note-store.port";

export function serializeStaffNote(note: StaffNoteRow) {
  return {
    id: note.id,
    authorName: note.authorName.toNull(),
    body: note.body,
    createdAt: note.createdAt.toISOString(),
  };
}
