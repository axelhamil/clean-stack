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
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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

const route = getRouteApi("/_protected/_shell/_admin/admin/users/$id");

export function AdminUserDetailPage() {
  const { id } = route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banOpen, setBanOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);

  const query = useQuery(adminUserQueryOptions(id));

  const invalidateUser = () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

  const banMutation = useMutation({
    ...banUserMutationOptions,
    onSuccess: () => {
      toast.success("Compte suspendu.");
      setBanOpen(false);
      void invalidateUser();
    },
    onError: (err) => toast.error(err.message),
  });

  const unbanMutation = useMutation({
    ...unbanUserMutationOptions,
    onSuccess: () => {
      toast.success("Compte réactivé.");
      void invalidateUser();
    },
    onError: (err) => toast.error(err.message),
  });

  const impersonateMutation = useMutation({
    ...startImpersonationMutationOptions,
    onSuccess: () => {
      toast.success("Impersonation démarrée.");
      setImpersonateOpen(false);
      void navigate({ to: "/dashboard" });
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeSessionsMutation = useMutation({
    ...revokeSessionsMutationOptions,
    onSuccess: () => {
      toast.success("Sessions révoquées.");
      void invalidateUser();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetPasswordMutation = useMutation({
    ...resetPasswordMutationOptions,
    onSuccess: () => toast.success("Email de réinitialisation envoyé."),
    onError: (err) => toast.error(err.message),
  });

  if (query.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <p>Chargement…</p>
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <p>Impossible de charger le compte.</p>
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
          <CardTitle>Identité</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span>Email</span>
              <span>{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Rôle</span>
              <span>{user.role ? <Badge variant="secondary">{user.role}</Badge> : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Double authentification</span>
              <span>{user.twoFactorEnabled ? "Activée" : "Désactivée"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Membre depuis</span>
              <span>{new Date(user.createdAt).toLocaleDateString("fr-FR")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card variant={user.banned ? "destructive" : "default"}>
        <CardHeader>
          <CardTitle variant={user.banned ? "destructive" : "default"}>État du compte</CardTitle>
          <CardAction>
            <div className="flex flex-wrap gap-2">
              {user.banned ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unbanMutation.isPending}
                  onClick={() => unbanMutation.mutate(id)}
                >
                  Réactiver
                </Button>
              ) : (
                <Dialog open={banOpen} onOpenChange={setBanOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      Suspendre
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Suspendre le compte</DialogTitle>
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
                    Impersonner
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Impersonner ce compte</DialogTitle>
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
              <span>Statut</span>
              <span>
                {user.banned ? (
                  <Badge variant="destructive">Suspendu</Badge>
                ) : (
                  <Badge variant="outline">Actif</Badge>
                )}
              </span>
            </div>
            {user.banReason && (
              <div className="flex items-center justify-between">
                <span>Motif</span>
                <span>{user.banReason}</span>
              </div>
            )}
            {user.banExpires !== null && (
              <div className="flex items-center justify-between">
                <span>Expiration</span>
                <span>{new Date(user.banExpires).toLocaleDateString("fr-FR")}</span>
              </div>
            )}
            {user.banned && user.banExpires === null && (
              <div className="flex items-center justify-between">
                <span>Expiration</span>
                <span>Permanent</span>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={revokeSessionsMutation.isPending}
              onClick={() => revokeSessionsMutation.mutate(id)}
            >
              Révoquer les sessions
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={resetPasswordMutation.isPending}
              onClick={() => resetPasswordMutation.mutate(id)}
            >
              Réinitialiser le mot de passe
            </Button>
          </div>
        </CardFooter>
      </Card>

      <SessionsCard sessions={user.sessions} />
    </main>
  );
}
