import { type DbClient, sql } from "@packages/drizzle";

export const NOTIFICATION_NOTIFY_CHANNEL = "notification_changed";

/**
 * Installs the `pg_notify` rail the SSE hub listens on.
 *
 * Two triggers, one function. Birth (`INSERT`) and the read transition
 * (`UPDATE OF read_at`) both change what the unread badge should show, so both
 * must reach every open tab — a device that marks a notification read
 * elsewhere otherwise leaves the badge stale indefinitely, because polling is
 * disabled while the stream is up. They are separate triggers because a
 * combined `INSERT OR UPDATE` trigger cannot carry a `WHEN` clause referencing
 * `OLD`, and without that clause every no-op write would emit a signal.
 */
export async function ensureNotificationTrigger(client: DbClient): Promise<void> {
  await client.execute(sql`
    CREATE OR REPLACE FUNCTION notification_notify() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('notification_changed', NEW.user_id::text);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.execute(sql`
    CREATE OR REPLACE TRIGGER notification_notify_trigger
    AFTER INSERT ON notification
    FOR EACH ROW EXECUTE FUNCTION notification_notify()
  `);
  await client.execute(sql`
    CREATE OR REPLACE TRIGGER notification_read_notify_trigger
    AFTER UPDATE OF read_at ON notification
    FOR EACH ROW WHEN (OLD.read_at IS DISTINCT FROM NEW.read_at)
    EXECUTE FUNCTION notification_notify()
  `);
}
