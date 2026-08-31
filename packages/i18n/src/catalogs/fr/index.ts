import type { Namespace } from "../en";
import admin from "./admin";
import auth from "./auth";
import common from "./common";
import emails from "./emails";
import errors from "./errors";
import settings from "./settings";

// `satisfies Record<Namespace, unknown>` is the compile-time half of the parity
// contract: a namespace added to the English catalog and forgotten here fails
// the build rather than the test suite.
export default { common, auth, errors, emails, settings, admin } as const satisfies Record<
  Namespace,
  unknown
>;
