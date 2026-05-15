"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/Dialog";
import { SerialTOC } from "@/components/SerialTOC";
import { SerialEditor } from "@/components/SerialEditor";
import { Tooltip } from "@/components/ui/Tooltip";
import { ChapterData, Volume } from "@/types";
import { ChapterType, VolumeType } from "@/lib/serial-types";

interface Props {
  serialId: number;
  serialSlug: string;
  volumes: Volume[];
  chaptersByVolume: Record<number, ChapterData[]>;
  chapterType: ChapterType;
  volumeType: VolumeType;
  addChapterAction: (formData: FormData) => Promise<void>;
  addVolumeAction: (formData: FormData) => Promise<void>;
  deleteChapterAction: (formData: FormData) => Promise<void>;
  deleteVolumeAction: (formData: FormData) => Promise<void>;
  renameChapterAction: (formData: FormData) => Promise<void>;
  renameVolumeAction: (formData: FormData) => Promise<void>;
  reorderVolumesAction: (orderedVolumeIds: number[]) => Promise<void>;
  reorderAllChaptersAction: (
    volumeOrder: number[],
    chaptersByVolumeId: Record<number, number[]>,
  ) => Promise<void>;
  updateSerialTypesAction: (formData: FormData) => Promise<void>;
}

/**
 * Desktop left sidebar: collapsible TOC with an inline edit icon. The pen icon
 * opens a dialog with the full SerialEditor already in edit mode. Volume
 * collapse state is shared with SerialEditor via the same localStorage key.
 *
 * @example
 * <SerialTOCSidebar serialId={1} serialSlug="my-serial" volumes={...} ... />
 */
export function SerialTOCSidebar({
  serialId,
  serialSlug,
  volumes,
  chaptersByVolume,
  chapterType,
  volumeType,
  addChapterAction,
  addVolumeAction,
  deleteChapterAction,
  deleteVolumeAction,
  renameChapterAction,
  renameVolumeAction,
  reorderVolumesAction,
  reorderAllChaptersAction,
  updateSerialTypesAction,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <Text
          variant="label"
          className="text-xs font-semibold uppercase tracking-wider text-gray-500"
        >
          Contents
        </Text>
        <Tooltip
          content={`Edit ${volumeType.toLowerCase()}s and ${chapterType.toLowerCase()}s`}
          side="right"
        >
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setEditOpen(true)}
            aria-label={`Edit ${volumeType.toLowerCase()}s and ${chapterType.toLowerCase()}s`}
            className="text-gray-400 hover:text-gray-600 hover:bg-transparent"
          >
            <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
          </Button>
        </Tooltip>
      </div>

      <SerialTOC
        serialId={serialId}
        serialSlug={serialSlug}
        volumes={volumes}
        chaptersByVolume={chaptersByVolume}
        chapterType={chapterType}
        volumeType={volumeType}
      />

      <Dialog isOpen={editOpen} onClose={() => setEditOpen(false)}>
        <DialogHeader>
          <DialogTitle>
            {volumeType}s &amp; {chapterType}s
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[70vh]">
          <SerialEditor
            serialId={serialId}
            volumes={volumes}
            chaptersByVolume={chaptersByVolume}
            chapterType={chapterType}
            volumeType={volumeType}
            addChapterAction={addChapterAction}
            addVolumeAction={addVolumeAction}
            deleteChapterAction={deleteChapterAction}
            deleteVolumeAction={deleteVolumeAction}
            renameChapterAction={renameChapterAction}
            renameVolumeAction={renameVolumeAction}
            reorderVolumesAction={reorderVolumesAction}
            reorderAllChaptersAction={reorderAllChaptersAction}
            updateSerialTypesAction={updateSerialTypesAction}
          />
        </DialogBody>
      </Dialog>
    </>
  );
}
