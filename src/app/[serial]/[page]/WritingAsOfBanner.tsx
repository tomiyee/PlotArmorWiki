"use client";

import { useEffect, useState } from "react";
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
import { useBannerSlot, useBannerActivate } from "@/components/ui/Banner";
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
 * Fills the `<Banner>` slot with the "Writing as of:" chapter selector. Must be
 * rendered as a descendant of `<Banner>` so the slot context is available.
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
  const { isEditing, isAdmin } = useEditMode();
  const activate = useBannerActivate();
  const slot = useBannerSlot();
  const enabled = isEditing && isAdmin;

  useEffect(() => {
    activate?.(enabled);
    return () => activate?.(false);
  }, [activate, enabled]);

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

  return (
    <>
      {slot && enabled &&
        createPortal(
          <>
            <Text
              as="span"
              className="shrink-0 text-sm font-medium text-accent-foreground"
            >
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
          </>,
          slot,
        )}

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
