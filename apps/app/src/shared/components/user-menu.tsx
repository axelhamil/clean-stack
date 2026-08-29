import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/ui/avatar";
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
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type DisplayUser, displayName, initialsOf } from "../../shared/utils";
import { sessionQueryOptions } from "../api/queries/session";
import { useSignOut } from "../auth/use-sign-out";

interface UserMenuProps {
  user: DisplayUser;
}

export function UserMenu({ user }: UserMenuProps) {
  const { t } = useTranslation("common");
  const signOut = useSignOut();
  const display = displayName(user);
  const { data: session } = useQuery(sessionQueryOptions);
  const image = session?.user.image;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="size-8">
            {image ? <AvatarImage src={image} alt={display} /> : null}
            <AvatarFallback className="text-xs font-medium">{initialsOf(display)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">{t("userMenu.openMenu")}</span>
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
              {t("userMenu.account")}
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
          {signOut.isPending ? t("userMenu.signingOut") : t("userMenu.signOut")}
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
