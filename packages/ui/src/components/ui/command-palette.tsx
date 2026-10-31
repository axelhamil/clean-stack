import type { LucideIcon } from "lucide-react";
import { type Dispatch, Fragment, type SetStateAction, useEffect, useRef } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./command";
import { CommandHint } from "./command-hint";

export interface CommandPaletteShortcut {
  display: string;
  match: (event: KeyboardEvent) => boolean;
}

export interface CommandPaletteEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  searchValue?: string;
  hint?: string;
  shortcut?: CommandPaletteShortcut;
  run: () => unknown;
}

export interface CommandPaletteGroup {
  heading: string;
  items: CommandPaletteEntry[];
}

function isTypingInField(): boolean {
  const target = document.activeElement;
  if (!target) return false;

  const tag = target.tagName;

  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useTogglePaletteShortcut(setOpen: Dispatch<SetStateAction<boolean>>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

export function useEntryShortcuts(
  groups: CommandPaletteGroup[],
  onEntryFailed: (error: unknown) => void,
): void {
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const onFailedRef = useRef(onEntryFailed);
  onFailedRef.current = onEntryFailed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingInField()) return;

      for (const group of groupsRef.current) {
        for (const entry of group.items) {
          if (entry.shortcut?.match(e)) {
            e.preventDefault();
            Promise.resolve(entry.run()).catch((err) => onFailedRef.current(err));
            return;
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function searchValueOf(entry: CommandPaletteEntry): string {
  return entry.searchValue ? `${entry.label} ${entry.searchValue}` : entry.label;
}

export interface CommandPaletteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandPaletteGroup[];
  title: string;
  description: string;
  closeLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  onEntryFailed: (error: unknown) => void;
  search?: string;
  onSearchChange?: (search: string) => void;
}

export function CommandPaletteDialog({
  open,
  onOpenChange,
  groups,
  title,
  description,
  closeLabel,
  searchPlaceholder,
  emptyLabel,
  onEntryFailed,
  search,
  onSearchChange,
}: CommandPaletteDialogProps) {
  const opener = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opener.current = document.activeElement;
  wasOpen.current = open;

  const giveFocusBack = (event: Event) => {
    if (!(opener.current instanceof HTMLElement) || !opener.current.isConnected) return;

    event.preventDefault();
    opener.current.focus();
  };

  const selectEntry = (entry: CommandPaletteEntry) => () => {
    onOpenChange(false);
    Promise.resolve(entry.run()).catch(onEntryFailed);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel={closeLabel}
      onCloseAutoFocus={giveFocusBack}
    >
      <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={onSearchChange} />
      <CommandList>
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        {groups.map((group, index) => (
          <Fragment key={group.heading}>
            {index > 0 && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.items.map((entry) => {
                const Icon = entry.icon;

                return (
                  <CommandItem
                    key={entry.id}
                    value={searchValueOf(entry)}
                    onSelect={selectEntry(entry)}
                  >
                    <Icon />
                    <span className="min-w-0 flex-1 break-words">{entry.label}</span>
                    {entry.hint && <CommandHint>{entry.hint}</CommandHint>}
                    {entry.shortcut && <CommandShortcut>{entry.shortcut.display}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
