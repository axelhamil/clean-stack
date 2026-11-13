import { Option } from "@packages/ddd-kit";
import { encodeTimeIdCursor } from "@packages/http/time-id-cursor";
import type { AdminPage } from "../../application/queries/list-users.query";

export function adminPageOf<T extends { cursorAt: string; id: string }>(
  items: T[],
  limit: number,
): AdminPage<T> {
  const last = items.at(-1);
  const isFull = items.length === limit && last !== undefined;
  const nextCursor = isFull
    ? Option.some(encodeTimeIdCursor(last.cursorAt, last.id))
    : Option.none<string>();

  return { items, nextCursor };
}
