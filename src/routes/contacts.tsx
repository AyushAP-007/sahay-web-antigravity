import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUp, Info, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { SahayShell } from "@/components/sahay/shell";
import {
  EmptyState,
  HelperText,
  Panel,
  SectionTitle,
} from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

export const Route = createFileRoute("/contacts")({ component: ContactsPage });

function ContactsPage() {
  return (
    <RequireUser>
      <ContactsScreen />
    </RequireUser>
  );
}

function ContactsScreen() {
  const { state, toggleContact, deleteContact } = useSahay();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const contacts = state.contacts
    .filter((contact) => contact.userId === state.user?.id)
    .sort((a, b) => a.priority - b.priority);

  return (
    <SahayShell
      title="Trusted contacts"
      subtitle="Manage who would be included in a future real alert."
    >
      <div className="flex gap-2">
        <Badge tone="info">{contacts.length} saved</Badge>
        <Badge tone="success">
          {contacts.filter((item) => item.enabled).length} enabled
        </Badge>
      </div>
      <Button asChild data-testid="add-contact-button">
        <Link to="/contact-edit" search={{ contactId: undefined }}>
          <UserPlus className="size-4" />
          Add emergency contact
        </Link>
      </Button>
      <SectionTitle title="Your contact list" />
      {contacts.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Users}
            title="No trusted contacts yet"
            detail="Add someone you trust. Notifications remain simulated in this version."
          />
        </Panel>
      ) : (
        contacts.map((contact) => (
          <Panel key={contact.id} className="gap-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-[45px] items-center justify-center rounded-2xl bg-secondary text-[17px] font-bold text-primary">
                {contact.name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-fg">{contact.name}</p>
                <p className="text-xs text-muted-fg">{contact.phone}</p>
                <p className="text-[11px] text-muted-fg">{contact.relationship}</p>
              </div>
              <div className="flex">
                <Link
                  to="/contact-edit"
                  search={{ contactId: contact.id }}
                  aria-label={`Edit ${contact.name}`}
                  className="flex size-[38px] items-center justify-center text-primary"
                >
                  <Pencil className="size-4" />
                </Link>
                <button
                  type="button"
                  aria-label={`Delete ${contact.name}`}
                  onClick={() =>
                    setPendingDelete({ id: contact.id, name: contact.name })
                  }
                  className="flex size-[38px] items-center justify-center text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ArrowUp className="size-3.5 text-primary" />
                <p className="text-[11px] font-semibold text-fg">
                  Priority {contact.priority}
                </p>
                {contact.priority === 1 ? <Badge tone="info">First</Badge> : null}
              </div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-medium text-muted-fg">
                  {contact.enabled ? "Enabled" : "Disabled"}
                </p>
                <Switch
                  checked={contact.enabled}
                  onCheckedChange={() => toggleContact(contact.id)}
                  aria-label={`Enable ${contact.name}`}
                  data-testid={`contact-enabled-${contact.id}`}
                />
              </div>
            </div>
          </Panel>
        ))
      )}
      <Panel className="flex-row items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-warning" />
        <HelperText>
          Adding or enabling a contact does not send calls or SMS. TEST SOS
          notifications are recorded as simulated only.
        </HelperText>
      </Panel>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} will be removed from this device’s demo
              profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-fg shadow-[0_0_0_1px_var(--color-danger)]"
              onClick={() => {
                if (pendingDelete) deleteContact(pendingDelete.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SahayShell>
  );
}
