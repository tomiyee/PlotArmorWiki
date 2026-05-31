"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Select } from "@/components/ui/Select";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useEditMode } from "@/contexts/EditModeContext";
import type { ChapterGroupOption } from "./types";

type WritingAsOfBannerProps = {
  /** Chapter select options, grouped by volume with disabled states applied. */
  options: ChapterGroupOption[];
  /** Currently selected chapter id. */
  value: number | undefined;
  /** Called when a new chapter is confirmed by the user. */
  onChange: (chapterId: number) => void;
  /** Whether a chapter-switch fetch is in progress; disables the selector. */
  isPending: boolean;
  /**
   * Whether the editor has unsaved changes. When `true`, selecting a different
   * chapter shows a confirmation dialog before discarding the draft.
   */
  isDirty: boolean;
};

/**
 * Sticky banner rendered via React portal directly under the navbar.
 * Displays the "Writing as of:" chapter selector in a centered fixed bar
 * so it stays visible while the editor scrolls.
 *
 * When the user selects a different chapter and `isDirty` is true, a
 * confirmation dialog prevents accidental draft loss.
 *
 * @example
 * <WritingAsOfBanner
 *   options={chapterSelectOptions}
 *   value={selectedChapterId ?? undefined}
 *   onChange={handleChapterChange}
 *   isPending={isPending}
 *   isDirty={isDirty}
 * />
 */
export function WritingAsOfBanner(props: WritingAsOfBannerProps) {
  const { options, value, onChange, isPending, isDirty } = props;
  const [pendingChapterId, setPendingChapterId] = useState<number | null>(null);

  function handleSelect(chapterId: number) {
    if (chapterId === value) return;
    if (isDirty) {
      setPendingChapterId(chapterId);
    } else {
      onChange(chapterId);
    }
  }

  function handleConfirm() {
    onChange(pendingChapterId!);
    setPendingChapterId(null);
  }

  function handleCancel() {
    setPendingChapterId(null);
  }

  const banner = (
    <div
      className="fixed top-[var(--navbar-height)] left-0 right-0 z-[9] border-b border-accent-foreground/20 bg-accent"
      aria-label="Writing as of chapter selector"
    >
      <div className="mx-auto max-w-(--content-width) w-full px-4 py-1 flex items-center justify-center gap-3">
        <Text as="span" className="shrink-0 text-sm font-medium text-accent-foreground">
          Writing as of:
        </Text>
        <Select<number>
          id="writing-as-of-chapter"
          options={options}
          value={value}
          onChange={handleSelect}
          disabled={isPending}
          className="w-52"
        />
      </div>
    </div>
  );

  return (
    <>
      {createPortal(banner, document.body)}

      {/* disablePointerDismissal prevents @base-ui from closing the dialog when
          the same mousedown that triggered the chapter selection propagates to
          document after the dialog mounts. */}
      <Dialog
        isOpen={pendingChapterId !== null}
        onClose={handleCancel}
        showCloseButton={false}
        disablePointerDismissal
      >
        <DialogHeader>
          <DialogTitle>Switch chapter and discard changes?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          You have unsaved changes. Switching to a different chapter will
          discard your current edits and load the content for that chapter.
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Switch chapter
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

/**
 * Flex-level spacer that reserves vertical space equal to the "Writing as of"
 * banner height. Render this as a flex sibling ABOVE the scroll container in
 * the serial layout so the scroll container's top edge is pushed down to the
 * banner's bottom edge. This ensures content can never scroll behind the fixed
 * banner at any scroll position — not just at scroll=0.
 *
 * Only visible while an admin is in edit mode; renders nothing otherwise.
 *
 * @example
 * // In the serial layout, between the nav injector and scroll container:
 * <WritingAsOfBannerFlexSpacer />
 * <div className="flex-1 min-h-0 overflow-y-scroll">{children}</div>
 */
export function WritingAsOfBannerFlexSpacer() {
  const { isEditing, isAdmin } = useEditMode();
  const active = isEditing && isAdmin;

  useEffect(() => {
    const root = document.documentElement;
    if (active) {
      root.style.setProperty("--banner-offset", "var(--writing-banner-height)");
    } else {
      root.style.removeProperty("--banner-offset");
    }
    return () => { root.style.removeProperty("--banner-offset"); };
  }, [active]);

  if (!active) return null;
  return <div className="h-[var(--writing-banner-height)] shrink-0" aria-hidden />;
}
