import type { Option } from "@packages/ddd-kit";
import type { DueNotification } from "../ports/repositories/notification-digest.port";

export type PendingRow = Omit<DueNotification, "emailStillWanted">;

export type DigestGroup = {
  userId: string;
  email: string;
  category: string;
  locale: Option<string>;
  notificationIds: string[];
  items: { eventType: string; payload: unknown }[];
};

export function buildDigests(rows: PendingRow[]): DigestGroup[] {
  const map = new Map<string, DigestGroup>();
  for (const row of rows) {
    const key = `${row.userId}:${row.category}`;
    const group = map.get(key);
    if (group) {
      group.notificationIds.push(row.id);
      group.items.push({ eventType: row.eventType, payload: row.payload });
    } else {
      map.set(key, {
        userId: row.userId,
        email: row.email,
        category: row.category,
        locale: row.locale,
        notificationIds: [row.id],
        items: [{ eventType: row.eventType, payload: row.payload }],
      });
    }
  }
  return [...map.values()];
}

export async function digestIdempotencyKey(ids: string[]): Promise<string> {
  const raw = ids.slice().sort().join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
