import type { Option } from "@packages/ddd-kit";

export interface FanOutEventToEndpointsInput {
  eventId: string;
  eventType: string;
  organizationId: Option<string>;
  payload: unknown;
}
