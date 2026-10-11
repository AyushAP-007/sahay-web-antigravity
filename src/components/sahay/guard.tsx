import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useSahay } from "@/lib/sahay/context";
import { OpeningScreen } from "./ui";

export function RequireUser({ children }: { children: ReactNode }) {
  const { ready, state } = useSahay();
  if (!ready) return <OpeningScreen />;
  if (!state.user) return <Navigate to="/" />;
  return children;
}
