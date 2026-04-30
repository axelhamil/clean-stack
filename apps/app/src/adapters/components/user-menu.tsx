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
import { TypographySmall } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { initialsOf } from "../../common/initials";
import { useSignOut } from "../hooks/use-sign-out";

interface UserMenuProps {
  user: { name?: string | null; email: string };
}

export function UserMenu({ user }: UserMenuProps) {
  const signOut = useSignOut();
  const display = user.name?.trim() || user.email;

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
        <DropdownMenuLabel className="font-normal flex flex-col gap-0.5">
          <TypographySmall className="truncate">{display}</TypographySmall>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
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
