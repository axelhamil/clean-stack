import { Avatar, AvatarFallback } from "@packages/ui/components/ui/avatar";
import { Button } from "@packages/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { type DisplayUser, displayName, initialsOf } from "../../shared/utils";
import { useSignOut } from "../auth/use-sign-out";

interface UserMenuProps {
  user: DisplayUser;
}

export function UserMenu({ user }: UserMenuProps) {
  const signOut = useSignOut();
  const display = displayName(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">{initialsOf(display)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">Open user menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
        <DropdownMenuLabel weight="normal" className="flex flex-col gap-0.5">
          <TypographySmall className="truncate">{display}</TypographySmall>
          <TypographyMuted className="truncate">{user.email}</TypographyMuted>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/settings/account">
              <User />
              Account
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOut.mutate()}
          disabled={signOut.isPending}
          variant="destructive"
        >
          <LogOut />
          {signOut.isPending ? "Signing out…" : "Sign out"}
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
