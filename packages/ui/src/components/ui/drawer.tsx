"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "../../libs/utils";

const FOCUSABLE_SELECTOR = 'input, textarea, [contenteditable="true"]';
const KEYBOARD_SETTLE_MS = 350;
const VISIBILITY_MARGIN_PX = 24;
const KEYBOARD_INSET_VAR = "--drawer-keyboard-inset";

let keyboardInsetSubscribers = 0;
let keyboardInsetCleanup: (() => void) | null = null;

function startKeyboardInsetTracking(): () => void {
  keyboardInsetSubscribers += 1;
  if (keyboardInsetCleanup) return () => stopKeyboardInsetTracking();

  const vv = window.visualViewport;
  if (!vv) return () => stopKeyboardInsetTracking();

  const root = document.documentElement;
  const update = () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty(KEYBOARD_INSET_VAR, `${inset}px`);
  };

  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);

  keyboardInsetCleanup = () => {
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
    root.style.removeProperty(KEYBOARD_INSET_VAR);
    keyboardInsetCleanup = null;
  };

  return () => stopKeyboardInsetTracking();
}

function stopKeyboardInsetTracking(): void {
  keyboardInsetSubscribers = Math.max(0, keyboardInsetSubscribers - 1);
  if (keyboardInsetSubscribers === 0 && keyboardInsetCleanup) {
    keyboardInsetCleanup();
  }
}

function scrollFocusedInputIntoView(input: HTMLElement): void {
  const run = () => {
    const rect = input.getBoundingClientRect();
    const vv = window.visualViewport;
    const visibleTop = vv?.offsetTop ?? 0;
    const visibleBottom = visibleTop + (vv?.height ?? window.innerHeight);

    const hiddenBelow = rect.bottom > visibleBottom - VISIBILITY_MARGIN_PX;
    const hiddenAbove = rect.top < visibleTop + VISIBILITY_MARGIN_PX;

    if (hiddenBelow || hiddenAbove) {
      input.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const vv = window.visualViewport;
  if (!vv) {
    window.setTimeout(run, KEYBOARD_SETTLE_MS);
    return;
  }

  const onResize = () => {
    vv.removeEventListener("resize", onResize);
    run();
  };
  vv.addEventListener("resize", onResize);
  window.setTimeout(() => {
    vv.removeEventListener("resize", onResize);
    run();
  }, KEYBOARD_SETTLE_MS);
}

function useKeyboardAwareFocus<
  T extends HTMLElement,
>(): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);

  React.useEffect(() => {
    const stop = startKeyboardInsetTracking();
    const node = ref.current;
    if (!node) return stop;

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches(FOCUSABLE_SELECTOR)) return;
      scrollFocusedInputIntoView(target);
    };

    node.addEventListener("focusin", handleFocusIn);
    return () => {
      node.removeEventListener("focusin", handleFocusIn);
      stop();
    };
  }, []);

  return ref;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Mac/.test(ua) && "ontouchend" in document;
}

function Drawer({
  repositionInputs,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  const shouldReposition = repositionInputs ?? !isIOS();
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      repositionInputs={shouldReposition}
      {...props}
    />
  );
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const focusRef = useKeyboardAwareFocus<HTMLDivElement>();
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={focusRef}
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80dvh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=bottom]:[bottom:max(var(--drawer-keyboard-inset,0px),env(keyboard-inset-height,0px))]",
          "data-[vaul-drawer-direction=bottom]:[max-height:calc(80dvh_-_max(var(--drawer-keyboard-inset,0px),env(keyboard-inset-height,0px)))]",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          className,
        )}
        {...props}
      >
        <div className="bg-drawer-handle mx-auto mt-2 hidden h-1 w-10 shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
};
