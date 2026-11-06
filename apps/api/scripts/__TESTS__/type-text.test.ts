import { describe, expect, it } from "bun:test";
import { canonicalDeclaration } from "../type-text";

const routes = (members: string[]) =>
  `declare const routes: HonoBase<AppEnv, ${members.join(" | ")}, "/">;`;

const me = `MergeSchemaPath<{
    "/locale": { $put: { input: { json: { locale: "en" | "fr"; }; }; }; };
}, "/me">`;
const billing = `MergeSchemaPath<{ "/:id/start": { $post: { output: string | null; }; }; }, "/billing">`;

describe("canonicalDeclaration", () => {
  it("reads two orders of the same union as one declaration", () => {
    expect(canonicalDeclaration(routes([me, billing]))).toBe(
      canonicalDeclaration(routes([billing, me])),
    );
  });

  it("reads a nested union in any order as the same declaration", () => {
    expect(canonicalDeclaration('type T = { locale: "en" | "fr"; };')).toBe(
      canonicalDeclaration('type T = {\n  locale: "fr" | "en";\n};'),
    );
  });

  it("tells a changed route path apart", () => {
    const moved = me.replace('"/locale"', '"/language"');

    expect(canonicalDeclaration(routes([me, billing]))).not.toBe(
      canonicalDeclaration(routes([moved, billing])),
    );
  });

  it("tells a changed property type apart", () => {
    expect(canonicalDeclaration("type T = { output: string | null; };")).not.toBe(
      canonicalDeclaration("type T = { output: string; };"),
    );
  });

  it("reads an optional property with or without its implied undefined as the same", () => {
    expect(canonicalDeclaration("type T = { id?: string | undefined; };")).toBe(
      canonicalDeclaration("type T = { id?: string; };"),
    );
  });

  it("reads a type whose file moved into a module package as the same", () => {
    expect(
      canonicalDeclaration(
        'type T = { status: import("./modules/webhooks/application/ports/webhook.port").Status; };',
      ),
    ).toBe(
      canonicalDeclaration(
        'type T = { status: import("@modules/webhooks/application/ports/webhook.port").Status; };',
      ),
    );
  });

  it("tells a type from another package apart", () => {
    expect(canonicalDeclaration('type T = { a: import("@packages/events").Status; };')).not.toBe(
      canonicalDeclaration('type T = { a: import("@packages/drizzle").Status; };'),
    );
  });

  it("keeps a union returned by a function type inside its return type", () => {
    expect(canonicalDeclaration("type F = (a: B | A) => D | C;")).toBe(
      "type F = (a: A | B) => C | D",
    );
  });
});
