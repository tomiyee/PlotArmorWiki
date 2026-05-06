"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useServerAction } from "@/hooks/useServerAction";
import { useEditMode } from "@/contexts/EditModeContext";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Schema {
  id: number;
  name: string;
  hasFloater: boolean;
  pageCount: number;
  sections: { id: number; name: string; displayOrder: number }[];
  floaterRows: { id: number; label: string; displayOrder: number }[];
}

interface SchemaManagerProps {
  schemas: Schema[];
  serialSlug: string;
  addSchemaAction: (formData: FormData) => Promise<void>;
}

// ─── Schema Manager ─────────────────────────────────────────────────────────────

/**
 * Client component that lists page schemas for a serial. In edit mode, provides
 * an inline add form; links to each schema's index page for renaming, deletion,
 * and section management.
 *
 * @example
 * <SchemaManager
 *   schemas={schemas}
 *   serialSlug="one-piece"
 *   addSchemaAction={addSchemaAction}
 * />
 */
export function SchemaManager({
  schemas,
  serialSlug,
  addSchemaAction,
}: SchemaManagerProps) {
  const { run, isPending } = useServerAction();
  const { isEditing } = useEditMode();
  const [addingSchema, setAddingSchema] = useState(false);
  const [hasFloater, setHasFloater] = useState(false);

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Text variant="h2">Page Categories</Text>

      {schemas.length > 0 ? (
        <Box col className="gap-3">
          {schemas.map((schema) => (
            <Box
              key={schema.id}
              className="items-center gap-2 rounded-lg border border-gray-200 p-3"
            >
              <Box className="flex-1 items-center gap-2">
                <Text variant="h4" as="span">
                  {schema.name}
                </Text>
                <Text
                  as="span"
                  muted
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-xs"
                >
                  {schema.pageCount}
                </Text>
              </Box>
              <Link
                href={`/${serialSlug}/${encodeURIComponent(schema.name)}`}
                className="text-xs text-blue-600 hover:underline px-1"
                title={`View ${schema.name} index page`}
              >
                View →
              </Link>
            </Box>
          ))}
        </Box>
      ) : (
        <Text muted>
          No page types yet. Add a page type to define wiki page categories.
        </Text>
      )}

      {isEditing && (
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
                  Add page category
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
              Add page category
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
