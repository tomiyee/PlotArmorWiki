"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { TemplateSection } from "./types";

interface TemplateSectionListProps {
  sections: TemplateSection[];
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  onDelete: (sectionId: number) => void;
  isPending: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function TemplateSectionList(props: TemplateSectionListProps) {
  const { sections, value, onChange, onAdd, onDelete, isPending, inputRef } =
    props;
  return (
    <div>
      <Text variant="label" className="mb-1.5">
        Sections
      </Text>
      {sections.length > 0 ? (
        <Box col className="gap-1 mb-2">
          {sections.map((section) => (
            <Box
              key={section.id}
              className="items-center gap-2 rounded border border-gray-100 px-2 py-1"
            >
              <Text className="flex-1 text-sm">{section.name}</Text>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Remove section"
                onClick={() => onDelete(section.id)}
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
          No sections yet.
        </Text>
      )}
      <Box className="gap-2 items-center">
        <Input
          ref={inputRef}
          placeholder="Section name…"
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
