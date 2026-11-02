import { file, YAML } from "bun";
import z from "zod";

const ROOT = new URL("../", import.meta.url);

const stepSchema = z.looseObject({
  name: z.string().optional(),
  uses: z.string().optional(),
  run: z.string().optional(),
  with: z.record(z.string(), z.unknown()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const jobSchema = z.looseObject({
  if: z.string().optional(),
  needs: z.union([z.string(), z.array(z.string())]).optional(),
  environment: z.string().optional(),
  "timeout-minutes": z.number().optional(),
  env: z.record(z.string(), z.string()).optional(),
  permissions: z.record(z.string(), z.string()).optional(),
  steps: z.array(stepSchema),
});

const workflowSchema = z.looseObject({
  name: z.string(),
  on: z.looseObject({
    push: z.looseObject({ branches: z.array(z.string()) }).optional(),
    workflow_run: z
      .looseObject({
        workflows: z.array(z.string()),
        types: z.array(z.string()),
        branches: z.array(z.string()),
      })
      .optional(),
    workflow_dispatch: z.unknown().optional(),
    schedule: z.array(z.object({ cron: z.string() })).optional(),
  }),
  permissions: z.record(z.string(), z.string()).optional(),
  concurrency: z.looseObject({ group: z.string(), "cancel-in-progress": z.boolean() }).optional(),
  jobs: z.record(z.string(), jobSchema),
});

export type Job = z.infer<typeof jobSchema>;

export function pathOf(path: string): string {
  return new URL(path, ROOT).pathname;
}

export async function textOf(path: string): Promise<string> {
  return file(new URL(path, ROOT)).text();
}

export async function workflowOf(path: string) {
  return workflowSchema.parse(YAML.parse(await textOf(path)));
}
