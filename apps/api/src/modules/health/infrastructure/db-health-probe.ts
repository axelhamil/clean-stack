import type { OnInit } from "inwire";
import type { IHealthCheckRegistry } from "../../../shared/ports/health.port";
import { probeDb } from "./probes/db.probe";

export class DbHealthProbe implements OnInit {
  constructor(private readonly registry: IHealthCheckRegistry) {}

  onInit(): void {
    this.registry.register("db:postgres", probeDb, { critical: true });
  }
}
