import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $markRead = api.notifications.read.$post;
const $markAllRead = api.notifications["read-all"].$post;
const $updatePreference = api.notifications.preferences.$put;
const $updateOrgPreference = api.notifications["org-preferences"].$put;

type MarkReadInput = InferRequestType<typeof $markRead>["json"];
type UpdatePreferenceInput = InferRequestType<typeof $updatePreference>["json"];
type UpdateOrgPreferenceInput = InferRequestType<typeof $updateOrgPreference>["json"];

type OkResponse = InferResponseType<typeof $markRead, 200>;

async function markReadFn(input: MarkReadInput): Promise<OkResponse> {
  const res = await $markRead({ json: input });
  if (!res.ok) {
    await throwApiError(
      res,
      getErrorsT()("fallback.markNotificationsRead", {
        defaultValue: "Failed to mark notifications as read",
      }),
    );
  }
  return res.json();
}

async function markAllReadFn(): Promise<OkResponse> {
  const res = await $markAllRead({});
  if (!res.ok) {
    await throwApiError(
      res,
      getErrorsT()("fallback.markAllNotificationsRead", {
        defaultValue: "Failed to mark all notifications as read",
      }),
    );
  }
  return res.json();
}

async function updatePreferenceFn(input: UpdatePreferenceInput): Promise<OkResponse> {
  const res = await $updatePreference({ json: input });
  if (!res.ok) {
    await throwApiError(
      res,
      getErrorsT()("fallback.updateNotificationPreference", {
        defaultValue: "Failed to update notification preference",
      }),
    );
  }
  return res.json();
}

async function updateOrgPreferenceFn(input: UpdateOrgPreferenceInput): Promise<OkResponse> {
  const res = await $updateOrgPreference({ json: input });
  if (!res.ok) {
    await throwApiError(
      res,
      getErrorsT()("fallback.updateOrgNotificationPreference", {
        defaultValue: "Failed to update org notification preference",
      }),
    );
  }
  return res.json();
}

export const markReadMutationOptions = mutationOptions({
  mutationKey: ["notifications", "mark-read"] as const,
  mutationFn: markReadFn,
});

export const markAllReadMutationOptions = mutationOptions({
  mutationKey: ["notifications", "mark-all-read"] as const,
  mutationFn: markAllReadFn,
});

export const updatePreferenceMutationOptions = mutationOptions({
  mutationKey: ["notifications", "update-preference"] as const,
  mutationFn: updatePreferenceFn,
});

export const updateOrgPreferenceMutationOptions = mutationOptions({
  mutationKey: ["notifications", "update-org-preference"] as const,
  mutationFn: updateOrgPreferenceFn,
});
