import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";
import type { NoteSubject } from "../queries/notes";

const $addToUser = api.admin.users[":id"].notes.$post;
const $addToOrg = api.admin.orgs[":id"].notes.$post;

export const addNoteMutationOptions = mutationOptions({
  mutationKey: ["admin", "notes", "add"] as const,
  mutationFn: async ({ subject, body }: { subject: NoteSubject; body: string }) => {
    const add = subject.type === "user" ? $addToUser : $addToOrg;
    const res = await add({ param: { id: subject.id }, json: { body } });
    if (!res.ok) await throwApiError(res, "addStaffNote");
  },
});
