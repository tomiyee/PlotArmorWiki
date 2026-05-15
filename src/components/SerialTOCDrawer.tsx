"use client";

import { useState, type ReactNode } from "react";
import { TableOfContents as TableOfContentsIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/Dialog";
import { Tooltip } from "@/components/ui/Tooltip";

interface Props {
  /** Pre-rendered <SerialTOC> to display inside the drawer. */
  tocContent: ReactNode;
}

/**
 * Mobile-only "Contents" icon button that opens a dialog containing the
 * serial's table of contents. Visible only on screens narrower than `md`
 * (`md:hidden`).
 *
 * @example
 * <SerialTOCDrawer tocContent={<SerialTOC ... />} />
 */
export function SerialTOCDrawer({ tocContent }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip content="Table of contents" side="bottom">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open table of contents"
          onClick={() => setOpen(true)}
          className="md:hidden"
        >
          <TableOfContentsIcon />
        </Button>
      </Tooltip>

      <Dialog isOpen={open} onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>Contents</DialogTitle>
        </DialogHeader>
        <DialogBody>{tocContent}</DialogBody>
      </Dialog>
    </>
  );
}
