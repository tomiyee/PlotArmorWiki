"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useServerAction } from "@/hooks/useServerAction";
import { useEditMode } from "@/contexts/EditModeContext";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/Card";

type Admin = {
  /** The user's unique ID (text PK from the `users` table). */
  userId: string;
  /** The user's chosen display name. */
  username: string | null;
};

type AdminManagerProps = {
  /** The ID of the serial whose admins are being managed. */
  serialId: number;
  /** The ID of the currently authenticated user, used to detect self. */
  currentUserId: string;
  /** Pre-fetched list of current admins for this serial. */
  admins: Admin[];
  /** Server Action: look up by username and insert into `serial_admins`. */
  addAdminAction: (formData: FormData) => Promise<void>;
  /** Server Action: remove a user from `serial_admins` by userId. */
  removeAdminAction: (formData: FormData) => Promise<void>;
};

/**
 * Admin management panel for a serial. Lists current admins and allows adding
 * or removing them. Only renders when the user is in edit mode (admin-only).
 *
 * Removal is disabled when the target admin is the sole remaining admin to
 * prevent lockout — this is enforced on both client (disabled button) and
 * server (server action guard).
 *
 * @example
 * <AdminManager
 *   serialId={serial.id}
 *   currentUserId={session.user.id}
 *   admins={admins}
 *   addAdminAction={addAdminForSerial}
 *   removeAdminAction={removeAdminForSerial}
 * />
 */
export function AdminManager(props: AdminManagerProps) {
  const { serialId: _serialId, currentUserId, admins, addAdminAction, removeAdminAction } = props;
  void _serialId;

  const { isEditing } = useEditMode();
  const { run, isPending } = useServerAction();
  const [adding, setAdding] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isEditing) return null;

  const isSoleAdmin = admins.length <= 1;

  function handleAdd() {
    if (!newUsername.trim()) return;
    setError(null);
    const fd = new FormData();
    fd.set("username", newUsername.trim());
    run(addAdminAction, fd, () => {
      setNewUsername("");
      setAdding(false);
    });
  }

  function handleRemove(userId: string) {
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    run(removeAdminAction, fd);
  }

  return (
    <section className="flex flex-col gap-4 mt-4">
      <Card>
        <CardHeader>
          <Text variant="h2">Admins</Text>
        </CardHeader>
        <CardContent>
          {error && (
            <Text variant="body" className="text-destructive mb-2">
              {error}
            </Text>
          )}
          {admins.length > 0 ? (
            <Box col className="gap-1">
              {admins.map((admin) => {
                const isSelf = admin.userId === currentUserId;
                const canRemove = !isSoleAdmin;
                return (
                  <Box key={admin.userId} className="items-center justify-between gap-2 py-1">
                    <Text variant="body">
                      {admin.username ?? "(no username)"}
                      {isSelf && (
                        <Text as="span" variant="label" muted>
                          {" "}(you)
                        </Text>
                      )}
                    </Text>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      disabled={isPending || !canRemove}
                      title={
                        !canRemove
                          ? "Cannot remove the sole admin"
                          : `Remove ${admin.username ?? "admin"}`
                      }
                      onClick={() => handleRemove(admin.userId)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </Button>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Text muted>No admins listed.</Text>
          )}
        </CardContent>
        <CardFooter>
          {adding ? (
            <Box className="gap-2 items-center">
              <Input
                placeholder="Username…"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewUsername("");
                    setError(null);
                  }
                }}
                autoFocus
                className="flex-1"
                disabled={isPending}
              />
              <Button
                type="button"
                onClick={handleAdd}
                disabled={isPending || !newUsername.trim()}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setNewUsername("");
                  setError(null);
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </Box>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(true)}
            >
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
              Add admin
            </Button>
          )}
        </CardFooter>
      </Card>
    </section>
  );
}
