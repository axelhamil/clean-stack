import type { StaffPermission } from "@packages/access-control";
import { notFound } from "@tanstack/react-router";
import { type Section, sectionOpenTo } from "../nav/sections";

export interface SectionGateInput {
  context: { me: { permissions: readonly StaffPermission[] } };
}

export function requireSection(id: Section["id"]) {
  return ({ context }: SectionGateInput): void => {
    if (!sectionOpenTo(id, context.me.permissions)) throw notFound();
  };
}
