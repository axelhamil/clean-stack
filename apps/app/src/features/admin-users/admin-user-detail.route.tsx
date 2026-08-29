import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { broadcastAuthChange } from "../../shared/auth/auth-broadcast";
import { useFormatDate } from "../../shared/i18n/use-format-date";
import {
  banUserMutationOptions,
  resetPasswordMutationOptions,
  revokeSessionsMutationOptions,
  startImpersonationMutationOptions,
  unbanUserMutationOptions,
} from "./api/admin-users.mutations";
import { adminUserQueryOptions } from "./api/admin-users.queries";
import { SessionsCard } from "./components/sessions-card";
import { BanForm } from "./forms/ban-form";
import { ImpersonateForm } from "./forms/impersonate-form";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/users/$id")({
  component: AdminUserDetailPage,
});

function AdminUserDetailPage() {
  const formatDate = useFormatDate();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banOpen, setBanOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);

  const query = useQuery(adminUserQueryOptions(id));

  const invalidateUser = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

  const banMutation = useMutation({
    ...banUserMutationOptions,
    onSuccess: () => {
      toast.success("Account suspended.");
      setBanOpen(false);
      void invalidateUser();
    },
    onError: (err) => toast.error(err.message),
  });

  const unbanMutation = useMutation({
    ...unbanUserMutationOptions,
    onSuccess: () => {
      toast.success("Account reactivated.");
      void invalidateUser();
    },
    onError: (err) => toast.error(err.message),
  });

  const impersonateMutation = useMutation({
    ...startImpersonationMutationOptions,
    onSuccess: async () => {
      toast.success("Impersonation started.");
      setImpersonateOpen(false);
      await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });
      broadcastAuthChange({ identityChanged: true });
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeSessionsMutation = useMutation({
    ...revokeSessionsMutationOptions,
    onSuccess: () => {
      toast.success("Sessions revoked.");
      void invalidateUser();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetPasswordMutation = useMutation({
    ...resetPasswordMutationOptions,
    onSuccess: () => toast.success("Password reset email sent."),
    onError: (err) => toast.error(err.message),
  });

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
        <p>Failed to load account.</p>
      </main>
    );
  }

  const user = query.data;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <TypographyH1 variant="page">{user.name}</TypographyH1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span>Email</span>
              <span>{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Role</span>
              <span>{user.role ? <Badge variant="secondary">{user.role}</Badge> : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Two-factor auth</span>
              <span>{user.twoFactorEnabled ? "Enabled" : "Disabled"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Member since</span>
              <span>{formatDate(user.createdAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card variant={user.banned ? "destructive" : "default"}>
        <CardHeader>
          <CardTitle variant={user.banned ? "destructive" : "default"}>Account status</CardTitle>
          <CardAction>
            <div className="flex flex-wrap gap-2">
              {user.banned ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unbanMutation.isPending}
                  onClick={() => unbanMutation.mutate(id)}
                >
                  Reactivate
                </Button>
              ) : (
                <Dialog open={banOpen} onOpenChange={setBanOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      Suspend
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Suspend account</DialogTitle>
                    </DialogHeader>
                    <BanForm
                      isPending={banMutation.isPending}
                      onSubmit={(values) => banMutation.mutate({ id, ...values })}
                    />
                  </DialogContent>
                </Dialog>
              )}
              <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Impersonate
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Impersonate account</DialogTitle>
                  </DialogHeader>
                  <ImpersonateForm
                    isPending={impersonateMutation.isPending}
                    onSubmit={(values) => impersonateMutation.mutate({ id, ...values })}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span>
                {user.banned ? (
                  <Badge variant="destructive">Suspended</Badge>
                ) : (
                  <Badge variant="outline">Active</Badge>
                )}
              </span>
            </div>
            {user.banReason && (
              <div className="flex items-center justify-between">
                <span>Reason</span>
                <span>{user.banReason}</span>
              </div>
            )}
            {user.banExpires !== null && (
              <div className="flex items-center justify-between">
                <span>Expires</span>
                <span>{formatDate(user.banExpires)}</span>
              </div>
            )}
            {user.banned && user.banExpires === null && (
              <div className="flex items-center justify-between">
                <span>Expires</span>
                <span>Permanent</span>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={revokeSessionsMutation.isPending}
            onClick={() => revokeSessionsMutation.mutate(id)}
          >
            Revoke sessions
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={resetPasswordMutation.isPending}
            onClick={() => resetPasswordMutation.mutate(id)}
          >
            Reset password
          </Button>
        </CardFooter>
      </Card>

      <SessionsCard sessions={user.sessions} />
    </main>
  );
}
