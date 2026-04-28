import { container } from "inwire";

export type AppDeps = Record<string, never>;

export const di = container<AppDeps>().build();
