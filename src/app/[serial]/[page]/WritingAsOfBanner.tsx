"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Text } from "@/components/ui/Text";
import { InfoIcon } from "@/components/ui/InfoIcon";
import { useBannerSlot, useBannerActivate } from "@/components/ui/Banner";
import { useEditMode } from "@/contexts/EditModeContext";

type WritingAsOfBannerProps = {
  /** Display name of the chapter edits are written at — always the admin's reading cutoff. */
  chapterName: string | null;
  /** The serial's chapter type label (e.g. "Chapter", "Episode"). */
  chapterType?: string;
};

/**
 * Fills the `<Banner>` slot with a static "Writing as of:" indicator. Must be
 * rendered as a descendant of `<Banner>` so the slot context is available.
 *
 * The writing chapter is always the admin's current reading cutoff — there is
 * no separate selector. To edit content at an earlier chapter, the admin
 * changes their reading progress via the global chapter selector.
 *
 * @example
 * <WritingAsOfBanner chapterName="12" chapterType="Chapter" />
 */
export function WritingAsOfBanner(props: WritingAsOfBannerProps) {
  const { chapterName, chapterType = "Chapter" } = props;
  const { isEditing, isAdmin } = useEditMode();
  const activate = useBannerActivate();
  const slot = useBannerSlot();
  const enabled = isEditing && isAdmin && chapterName !== null;

  useEffect(() => {
    activate?.(enabled);
    return () => activate?.(false);
  }, [activate, enabled]);

  return (
    <>
      {slot &&
        enabled &&
        createPortal(
          <>
            <Text
              as="span"
              className="shrink-0 text-sm font-medium text-accent-foreground"
            >
              Writing as of: {chapterType} {chapterName}
            </Text>
            <InfoIcon
              contents={`Edits always apply as of your current reading progress. To edit content at an earlier ${chapterType.toLowerCase()}, change your reading progress first.`}
            />
          </>,
          slot,
        )}
    </>
  );
}
