"use client";

import { useState } from "react";
import type { Flag } from "@/lib/submissions";
import { ActionForm, SubmitButton } from "../../../action-form";
import { submit } from "../../../submission-actions";

const STATUSES = ["Explained", "Confirmed", "Unresolved"];

export function ReviewForm({ submissionId, flags, summary }: { submissionId: number; flags: Flag[]; summary: string }) {
  const [marks, setMarks] = useState<Record<string, { status?: string; note?: string }>>({});

  const update = (id: string, change: { status?: string; note?: string }) =>
    setMarks((current) => ({ ...current, [id]: { ...current[id], ...change } }));

  // The server repeats this check. This just shows people what is left to do (FR-7.1).
  const remaining = flags.filter((flag) => !marks[flag.id]?.status || !marks[flag.id]?.note?.trim()).length;

  return (
    <ActionForm action={submit} className="stack">
      <input type="hidden" name="submissionId" value={submissionId} />

      <h2>Summary (you can edit this)</h2>
      <textarea name="summary" defaultValue={summary} rows={5} aria-label="Summary" />

      <h2>Flags</h2>
      {flags.length === 0 && <p className="muted">No flags were raised.</p>}
      {flags.map((flag) => (
        <fieldset key={flag.id} className="flag">
          <legend>{flag.detail}</legend>
          <input type="hidden" name="flagId" value={flag.id} />
          <div className="button-row">
            {STATUSES.map((status) => (
              <label key={status} className="radio">
                <input type="radio" name={`status-${flag.id}`} value={status} onChange={() => update(flag.id, { status })} />
                {status}
              </label>
            ))}
          </div>
          <input
            name={`note-${flag.id}`}
            placeholder="Short note"
            aria-label={`Note for: ${flag.detail}`}
            onChange={(event) => update(flag.id, { note: event.target.value })}
          />
        </fieldset>
      ))}

      <SubmitButton label="Approve and submit to stakeholder" busyLabel="Submitting…" disabled={remaining > 0} />
      {remaining > 0 && <p className="muted">{remaining} flag(s) still need a mark and a note.</p>}
    </ActionForm>
  );
}
