import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { SUB_PROCESSORS } from "../../../shared/sub-processors.config";

const activeProcessors = SUB_PROCESSORS.filter((sp) => sp.status === "active");

export function DataSourcesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data sub-processors</CardTitle>
        <CardDescription>
          Third parties we use to operate the service (active only).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {activeProcessors.map((sp) => (
            <li key={sp.name} className="flex flex-col gap-0.5 py-3">
              <span className="text-sm font-medium">{sp.name}</span>
              <TypographyMuted className="text-xs">
                {sp.purpose} · {sp.region}
              </TypographyMuted>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <NavLink asChild variant="underline">
          <Link to="/legal/sub-processors">View all sub-processors</Link>
        </NavLink>
      </CardFooter>
    </Card>
  );
}
