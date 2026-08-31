import admin from "./admin";
import auth from "./auth";
import common from "./common";
import emails from "./emails";
import errors from "./errors";
import settings from "./settings";

const catalog = { common, auth, errors, emails, settings, admin } as const;

export type Namespace = keyof typeof catalog;

/**
 * Derived from the catalog, never written by hand: a literal list is a second
 * source of truth for the same fact, and the copy that drifts is always the one
 * nothing reads at build time — a namespace added to the catalog but missing
 * from the list is simply never checked for parity, silently.
 */
export const NAMESPACES = Object.keys(catalog) as Namespace[];

export default catalog;
