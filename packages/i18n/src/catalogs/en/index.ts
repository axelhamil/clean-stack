import auth from "./auth";
import common from "./common";
import emails from "./emails";
import errors from "./errors";
import settings from "./settings";

export const NAMESPACES = ["common", "auth", "errors", "emails", "settings"] as const;

export type Namespace = (typeof NAMESPACES)[number];

export default { common, auth, errors, emails, settings } as const;
