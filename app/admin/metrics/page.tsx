import Link from "next/link";
import { getDb } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { requireRole } from "@/lib/session";

const percent = (value: number | null) => (value === null ? "No data yet" : `${Math.round(value * 100)}%`);
const minutes = (value: number | null) => (value === null ? "No data yet" : `${value.toFixed(1)} min`);

// One series each, so one colour and no legend. The value beside each bar is the table view.
function BarChart({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      {rows.length === 0 && <p className="muted">No data yet</p>}
      {rows.map((row) => (
        <div className="bar-row" key={row.label} title={`${row.label}: ${row.value}`}>
          <span>{row.label}</span>
          <span className="bar-track">
            {row.value > 0 && <span className="bar" style={{ width: `${(row.value / max) * 100}%` }} />}
          </span>
          <span>{row.value}</span>
        </div>
      ))}
    </figure>
  );
}

export default async function MetricsPage() {
  await requireRole("admin");
  const m = await computeMetrics(getDb());

  const rows = [
    { name: "Requirement received to brief", value: minutes(m.medianMinutesToBrief), target: "Under 10 minutes", basis: "Median, first brief only" },
    { name: "Ambiguity caught before sourcing", value: `${m.requirementsWithAmbiguity} of ${m.requirementsChecked}`, target: "Track only", basis: `Questions sent ${m.sendCount}, skipped ${m.skipCount}` },
    { name: "Submit to interview", value: percent(m.submitToInterview), target: "Better than baseline", basis: `${m.interviews} of ${m.submitted} submissions` },
    { name: "Brief errors per 10 briefs", value: m.briefErrorsPer10 === null ? "No data yet" : m.briefErrorsPer10.toFixed(1), target: "Under 2 by week 4", basis: `Flags ${m.briefErrorCount}, briefs ${m.briefCount}` },
    { name: "Outcome logged", value: percent(m.outcomeLoggedRate), target: "Over 50%", basis: `${m.outcomesLogged} of ${m.forwarded} forwarded` },
    { name: "Time from draft to submit", value: minutes(m.medianMinutesToSubmit), target: "Lower, not higher", basis: "Median. Self-report at pilot end is the real measure" },
  ];

  return (
    <>
      <p><Link href="/admin">Back to admin</Link></p>
      <h1>Pilot metrics</h1>
      <p className="muted">Team totals only. Targets are to validate, not promises.</p>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Metric</th><th>Now</th><th>Pilot target</th><th>Based on</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}><td>{row.name}</td><td><strong>{row.value}</strong></td><td>{row.target}</td><td className="muted">{row.basis}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="chart-grid">
        <BarChart title="Submissions by status" rows={m.byOutcome.map((o) => ({ label: o.label, value: o.count }))} />
        <BarChart title="Rejections by reason" rows={m.byRejectReason.map((r) => ({ label: r.label, value: r.count }))} />
        <BarChart
          title="Interviews: clarified vs skipped requirements"
          rows={m.skippedVsClarified.map((g) => ({ label: `${g.label} (of ${g.submissions})`, value: g.interviews }))}
        />
      </div>
    </>
  );
}
