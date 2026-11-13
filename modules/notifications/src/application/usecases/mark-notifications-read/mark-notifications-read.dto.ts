import type { AppError } from "@packages/ddd-kit";
import type { NotificationError } from "../../ports/repositories/notification.port";

export interface MarkNotificationsReadInput {
  userId: string;
  ids: string[];
}

export type MarkNotificationsReadError = NotificationError | AppError<"NOTIFICATION_NOT_FOUND">;
