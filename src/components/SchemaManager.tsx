"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
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
import { RenameForm } from "@/components/RenameForm";
import { useServerAction } from "@/hooks/useServerAction";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Schema {
  id: number;
  name: string;
  hasFloater: boolean;
  sections: { id: number; name: string; displayOrder: number }[];
  floaterRows: { id: number; label: string; displayOrder: number }[];
}

interface PendingDelete {
  type: "schema";
  id: number;
  name: string;
}

interface SchemaManagerProps {
  schemas: Schema[];
  serialSlug: string;
  addSchemaAction: (formData: FormData) => Promise<void>;
  deleteSchemaAction: (formData: FormData) => Promise<void>;
  renameSchemaAction: (formData: FormData) => Promise<void>;
}

// ─── Schema Manager ─────────────────────────────────────────────────────────────

/**
 * Client component that manages the list of page schemas for a serial. Provides
 * inline add/rename/delete for schemas and a condensed summary of sections with a
 * link to the schema index page for full section management.
 *
 * @example
 * <SchemaManager
 *   schemas={schemas}
 *   serialSlug="one-piece"
 *   addSchemaAction={addSchemaAction}
 *   deleteSchemaAction={deleteSchemaAction}
 *   renameSchemaAction={renameSchemaAction}
 * />
 */
export function SchemaManager({
  schemas,
  serialSlug,
  addSchemaAction,
  deleteSchemaAction,
  renameSchemaAction,
}: SchemaManagerProps) {
  const { run, isPending } = useServerAction();
  const [renamingSchemaId, setRenamingSchemaId] = useState<number | null>(null);
  const [addingSchema, setAddingSchema] = useState(false);
  const [hasFloater, setHasFloater] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  function confirmDelete() {
    if (!pendingDelete) return;
    const fd = new FormData();
    fd.set("schemaId", String(pendingDelete.id));
    run(deleteSchemaAction, fd, () => setPendingDelete(null));
  }

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Text variant="h2">Page Categories</Text>

      {schemas.length > 0 ? (
        <Box col className="gap-3">
          {schemas.map((schema) => {
            const isRenaming = renamingSchemaId === schema.id;
            const sectionCount = schema.sections.length;
            const floaterRowCount = schema.floaterRows.length;

            return (
              <Box
                col
                key={schema.id}
                className="gap-2 rounded-lg border border-gray-200 p-3"
              >
                <Box className="items-center gap-2">
                  {isRenaming ? (
                    <RenameForm
                      hiddenName="schemaId"
                      hiddenValue={schema.id}
                      fieldName="name"
                      defaultValue={schema.name}
                      onSave={(fd) => run(renameSchemaAction, fd)}
                      onCancel={() => setRenamingSchemaId(null)}
                    />
                  ) : (
                    <>
                      <Box className="flex-1 items-center gap-2">
                        <Text variant="h4" as="span">
                          {schema.name}
                        </Text>
                        {schema.hasFloater && (
                          <Text as="span" muted className="ml-1 text-xs">
                            (has floater)
                          </Text>
                        )}
                      </Box>
                      <Box className="items-center gap-1">
                        <Link
                          href={`/${serialSlug}/${encodeURIComponent(schema.name)}`}
                          className="text-xs text-blue-600 hover:underline px-1"
                          title={`View ${schema.name} index page`}
                        >
                          View
                        </Link>
                        <Link
                          href={`/${serialSlug}/${encodeURIComponent(schema.name)}/new`}
                          className="text-xs text-blue-600 hover:underline px-1"
                          title={`New ${schema.name} page`}
                        >
                          New page
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title={`Rename ${schema.name}`}
                          onClick={() => setRenamingSchemaId(schema.id)}
                        >
                          <FontAwesomeIcon
                            icon={faPen}
                            className="h-2.5 w-2.5"
                          />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-xs"
                          title={`Delete ${schema.name}`}
                          onClick={() =>
                            setPendingDelete({
                              type: "schema",
                              id: schema.id,
                              name: schema.name,
                            })
                          }
                        >
                          <FontAwesomeIcon
                            icon={faTrash}
                            className="h-2.5 w-2.5"
                          />
                        </Button>
                      </Box>
                    </>
                  )}
                </Box>

                {/* Condensed structure summary with link to manage on schema index page */}
                {!isRenaming && (
                  <Box className="items-center gap-2 pl-1">
                    <Text muted className="text-xs">
                      {sectionCount} section{sectionCount !== 1 ? "s" : ""}
                      {schema.hasFloater
                        ? `, ${floaterRowCount} floater row${floaterRowCount !== 1 ? "s" : ""}`
                        : ""}
                    </Text>
                    <Link
                      href={`/${serialSlug}/${encodeURIComponent(schema.name)}`}
                      className="text-xs text-blue-600 hover:underline"
                      title={`Manage ${schema.name} structure`}
                    >
                      Manage →
                    </Link>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <Text muted>
          No page types yet. Add a page type to define wiki page categories.
        </Text>
      )}

      <div className="mt-2 pt-4 border-t border-gray-100">
        {addingSchema ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              fd.set("hasFloater", String(hasFloater));
              run(addSchemaAction, fd, () => {
                form.reset();
                setHasFloater(false);
                setAddingSchema(false);
              });
            }}
            className="flex flex-col gap-3"
          >
            <Box col className="gap-1 flex-1">
              <Label htmlFor="schemaName">Page type name</Label>
              <Input
                id="schemaName"
                name="name"
                required
                placeholder="e.g. Characters, Locations…"
                autoFocus
                onKeyDown={(e) => e.key === "Escape" && setAddingSchema(false)}
              />
            </Box>
            <Box className="items-center gap-2">
              <input
                type="checkbox"
                id="hasFloater"
                checked={hasFloater}
                onChange={(e) => setHasFloater(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="hasFloater">Has floater sidebar</Label>
            </Box>
            <Box className="gap-2">
              <Button type="submit" disabled={isPending}>
                Add page type
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAddingSchema(false);
                  setHasFloater(false);
                }}
              >
                Cancel
              </Button>
            </Box>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddingSchema(true)}
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Add page type
          </Button>
        )}
      </div>

      <Dialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            {pendingDelete
              ? `Delete page type "${pendingDelete.name}"?`
              : "Delete?"}
          </DialogTitle>
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
            onClick={confirmDelete}
          >
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </Dialog>
    </section>
  );
}
