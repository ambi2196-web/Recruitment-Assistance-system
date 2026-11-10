"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "./requirement-actions";

type Action = (previous: ActionState, form: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

// Model calls can take up to a minute, so people need to see that work is happening (FR-2.4).
export function SubmitButton({ label, busyLabel, name, value, disabled }: { label: string; busyLabel?: string; name?: string; value?: string; disabled?: boolean }) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled}>
      {pending ? (busyLabel ?? "Working…") : label}
    </button>
  );
}

// React clears a form after a form action, even a failed one. Recruiters would lose
// a pasted resume to a redaction stop, so the form is submitted by hand and cleared only on success.
export function ActionForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    submitted.current = true;
    startTransition(() => formAction(data));
  }

  useEffect(() => {
    if (submitted.current && !pending && !state.error) formRef.current?.reset();
    if (!pending) submitted.current = false;
  }, [pending, state]);

  return (
    <PendingContext.Provider value={pending}>
      <form ref={formRef} onSubmit={submit} className={className}>
        {children}
        {state.error && <p className="notice error" role="alert">{state.error}</p>}
        {/* Screen readers hear that work has started, since model calls can take a minute. */}
        <span className="visually-hidden" aria-live="polite">{pending ? "Working, please wait." : ""}</span>
      </form>
    </PendingContext.Provider>
  );
}
