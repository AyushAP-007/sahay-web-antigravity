import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireUser } from "@/components/sahay/guard";
import { SahayShell } from "@/components/sahay/shell";
import { Field, HelperText } from "@/components/sahay/ui";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSahay } from "@/lib/sahay/context";

export const Route = createFileRoute("/contact-edit")({
  validateSearch: (search: Record<string, unknown>) => ({
    contactId:
      typeof search.contactId === "string" ? search.contactId : undefined,
  }),
  component: ContactEditPage,
});

function ContactEditPage() {
  return (
    <RequireUser>
      <ContactEditScreen />
    </RequireUser>
  );
}

function ContactEditScreen() {
  const { contactId } = Route.useSearch();
  const navigate = useNavigate();
  const { state, addContact, updateContact, deleteContact } = useSahay();
  const contact = useMemo(
    () =>
      state.contacts.find(
        (item) => item.id === contactId && item.userId === state.user?.id,
      ),
    [contactId, state.contacts, state.user?.id],
  );
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [relationship, setRelationship] = useState(contact?.relationship ?? "");
  const [priority, setPriority] = useState(
    String(contact?.priority ?? state.contacts.filter((c) => c.userId === state.user?.id).length + 1),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const save = () => {
    const parsedPriority = Number(priority);
    if (!name.trim() || !phone.trim() || !relationship.trim()) {
      setError("Complete each field before saving.");
      return;
    }
    if (!Number.isInteger(parsedPriority) || parsedPriority < 1 || parsedPriority > 10) {
      setError("Priority must be a whole number from 1 to 10.");
      return;
    }
    setBusy(true);
    const values = {
      name: name.trim(),
      phone: phone.trim(),
      relationship: relationship.trim(),
      priority: parsedPriority,
      enabled: contact?.enabled ?? true,
    };
    const saved = contact
      ? updateContact(contact.id, values)
      : addContact(values);
    setBusy(false);
    if (!saved) {
      setError("Contact could not be saved on this device. Please retry.");
      return;
    }
    void navigate({ to: "/contacts" });
  };

  const remove = () => {
    if (!contact) return;
    setBusy(true);
    const deleted = deleteContact(contact.id);
    setBusy(false);
    if (!deleted) {
      setError("Contact could not be deleted. Please retry.");
      return;
    }
    void navigate({ to: "/contacts" });
  };

  return (
    <SahayShell
      title={contact ? "Edit contact" : "Add a contact"}
      subtitle="Contact details stay on this device."
      tabbed={false}
      backTo="/contacts"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Field
          label="Full name"
          value={name}
          onChange={setName}
          placeholder="Name"
          autoComplete="name"
        />
        <Field
          label="Phone number"
          value={phone}
          onChange={setPhone}
          placeholder="+91 98765 43210"
          type="tel"
          autoComplete="tel"
        />
        <Field
          label="Relationship"
          value={relationship}
          onChange={setRelationship}
          placeholder="e.g. Sister, friend, neighbour"
        />
        <Field
          label="Priority (1 is first)"
          value={priority}
          onChange={setPriority}
          inputMode="numeric"
          placeholder="1"
        />
        <HelperText>
          Priority sorts the list. No contact will be called or messaged.
        </HelperText>
        {error ? (
          <p className="text-xs font-medium leading-[1.4] text-danger">{error}</p>
        ) : null}
        <Button type="submit" disabled={busy} data-testid="save-contact-button">
          {busy ? "Saving…" : contact ? "Save changes" : "Save contact"}
        </Button>
        {contact ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            Delete contact
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          onClick={() => void navigate({ to: "/contacts" })}
        >
          Cancel
        </Button>
      </form>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              {contact?.name} will be removed from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-fg shadow-[0_0_0_1px_var(--color-danger)]"
              onClick={remove}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SahayShell>
  );
}
