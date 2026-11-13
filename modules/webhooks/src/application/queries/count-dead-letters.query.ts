import type { IQuery } from "@packages/ddd-kit";
import type { WebhookRepoError } from "../ports/repositories/webhook-endpoint.port";

export type ICountDeadLettersQuery = IQuery<void, number, WebhookRepoError>;
