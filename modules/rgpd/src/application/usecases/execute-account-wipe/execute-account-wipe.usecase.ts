import type { IUseCase, Result } from "@packages/ddd-kit";
import type { RgpdError } from "../../ports/repositories/deletion-state.port";
import type { AccountWipeService } from "../../services/account-wipe.service";
import type { ExecuteAccountWipeInput, ExecuteAccountWipeOutput } from "./execute-account-wipe.dto";

export class ExecuteAccountWipeUseCase
  implements IUseCase<ExecuteAccountWipeInput, ExecuteAccountWipeOutput, RgpdError>
{
  constructor(private readonly wipes: Pick<AccountWipeService, "wipe">) {}

  execute(input: ExecuteAccountWipeInput): Promise<Result<ExecuteAccountWipeOutput, RgpdError>> {
    return this.wipes.wipe(input.userId);
  }
}
