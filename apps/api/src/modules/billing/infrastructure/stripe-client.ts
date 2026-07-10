import Stripe from "stripe";
import { env } from "../../../shared/env";

export const stripeClient = new Stripe(env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2026-06-24.dahlia",
});
