/**
 * The single allowed special-case from CLAUDE.md R5.
 *
 * Personal orgs are auto-created on signup and tied 1:1 to a user account.
 * They cannot be deleted as a regular org — the only way to remove them is
 * to delete the user account (cascades to the org). Encoded by slug pattern
 * (`personal-${uuid}`); the *check* lives here so the rest of the codebase
 * never branches on the discriminator directly.
 */
export function isPersonalOrg(slug: string): boolean {
  return slug.startsWith("personal-");
}
