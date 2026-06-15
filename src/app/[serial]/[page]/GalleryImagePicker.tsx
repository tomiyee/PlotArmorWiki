"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { createGalleryImage } from "./actions";
import type { GalleryImage } from "@/types";

type GalleryImagePickerProps = {
  /** Slug of the serial — used when creating a new gallery image via the server action. */
  serialSlug: string;
  /** DB id of the page currently being edited — linked to new images created here. */
  pageId: number;
  /** Spoiler-filtered gallery images available for selection. */
  galleryImages: GalleryImage[];
  /** The currently selected gallery image id; null when no image is selected. */
  selectedImageId: number | null;
  /** Called with the new image id when the admin selects or clears an image. */
  onSelect: Dispatch<SetStateAction<number | null>>;
  /** When true, disables all controls (parent editor is saving). */
  disabled?: boolean;
};

/**
 * Gallery image picker for the infobox panel.
 *
 * Shows a thumbnail of the currently selected image (if any) and a "Change
 * image" / "Choose image" button that opens a modal gallery grid. The modal
 * also has an "Add new image" form for uploading a URL with optional artist
 * credit. Selecting a thumbnail immediately updates the draft state in
 * `PageEditor` without saving to the DB.
 *
 * @example
 * <GalleryImagePicker
 *   serialSlug="one-piece"
 *   pageId={42}
 *   galleryImages={images}
 *   selectedImageId={null}
 *   onSelect={setDraftFloaterImageId}
 * />
 */
export function GalleryImagePicker(props: GalleryImagePickerProps) {
  const {
    serialSlug,
    pageId,
    galleryImages,
    selectedImageId,
    onSelect,
    disabled = false,
  } = props;

  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addImageUrl, setAddImageUrl] = useState("");
  const [addArtist, setAddArtist] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const selectedImage = galleryImages.find((img) => img.id === selectedImageId);

  async function handleAddImage() {
    if (!addImageUrl.trim()) {
      setAddError("Image URL is required.");
      return;
    }
    setIsSaving(true);
    setAddError(null);
    try {
      const newId = await createGalleryImage(
        serialSlug,
        addImageUrl.trim(),
        addArtist.trim() || null,
        null,
        pageId,
      );
      onSelect(newId);
      setIsAdding(false);
      setAddImageUrl("");
      setAddArtist("");
      setIsOpen(false);
      router.refresh();
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Failed to add image.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Box col className="gap-2">
        {selectedImage ? (
          <Box className="items-center gap-3">
            <Box className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border">
              <Image
                src={selectedImage.imageUrl}
                alt={selectedImage.artist ?? "Selected image"}
                fill
                className="object-cover"
                unoptimized
              />
            </Box>
            <Box col className="gap-0.5 min-w-0">
              {selectedImage.artist && (
                <Text className="text-xs text-muted-foreground truncate">
                  {selectedImage.artist}
                </Text>
              )}
              <Box className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setIsOpen(true)}
                >
                  Change image
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onSelect(null)}
                >
                  Remove
                </Button>
              </Box>
            </Box>
          </Box>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={disabled}
            onClick={() => setIsOpen(true)}
          >
            Choose image
          </Button>
        )}
      </Box>

      <Dialog
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          setIsAdding(false);
          setAddImageUrl("");
          setAddArtist("");
          setAddError(null);
        }}
        popupClassName="sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>
            {isAdding ? "Add new image" : "Choose an image"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {isAdding ? (
            <Box col className="gap-4">
              <Box col className="gap-1.5">
                <Label htmlFor="gallery-image-url">Image URL</Label>
                <Input
                  id="gallery-image-url"
                  value={addImageUrl}
                  onChange={(e) => setAddImageUrl(e.target.value)}
                  placeholder="https://…"
                  disabled={isSaving}
                />
              </Box>
              <Box col className="gap-1.5">
                <Label htmlFor="gallery-artist">Artist (optional)</Label>
                <Input
                  id="gallery-artist"
                  value={addArtist}
                  onChange={(e) => setAddArtist(e.target.value)}
                  placeholder="Artist name or attribution"
                  disabled={isSaving}
                />
              </Box>
              {addImageUrl.trim() && (
                <Box className="justify-center">
                  <Box className="relative h-40 w-full max-w-xs overflow-hidden rounded-md border border-border">
                    <Image
                      src={addImageUrl.trim()}
                      alt="Preview"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </Box>
                </Box>
              )}
              {addError && (
                <Text className="text-sm text-destructive">{addError}</Text>
              )}
            </Box>
          ) : galleryImages.length === 0 ? (
            <Box col className="items-center gap-3 py-8">
              <Text muted className="text-sm text-center">
                No images in the gallery yet. Add the first one below.
              </Text>
            </Box>
          ) : (
            <Box col className="gap-4">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {galleryImages.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      img.id === selectedImageId
                        ? "border-primary"
                        : "border-border hover:border-primary/60",
                    )}
                    onClick={() => {
                      onSelect(img.id);
                      setIsOpen(false);
                    }}
                  >
                    <Image
                      src={img.imageUrl}
                      alt={img.artist ?? "Gallery image"}
                      fill
                      className="object-cover transition-opacity group-hover:opacity-90"
                      unoptimized
                    />
                    {img.artist && (
                      <Box className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                        <Text className="truncate text-[10px] text-white">
                          {img.artist}
                        </Text>
                      </Box>
                    )}
                    {img.id === selectedImageId && (
                      <Box className="absolute inset-0 bg-primary/20" />
                    )}
                  </button>
                ))}
              </div>
            </Box>
          )}
        </DialogBody>

        <DialogFooter>
          {isAdding ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAdding(false);
                  setAddImageUrl("");
                  setAddArtist("");
                  setAddError(null);
                }}
                disabled={isSaving}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleAddImage}
                disabled={isSaving || !addImageUrl.trim()}
              >
                {isSaving ? "Adding…" : "Add image"}
              </Button>
            </>
          ) : (
            <>
              {selectedImageId !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onSelect(null);
                    setIsOpen(false);
                  }}
                >
                  Remove image
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAdding(true)}
              >
                Add new image
              </Button>
            </>
          )}
        </DialogFooter>
      </Dialog>
    </>
  );
}
