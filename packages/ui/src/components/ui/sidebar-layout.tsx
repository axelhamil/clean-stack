import type { ReactNode } from "react";

export interface SidebarLayoutProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
}

function SidebarLayout({ sidebar, topBar, children }: SidebarLayoutProps) {
  return (
    <div data-slot="sidebar-layout" className="flex min-h-dvh flex-col md:flex-row">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-2 md:hidden">
        {topBar}
      </header>
      <aside className="hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-muted p-4 md:sticky md:top-0 md:flex">
        {sidebar}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export { SidebarLayout };
