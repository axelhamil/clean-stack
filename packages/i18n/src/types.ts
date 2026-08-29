import type enCatalog from "./catalogs/en";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof enCatalog;
    returnNull: false;
  }
}
