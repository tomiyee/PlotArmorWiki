"use client";

import { useState, useMemo } from "react";
import { SearchIcon } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/Card";
import { useEditMode } from "@/contexts/EditModeContext";
import { useServerAction } from "@/hooks/useServerAction";

type SearchableLabelsManagerProps = {
  /** All distinct infobox row labels used across pages in this serial. */
  allLabels: string[];
  /** Labels currently enabled for search matching. */
  searchableLabels: string[];
  /** Server action: add or remove a label from the searchable set. */
  toggleLabelAction: (formData: FormData) => Promise<void>;
};

/**
 * Admin panel for configuring which infobox row labels are included when
 * searching pages in a serial. Shown in the serial home page edit mode header.
 * A label enabled here means any page with an infobox row of that name will
 * be matched when a user's search query appears in that row's content.
 */
export function SearchableLabelsManager(props: SearchableLabelsManagerProps) {
  const { allLabels, searchableLabels, toggleLabelAction } = props;
  const { isEditing } = useEditMode();
  const { run } = useServerAction();
  const [filter, setFilter] = useState("");
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  const searchableSet = useMemo(() => new Set(searchableLabels), [searchableLabels]);

  const visibleLabels = useMemo(() => {
    const trimmed = filter.trim().toLowerCase();
    if (!trimmed) return allLabels;
    return allLabels.filter((l) => l.toLowerCase().includes(trimmed));
  }, [allLabels, filter]);

  if (!isEditing) return null;

  function handleToggle(label: string, enabled: boolean) {
    setPendingLabel(label);
    const fd = new FormData();
    fd.set("label", label);
    fd.set("enabled", String(enabled));
    run(toggleLabelAction, fd, () => setPendingLabel(null), () => setPendingLabel(null));
  }

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Card>
        <CardHeader>
          <Text variant="h2">Search Fields</Text>
          <Text muted className="text-sm">
            Choose which infobox row labels are matched when searching for pages.
          </Text>
        </CardHeader>
        <CardContent>
          {allLabels.length === 0 ? (
            <Text muted className="text-sm">
              No infobox rows exist on any page yet.
            </Text>
          ) : (
            <Box col className="gap-3">
              <Input
                placeholder="Filter labels…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 text-sm"
              />
              {visibleLabels.length === 0 ? (
                <Text muted className="text-sm">No labels match.</Text>
              ) : (
                <ul className="flex flex-col gap-1">
                  {visibleLabels.map((label) => {
                    const enabled = searchableSet.has(label);
                    return (
                      <li
                        key={label}
                        className="flex items-center justify-between gap-3 rounded-md px-3 py-2 bg-muted/50"
                      >
                        <Box className="items-center gap-2 min-w-0">
                          {enabled && (
                            <SearchIcon className="h-3 w-3 text-primary shrink-0" />
                          )}
                          <Text as="span" variant="label" className="truncate">
                            {label}
                          </Text>
                        </Box>
                        <Button
                          type="button"
                          variant={enabled ? "outline" : "ghost"}
                          size="sm"
                          disabled={pendingLabel === label}
                          className={
                            enabled
                              ? "shrink-0 text-primary border-primary/40 hover:bg-primary/10"
                              : "shrink-0 text-muted-foreground"
                          }
                          onClick={() => handleToggle(label, !enabled)}
                        >
                          {enabled ? "Remove" : "Add"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
