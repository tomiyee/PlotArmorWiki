"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useEditMode } from "@/contexts/EditModeContext";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface Props {
  schemaId: number;
  initialName: string;
  initialBody: string | null;
  serialSlug: string;
  updateSchemaAction: (fd: FormData) => Promise<void>;
  deleteSchemaAction: (fd: FormData) => Promise<void>;
}

/**
 * Inline editor for a schema's name and markdown body. Toggles between a
 * read-only view (rendered markdown) and an edit form (text input + textarea)
 * driven by the global `EditModeContext`. The `<EditModeFAB>` triggers save
 * and discard via registered handlers.
 * Navigates to the new URL when the name changes, since the slug is name-based.
 * Delete is confirmed via dialog and redirects to the serial page.
 *
 * @example
 * <SchemaIndexEditor
 *   schemaId={schema.id}
 *   initialName={schema.name}
 *   initialBody={schema.body}
 *   serialSlug="one-piece"
 *   updateSchemaAction={updateSchemaForSerial}
 *   deleteSchemaAction={deleteSchemaForSerial}
 * />
 */
export function SchemaIndexEditor({
  schemaId,
  initialName,
  initialBody,
  serialSlug,
  updateSchemaAction,
  deleteSchemaAction,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isEditing, registerHandlers } = useEditMode();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Committed = last saved values; draft = in-progress edits.
  const [committedName, setCommittedName] = useState(initialName);
  const [committedBody, setCommittedBody] = useState(initialBody ?? "");
  const [draftName, setDraftName] = useState(initialName);
  const [draftBody, setDraftBody] = useState(initialBody ?? "");

  function handleSave() {
    const trimmedName = draftName.trim();
    if (!trimmedName) return;

    const fd = new FormData();
    fd.set("schemaId", String(schemaId));
    fd.set("name", trimmedName);
    fd.set("body", draftBody);

    startTransition(async () => {
      await updateSchemaAction(fd);
      setCommittedName(trimmedName);
      setCommittedBody(draftBody);
      if (trimmedName !== committedName) {
        router.push(`/${serialSlug}/${encodeURIComponent(trimmedName)}`);
      } else {
        router.refresh();
      }
    });
  }

  function handleDiscard() {
    setDraftName(committedName);
    setDraftBody(committedBody);
  }

  useEffect(() => {
    return registerHandlers({ onSave: handleSave, onDiscard: handleDiscard });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftName, draftBody, committedName, committedBody]);

  function handleDelete() {
    const fd = new FormData();
    fd.set("schemaId", String(schemaId));
    startTransition(async () => {
      await deleteSchemaAction(fd);
      router.push(`/${serialSlug}`);
    });
  }

  if (!isEditing) {
    return (
      <Box col flex={1} className="gap-2">
        <Text variant="h1">{committedName}</Text>
        {committedBody && (
          <div className="prose prose-gray max-w-none text-gray-700">
            <ReactMarkdown>{committedBody}</ReactMarkdown>
          </div>
        )}
      </Box>
    );
  }

  return (
    <>
      <Box col className="gap-4">
        <Box col className="gap-1.5">
          <Label htmlFor="schema-name">Page Category Name</Label>
          <Input
            id="schema-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            disabled={isPending}
          />
        </Box>
        <Box col className="gap-1.5">
          <Label htmlFor="schema-body">Description</Label>
          <MDEditor
            value={draftBody}
            onChange={(v) => setDraftBody(v ?? "")}
            preview="edit"
            data-color-mode="light"
          />
        </Box>
        <Box className="justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmingDelete(true)}
            title="Delete schema"
            className="text-red-500 hover:text-red-600"
          >
            <FontAwesomeIcon icon={faTrash} />
          </Button>
        </Box>
      </Box>

      <Dialog
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{committedName}&rdquo;?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            This will permanently delete this page type and all its pages. This
            action cannot be undone.
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={handleDelete}
          >
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
