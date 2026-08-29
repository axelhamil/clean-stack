import auth from "./auth";
import common from "./common";
import emails from "./emails";
import errors from "./errors";
import settings from "./settings";

export default { common, auth, errors, emails, settings } as const;
