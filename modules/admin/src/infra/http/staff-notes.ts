import { AppErrorException } from "@packages/ddd-kit";
import type { StaffNoteSubject } from "../../application/ports/repositories/staff-note-store.port";
import type { IListStaffNotesQuery } from "../../application/queries/list-staff-notes.query";
import type { AddStaffNoteInput } from "../../application/usecases/add-staff-note/add-staff-note.dto";
import type { AddStaffNoteUseCase } from "../../application/usecases/add-staff-note/add-staff-note.usecase";
import { serializeStaffNote } from "./staff-note.presenter";

export async function listedStaffNotes(query: IListStaffNotesQuery, subject: StaffNoteSubject) {
  const result = await query.execute(subject);
  if (result.isFailure) throw new AppErrorException(result.getError());

  return { items: result.getValue().map(serializeStaffNote) };
}

export async function addedStaffNote(
  useCase: Pick<AddStaffNoteUseCase, "execute">,
  input: AddStaffNoteInput,
): Promise<{ ok: true }> {
  const result = await useCase.execute(input);
  if (result.isFailure) throw new AppErrorException(result.getError());

  return { ok: true };
}
