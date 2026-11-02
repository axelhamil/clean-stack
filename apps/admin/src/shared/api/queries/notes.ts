import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $userNotes = api.admin.users[":id"].notes.$get;
const $orgNotes = api.admin.orgs[":id"].notes.$get;

export type NoteSubject = { type: "user" | "org"; id: string };

export const notesQueryOptions = ({ type, id }: NoteSubject) =>
  queryOptions({
    queryKey: ["admin", "notes", type, id] as const,
    queryFn: async ({ signal }) => {
      const load = type === "user" ? $userNotes : $orgNotes;
      const res = await load({ param: { id } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadStaffNotes");

      return res.json();
    },
  });
