import { Button } from "@packages/ui/components/ui/button";
import { useSignOut } from "../_hooks/use-sign-out";

export function SignOutButton() {
  const mutation = useSignOut();
  return (
    <Button
      variant="outline"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
