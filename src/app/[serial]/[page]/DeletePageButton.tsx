"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { deletePage, getPageWikiLinkReferences } from "./actions";

type WikiLinkRef = {
  /** Slug of the page that contains the reference. */
  pageSlug: string;
  /** Display name of the page that contains the reference. */
  pageName: string;
  /** Name of the section containing the link. */
  sectionName: string;
};

type DeletePageButtonProps = {
  /** URL slug of the serial this page belongs to. */
  serialSlug: string;
  /** URL slug of the page to delete. */
  pageSlug: string;
};

/**
 * Admin-only "Delete page" button with a pre-delete wiki-link guard.
 *
 * On click it fetches `getPageWikiLinkReferences` first:
 * - If references exist, a blocking dialog lists them so the admin knows
 *   which sections must be edited before deletion can proceed.
 * - If no references exist, a confirmation dialog warns that the action is
 *   reversible (restore is available) before calling `deletePage`.
 *
 * After a successful delete the user is redirected to the serial home.
 *
 * @example
 * <DeletePageButton serialSlug="one-piece" pageSlug="luffy" />
 */
export function DeletePageButton(props: DeletePageButtonProps) {
  const { serialSlug, pageSlug } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogState, setDialogState] = useState<
    | { kind: "closed" }
    | { kind: "blocked"; refs: WikiLinkRef[] }
    | { kind: "confirm" }
    | { kind: "error"; message: string }
  >({ kind: "closed" });

  function handleClick() {
    startTransition(async () => {
      const refs = await getPageWikiLinkReferences(serialSlug, pageSlug);
      if (refs.length > 0) {
        setDialogState({ kind: "blocked", refs });
      } else {
        setDialogState({ kind: "confirm" });
      }
    });
  }

  function handleConfirmDelete() {
    startTransition(async () => {
      const result = await deletePage(serialSlug, pageSlug);
      if (result.error) {
        setDialogState({ kind: "error", message: result.error });
      } else {
        setDialogState({ kind: "closed" });
        router.push(`/${serialSlug}`);
      }
    });
  }

  function handleClose() {
    if (!isPending) setDialogState({ kind: "closed" });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive border-destructive/40 hover:bg-destructive/10"
        onClick={handleClick}
        disabled={isPending}
      >
        <Trash2Icon className="size-4" />
        Delete page
      </Button>

      {/* Blocked: wiki links must be removed first */}
      <Dialog
        isOpen={dialogState.kind === "blocked"}
        onClose={handleClose}
        popupClassName="sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>Cannot delete page</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text variant="body" className="mb-4">
            The following sections contain wiki links pointing to this page.
            Edit those sections to remove the links before deleting.
          </Text>
          {dialogState.kind === "blocked" && (
            <ul className="space-y-1 text-sm">
              {dialogState.refs.map((ref, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>
                    <span className="font-medium">{ref.pageName}</span>
                    {" — "}
                    <span className="text-muted-foreground">
                      {ref.sectionName}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog
        isOpen={dialogState.kind === "confirm"}
        onClose={handleClose}
      >
        <DialogHeader>
          <DialogTitle>Delete this page?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text variant="body">
            This will hide the page from all readers and remove it from search
            results. All versioned content is preserved — an admin can restore
            the page at any time by visiting its URL.
          </Text>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={isPending} />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={isPending}
          >
            Delete page
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Error dialog */}
      <Dialog
        isOpen={dialogState.kind === "error"}
        onClose={handleClose}
      >
        <DialogHeader>
          <DialogTitle>Error</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text variant="body">
            {dialogState.kind === "error" ? dialogState.message : ""}
          </Text>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </Dialog>
    </>
  );
}
