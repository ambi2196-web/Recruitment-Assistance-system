"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "./requirement-actions";

type Action = (previous: ActionState, form: FormData) => Promise<ActionState>;

// Model calls can take up to a minute, so people need to see that work is happening (FR-2.4).
export function SubmitButton({ label, busyLabel, name, value }: { label: string; busyLabel?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending}>
      {pending ? (busyLabel ?? "Working…") : label}
    </button>
  );
}

export function ActionForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, { error: null });
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && <p className="notice error" role="alert">{state.error}</p>}
    </form>
  );
}
