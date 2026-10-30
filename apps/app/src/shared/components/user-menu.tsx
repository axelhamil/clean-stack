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
import { sessionQueryOptions } from "../api/queries/session";
import { SIGN_OUT_SHORTCUT, useSignOut } from "../auth/use-sign-out";
import { type DisplayUser, displayName, initialsOf } from "../utils";
import { usePrimaryNav } from "./use-primary-nav";

interface UserMenuProps {
  user: DisplayUser;
}

export function UserMenu({ user }: UserMenuProps) {
  const { t } = useTranslation("common");
  const signOut = useSignOut();
  const display = displayName(user);
  const { data: session } = useQuery(sessionQueryOptions);
  const image = session?.user.image;
  const primaryNav = usePrimaryNav();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Avatar className="size-8">
            {image ? <AvatarImage src={image} alt={display} /> : null}
            <AvatarFallback className="text-xs font-medium">{initialsOf(display)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">{t("userMenu.openMenu")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuLabel weight="normal" className="flex flex-col gap-0.5">
          <TypographySmall className="truncate">{display}</TypographySmall>
          <TypographyMuted className="truncate">{user.email}</TypographyMuted>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="md:hidden">
          {primaryNav.map((item) => (
            <DropdownMenuItem key={item.to} asChild>
              <Link to={item.to}>
                <item.icon />
                {t(item.labelKey)}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="md:hidden" />
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
          <DropdownMenuShortcut>{SIGN_OUT_SHORTCUT.display}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
