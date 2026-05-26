"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Text } from "@/components/ui/Text";
import { Box } from "@/components/ui/Box";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { useServerAction } from "@/hooks/useServerAction";
import { useEditMode } from "@/contexts/EditModeContext";
import { useToast } from "@/components/ui/Toast";
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
  /** Server Action: search for users by query, excluding current admins. */
  searchUsersAction: (
    query: string,
  ) => Promise<{ userId: string; username: string }[]>;
};

/**
 * Admin management panel for a serial. Lists current admins and allows adding
 * or removing them. Only renders when the user is in edit mode (admin-only).
 *
 * Removal is disabled when the target admin is the sole remaining admin to
 * prevent lockout -this is enforced on both client (disabled button) and
 * server (server action guard).
 *
 * @example
 * <AdminManager
 *   serialId={serial.id}
 *   currentUserId={session.user.id}
 *   admins={admins}
 *   addAdminAction={addAdminForSerial}
 *   removeAdminAction={removeAdminForSerial}
 *   searchUsersAction={searchUsersForSerial}
 * />
 */
export function AdminManager(props: AdminManagerProps) {
  const {
    serialId: _serialId,
    currentUserId,
    admins,
    addAdminAction,
    removeAdminAction,
    searchUsersAction,
  } = props;
  void _serialId;

  const { isEditing } = useEditMode();
  const { run, isPending } = useServerAction();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);

  if (!isEditing) return null;

  const isSoleAdmin = admins.length <= 1;

  async function getOptions(query: string) {
    const users = await searchUsersAction(query);
    return users.map((u) => ({ label: u.username, value: u.username }));
  }

  function handleAdd() {
    if (!selectedUsername) return;
    const fd = new FormData();
    fd.set("username", selectedUsername);
    run(
      addAdminAction,
      fd,
      () => {
        setSelectedUsername(null);
        setAdding(false);
      },
      (err) => toast({ title: err.message, variant: "error" }),
    );
  }

  function handleRemove(userId: string) {
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
          {admins.length > 0 ? (
            <Box col className="gap-1">
              {admins.map((admin) => {
                const isSelf = admin.userId === currentUserId;
                const canRemove = !isSoleAdmin;
                return (
                  <Box
                    key={admin.userId}
                    className="items-center justify-between gap-2 py-1"
                  >
                    <Text variant="body">
                      {admin.username ?? "(no username)"}
                      {isSelf && (
                        <Text as="span" variant="label" muted>
                          {" "}
                          (you)
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
                      <Trash2Icon className="h-4 w-4" />
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
              <Combobox
                placeholder="Search users…"
                value={selectedUsername}
                onChange={setSelectedUsername}
                getOptions={getOptions}
                disabled={isPending}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleAdd}
                disabled={isPending || !selectedUsername}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setSelectedUsername(null);
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
              <PlusIcon className="h-3 w-3" />
              Add admin
            </Button>
          )}
        </CardFooter>
      </Card>
    </section>
  );
}
