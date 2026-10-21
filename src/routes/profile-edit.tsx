import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireUser } from "@/components/sahay/guard";
import { SahayShell } from "@/components/sahay/shell";
import { Field } from "@/components/sahay/ui";
import { Button } from "@/components/ui/button";
import { useSahay } from "@/lib/sahay/context";

export const Route = createFileRoute("/profile-edit")({
  component: ProfileEditPage,
});

function ProfileEditPage() {
  return (
    <RequireUser>
      <ProfileEditScreen />
    </RequireUser>
  );
}

function ProfileEditScreen() {
  const navigate = useNavigate();
  const { state, updateProfile } = useSahay();
  const [name, setName] = useState(state.user?.name ?? "");
  const [email, setEmail] = useState(state.user?.email ?? "");
  const [phone, setPhone] = useState(state.user?.phone ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = () => {
    if (
      !name.trim() ||
      !phone.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setError("Enter a name, valid email, and phone number.");
      return;
    }
    setBusy(true);
    const saved = updateProfile({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
    });
    setBusy(false);
    if (!saved.ok) {
      setError(
        saved.reason === "duplicate"
          ? "Another profile on this device already uses that email."
          : "Profile could not be saved on this device. Please retry.",
      );
      return;
    }
    void navigate({ to: "/settings" });
  };

  return (
    <SahayShell
      title="Your profile"
      subtitle="Saved on this device."
      tabbed={false}
      backTo="/settings"
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
          label="Email address"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
        />
        <Field
          label="Phone number"
          value={phone}
          onChange={setPhone}
          placeholder="+91 98765 43210"
          type="tel"
          autoComplete="tel"
        />
        {error ? (
          <p className="text-xs font-medium text-danger">{error}</p>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void navigate({ to: "/settings" })}
        >
          Cancel
        </Button>
      </form>
    </SahayShell>
  );
}
