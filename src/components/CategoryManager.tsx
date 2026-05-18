"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { useServerAction } from "@/hooks/useServerAction";
import { useEditMode } from "@/contexts/EditModeContext";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: number;
  name: string;
  hasFloater: boolean;
  pageCount: number;
  sections: { id: number; name: string; displayOrder: number }[];
  floaterRows: { id: number; label: string; displayOrder: number }[];
}

interface CategoryManagerProps {
  categories: Category[];
  serialSlug: string;
  addCategoryAction: (formData: FormData) => Promise<void>;
}

// ─── Category Manager ──────────────────────────────────────────────────────────

/**
 * Client component that lists page categories for a serial. In edit mode,
 * provides an inline add form; links to each category's index page for
 * renaming, deletion, and section management.
 *
 * @example
 * <CategoryManager
 *   categories={categories}
 *   serialSlug="one-piece"
 *   addCategoryAction={addCategoryAction}
 * />
 */
export function CategoryManager(props: CategoryManagerProps) {
  const { categories, serialSlug, addCategoryAction } = props;
  const { run, isPending } = useServerAction();
  const { isEditing } = useEditMode();
  const [addingCategory, setAddingCategory] = useState(false);
  const [hasFloater, setHasFloater] = useState(false);

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Text variant="h2">Page Categories</Text>

      {categories.length > 0 ? (
        <Box col className="gap-3">
          {categories.map((category) => (
            <Box
              key={category.id}
              className="items-center gap-2 rounded-lg border border-border p-3"
            >
              <Box className="flex-1 items-center gap-2">
                <Text variant="h4" as="span">
                  {category.name}
                </Text>
                <Text
                  as="span"
                  muted
                  className="rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {category.pageCount}
                </Text>
              </Box>
              <Link
                href={`/${serialSlug}/${encodeURIComponent(category.name)}`}
                className="text-xs text-primary hover:underline px-1"
                title={`View ${category.name} index page`}
              >
                View →
              </Link>
            </Box>
          ))}
        </Box>
      ) : (
        <Text muted>
          No page categories yet. Add a page category to define wiki page types.
        </Text>
      )}

      {isEditing && (
        <div className="mt-2 pt-4 border-t border-border">
          {addingCategory ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                fd.set("hasFloater", String(hasFloater));
                run(addCategoryAction, fd, () => {
                  form.reset();
                  setHasFloater(false);
                  setAddingCategory(false);
                });
              }}
              className="flex flex-col gap-3"
            >
              <Box col className="gap-1 flex-1">
                <Label htmlFor="categoryName">Page category name</Label>
                <Input
                  id="categoryName"
                  name="name"
                  required
                  placeholder="e.g. Characters, Locations…"
                  autoFocus
                  onKeyDown={(e) =>
                    e.key === "Escape" && setAddingCategory(false)
                  }
                />
              </Box>
              <Box className="items-center gap-2">
                <input
                  type="checkbox"
                  id="hasFloater"
                  checked={hasFloater}
                  onChange={(e) => setHasFloater(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
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
                    setAddingCategory(false);
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
              onClick={() => setAddingCategory(true)}
            >
              <PlusIcon className="h-3 w-3" />
              Add page category
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
