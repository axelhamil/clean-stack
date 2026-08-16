import { type DbClient, sql } from "@packages/drizzle";

export const NOTIFICATION_NOTIFY_CHANNEL = "notification_created";

export async function ensureNotificationTrigger(client: DbClient): Promise<void> {
  await client.execute(sql`
    CREATE OR REPLACE FUNCTION notification_notify() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('notification_created', NEW.user_id::text);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await client.execute(sql`
    CREATE OR REPLACE TRIGGER notification_notify_trigger
    AFTER INSERT ON notification
    FOR EACH ROW EXECUTE FUNCTION notification_notify()
  `);
}
