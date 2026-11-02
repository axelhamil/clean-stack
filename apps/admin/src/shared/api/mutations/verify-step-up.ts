import { verifyStepUpOptions } from "@packages/web-kit/auth/verify-step-up-options";
import { api } from "../api-client";

export const verifyStepUpMutationOptions = verifyStepUpOptions(api.admin["step-up"].$post);
