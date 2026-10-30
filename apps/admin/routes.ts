import { index, layout, rootRoute, route } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("router/__root.tsx", [
  route("/denied", "features/denied/denied.route.tsx"),

  layout("_staff", "router/_staff.tsx", [
    index("features/home/home.route.tsx"),
    route("/$section", "features/sections/section.route.tsx"),
  ]),
]);

export default routes;
