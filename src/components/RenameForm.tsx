'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface RenameFormProps {
  hiddenName: string;
  hiddenValue: string | number;
  fieldName: string;
  defaultValue: string;
  onSave: (fd: FormData) => void;
  onCancel: () => void;
  inputClassName?: string;
}

/**
 * Generic inline rename form with a hidden ID field, a text input, and Save/Cancel buttons.
 *
 * @example
 * <RenameForm
 *   hiddenName="sectionId"
 *   hiddenValue={section.id}
 *   fieldName="name"
 *   defaultValue={section.name}
 *   onSave={handleRename}
 *   onCancel={() => setRenaming(null)}
 * />
 */
export function RenameForm({
  hiddenName,
  hiddenValue,
  fieldName,
  defaultValue,
  onSave,
  onCancel,
  inputClassName,
}: RenameFormProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave(new FormData(e.currentTarget));
    onCancel();
  }
  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <Input
        name={fieldName}
        defaultValue={defaultValue}
        required
        autoFocus
        className={inputClassName ?? 'flex-1'}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <Button type="submit" size="sm">Save</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </form>
  );
}
