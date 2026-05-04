/**
 * Authorization DevTool — dev-only floating panel.
 *
 * Visualises the active session's role and the full capability matrix derived
 * from `STATEMENTS` × `roles` in `@packages/access-control`. Use it to verify
 * UI gating per role without seeding test users.
 *
 * Tree-shaken in production via `import.meta.env.DEV`.
 */
import { authorizeRole, isPersonalOrg, STATEMENTS } from "@packages/access-control";
import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { activeOrgQueryOptions } from "../api/queries/active-org";
import { useAuthorization } from "../auth/use-authorization";

const PERSONAL_BLOCKED: Record<string, ReadonlySet<string>> = {
  organization: new Set(["delete", "leave"]),
};

export function AuthorizationDevTool() {
  const [open, setOpen] = useState(false);
  const { role, hasMembership } = useAuthorization();
  const { data: org } = useQuery(activeOrgQueryOptions);
  const isPersonal = org ? isPersonalOrg(org.slug) : false;

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <Card className="w-96 max-h-[70vh] overflow-y-auto shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4" />
              Authorization
            </CardTitle>
            <CardDescription>
              Role: <Badge variant="secondary">{role ?? "none"}</Badge> · Org: {org?.name ?? "—"}
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
                <X className="size-3.5" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-xs">
            {!hasMembership && <TypographyMuted>No active membership.</TypographyMuted>}
            {Object.entries(STATEMENTS).map(([resource, actions]) => (
              <div key={resource} className="flex flex-col gap-1">
                <div className="font-mono font-medium">{resource}</div>
                <div className="flex flex-wrap gap-1">
                  {(actions as readonly string[]).map((action) => {
                    const roleGrants = authorizeRole(role, {
                      [resource]: [action],
                    } as never);
                    const personalBlocks =
                      isPersonal && PERSONAL_BLOCKED[resource]?.has(action) === true;
                    const granted = roleGrants && !personalBlocks;
                    return (
                      <Badge
                        key={action}
                        variant={granted ? "default" : "outline"}
                        className="font-mono"
                        title={personalBlocks ? "Blocked on Personal org" : undefined}
                      >
                        {action}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Button
        variant="outline"
        size="icon"
        className="rounded-full shadow"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle authorization devtool"
      >
        <ShieldCheck className="size-4" />
      </Button>
    </div>
  );
}
