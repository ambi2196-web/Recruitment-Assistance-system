"use client";

import { useState } from "react";
import type { WrongTarget } from "@/lib/error-log";
import { reportWrongLine } from "./feedback-actions";

// Kept to a small link, because this appears on every line of a one-screen brief (FR-10.1).
export function WrongLine({ target, targetId, lineRef }: { target: WrongTarget; targetId: number; lineRef: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") return <span className="wrong-link muted no-print"> Flagged</span>;

  if (!open) {
    return (
      <button type="button" className="wrong-link no-print" aria-label={`Wrong: ${lineRef}`} onClick={() => setOpen(true)}>
        Wrong
      </button>
    );
  }

  async function send() {
    setState("busy");
    const result = await reportWrongLine({ target, targetId, lineRef, note });
    setError(result.error);
    setState(result.error ? "idle" : "done");
  }

  return (
    <span className="wrong-form no-print">
      <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What is wrong?" aria-label="What is wrong?" autoFocus />
      <button type="button" onClick={send} disabled={state === "busy"}>Send</button>
      {error && <span role="alert" className="missing">{error}</span>}
    </span>
  );
}
