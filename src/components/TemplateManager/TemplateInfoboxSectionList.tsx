"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { TemplateInfoboxSection } from "./types";

interface TemplateInfoboxSectionListProps {
  /** The list of infobox sections to display */
  rows: TemplateInfoboxSection[];
  /** The current value in the input field */
  value: string;
  /** Callback function to update the input value */
  onChange: (v: string) => void;
  /** Callback function to add a new infobox row */
  onAdd: () => void;
  /** Callback function to delete an infobox row */
  onDelete: (infoboxSectionId: number) => void;
  /** Whether the component is in a pending state (e.g., loading) */
  isPending: boolean;
  /** Reference to the input element */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function TemplateInfoboxSectionList(
  props: TemplateInfoboxSectionListProps,
) {
  const { rows, value, onChange, onAdd, onDelete, isPending, inputRef } = props;
  return (
    <div>
      <Text variant="label" className="mb-1.5">
        Infobox rows
      </Text>
      {rows.length > 0 ? (
        <Box col className="gap-1 mb-2">
          {rows.map((row) => (
            <Box
              key={row.id}
              className="items-center gap-2 rounded border border-gray-100 px-2 py-1"
            >
              <Text className="flex-1 text-sm">{row.label}</Text>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Remove infobox row"
                onClick={() => onDelete(row.id)}
                disabled={isPending}
              >
                <FontAwesomeIcon
                  icon={faTrash}
                  className="h-2.5 w-2.5 text-red-400"
                />
              </Button>
            </Box>
          ))}
        </Box>
      ) : (
        <Text muted className="text-xs mb-2">
          No infobox rows yet.
        </Text>
      )}
      <Box className="gap-2 items-center">
        <Input
          ref={inputRef}
          placeholder="Row label…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          className="h-7 text-sm flex-1"
          disabled={isPending}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={isPending || !value.trim()}
        >
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
          Add
        </Button>
      </Box>
    </div>
  );
}
