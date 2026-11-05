import Link from "next/link";
import type { SubmissionDraft } from "@/lib/agents/a4_submission_drafter";
import { REJECT_EXPLANATIONS, type Flag, type FlagResolutions, type SubmissionRow } from "@/lib/submissions";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "With the stakeholder",
  forwarded: "Forwarded to the client",
  rejected: "Rejected by the stakeholder",
};

export function rejectionInPlainEnglish(reason: string) {
  const [label, ...note] = reason.split(": ");
  return [REJECT_EXPLANATIONS[label] ?? label, note.join(": ")].filter(Boolean).join(" ");
}

export function SubmissionList({ rows, basePath }: { rows: SubmissionRow[]; basePath: string }) {
  if (rows.length === 0) return <p className="muted">Nothing here yet.</p>;

  return (
    <ul className="inbox">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={`${basePath}/${row.id}`}>
            <strong>{row.candidateName}</strong>
            <span className="muted">{row.requirementTitle} · {STATUS_LABELS[row.status] ?? row.status}</span>
            {row.rejectReason && <span className="muted">{rejectionInPlainEnglish(row.rejectReason)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceTable({ evidence }: { evidence: SubmissionDraft["evidence_per_must_have"] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Must-have</th><th>Evidence</th><th>Source</th></tr></thead>
        <tbody>
          {evidence.map((item) => (
            <tr key={item.must_have}>
              <td>{item.must_have}</td>
              <td>{item.evidence}</td>
              <td className={item.source === "missing" ? "missing" : undefined}>{item.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FlagList({ flags, resolutions }: { flags: Flag[]; resolutions: FlagResolutions }) {
  if (flags.length === 0) return <p className="muted">No flags were raised.</p>;

  return (
    <ul className="tight">
      {flags.map((flag) => {
        const resolution = resolutions[flag.id];
        return (
          <li key={flag.id} className={resolution?.status === "Unresolved" ? "unresolved" : undefined}>
            {flag.detail} <strong>{resolution?.status}:</strong> {resolution?.note}
          </li>
        );
      })}
    </ul>
  );
}
