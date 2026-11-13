import { type IUseCase, Option } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type {
  VerifyStripeSyncInput,
  VerifyStripeSyncOutput,
} from "../../application/usecases/verify-stripe-sync/verify-stripe-sync.dto";
import { syncInputOf } from "./stripe-sync-event.mapper";

export class StripeSyncVerifier {
  constructor(
    private readonly verifyStripeSync: IUseCase<
      VerifyStripeSyncInput,
      VerifyStripeSyncOutput,
      never
    >,
  ) {}

  async check(event: Stripe.Event): Promise<Option<string>> {
    const input = syncInputOf(event);
    if (input.isNone()) return Option.none();

    const verdict = await this.verifyStripeSync.execute(input.unwrap());

    return verdict.getValue();
  }
}
