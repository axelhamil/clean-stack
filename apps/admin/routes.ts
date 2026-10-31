import { index, layout, rootRoute, route } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("router/__root.tsx", [
  route("/denied", "features/denied/denied.route.tsx"),

  layout("_staff", "router/_staff.tsx", [
    index("features/home/home.route.tsx"),
    route("/users", "features/users/users.route.tsx"),
    route("/users/$id", "features/users/user-detail.route.tsx"),
    route("/orgs", "features/orgs/orgs.route.tsx"),
    route("/orgs/$id", "features/orgs/org-detail.route.tsx"),
    route("/audit", "features/audit/audit.route.tsx"),
    route("/approvals", "features/approvals/approvals.route.tsx"),
    route("/approvals/$id", "features/approvals/approval-detail.route.tsx"),
    route("/team", "features/team/team.route.tsx"),
    route("/$section", "features/sections/section.route.tsx"),
  ]),
]);

export default routes;
