import type { OnInit } from "inwire";
import type { HealthCheckFn, IHealthCheckRegistry } from "../../../shared/ports/health.port";
import type { IStorageService } from "../../../shared/ports/storage.port";

export class StorageHealthProbe implements OnInit {
  constructor(
    private readonly registry: IHealthCheckRegistry,
    private readonly storage: IStorageService,
  ) {}

  onInit(): void {
    this.registry.register("storage:s3", this.probe, { critical: false });
  }

  private readonly probe: HealthCheckFn = async () => {
    const start = performance.now();
    const result = await this.storage.headBucket();
    const observedValue = Math.round(performance.now() - start);
    if (result.isFailure) {
      return { status: "fail", output: "bucket unreachable", observedValue, observedUnit: "ms" };
    }
    return { status: "pass", observedValue, observedUnit: "ms" };
  };
}
