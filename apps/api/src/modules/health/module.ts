import { defineModule } from "inwire";
import type { IHealthCheckRegistry } from "../../shared/ports/health.port";
import { DbHealthProbe } from "./infrastructure/db-health-probe";
import { InMemoryHealthCheckRegistry } from "./infrastructure/in-memory-health-check-registry";

declare module "inwire" {
  interface AppDeps {
    IHealthCheckRegistry: IHealthCheckRegistry;
    DbHealthProbe: DbHealthProbe;
  }
}

export const healthModule = defineModule()((b) =>
  b
    .add("IHealthCheckRegistry", (): IHealthCheckRegistry => new InMemoryHealthCheckRegistry())
    .add("DbHealthProbe", (c) => new DbHealthProbe(c.IHealthCheckRegistry)),
);
