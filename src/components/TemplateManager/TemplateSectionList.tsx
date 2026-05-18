"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
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
              className="items-center gap-2 rounded border border-border px-2 py-1"
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
                <Trash2Icon className="h-2.5 w-2.5 text-red-400" />
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
          <PlusIcon className="h-3 w-3" />
          Add
        </Button>
      </Box>
    </div>
  );
}
