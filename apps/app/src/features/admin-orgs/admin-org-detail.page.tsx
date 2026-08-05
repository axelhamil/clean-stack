import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { adminOrgDetailQueryOptions } from "./api/admin-orgs.queries";

const route = getRouteApi("/_protected/_shell/_admin/admin/orgs/$orgId");

export function AdminOrgDetailPage() {
  const { orgId } = route.useParams();

  const query = useQuery(adminOrgDetailQueryOptions(orgId));

  if (query.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <p>Loading…</p>
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <p>Failed to load organization.</p>
      </main>
    );
  }

  const org = query.data;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <TypographyH1 variant="page">{org.name}</TypographyH1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span>Slug</span>
              <span>{org.slug}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Plan</span>
              <span>{org.plan ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Created</span>
              <span>{new Date(org.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
