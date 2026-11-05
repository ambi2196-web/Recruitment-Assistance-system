import Link from "next/link";
import { redirect } from "next/navigation";
import type { RecruiterBrief } from "@/lib/agents/a2_recruiter_brief";
import type { ChangeSection } from "@/lib/brief-diff";
import { requireRole } from "@/lib/session";
import { DraftLabel } from "../../draft-label";
import { toggleHindi } from "../../requirement-actions";
import { loadRequirementView } from "../../requirement-view";

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="muted">None</span>;
  return <>{items.join(", ")}</>;
}

export default async function RecruiterRequirement({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("recruiter");
  const { requirement, checkJson, brief } = await loadRequirementView((await params).id);

  // Only the assigned recruiter may see this page, as it can show the original (FR-1.6).
  if (requirement.assignedRecruiterId !== user.id) redirect("/recruiter");

  if (!brief) {
    return (
      <>
        <h1>{requirement.title}</h1>
        <p>The brief will appear here once a stakeholder has reviewed the requirement.</p>
        <h2>Redacted text sent to the AI</h2>
        <pre className="copy-text">{requirement.redactedText}</pre>
        <details>
          <summary>Original email (restricted)</summary>
          <pre className="copy-text">{requirement.originalText}</pre>
        </details>
      </>
    );
  }

  const data = brief.json as RecruiterBrief;
  const changes = brief.whatChanged as ChangeSection[] | null;
  const filters = data.linkedin_recruiter_filters;
  const ambiguous = checkJson?.ambiguous_terms ?? [];

  return (
    <div className="brief">
      <div className="brief-head">
        <h1>{requirement.title} <span className="muted">Brief v{brief.version}</span></h1>
        <div className="button-row">
          <Link href={`/recruiter/${requirement.id}/kit`}>Screening kit</Link>
          <Link href={`/recruiter/${requirement.id}/submit`}>Add a candidate</Link>
          <form action={toggleHindi}>
            <button type="submit">Hindi: {user.hindiToggle ? "on" : "off"}</button>
          </form>
        </div>
      </div>
      <DraftLabel model={brief.model} generatedAt={brief.createdAt} />

      {requirement.sourcedOnAssumption && (
        <p className="notice ambiguity">
          <strong>Sourced on assumption.</strong> The client was not asked.
          {ambiguous.length > 0 && ` Source both readings of: ${ambiguous.map((t) => t.term).join(", ")}.`}
        </p>
      )}
      {data.open_questions.length > 0 && (
        <p className="notice ambiguity"><strong>Waiting for the client:</strong> {data.open_questions.join(" ")}</p>
      )}
      {changes && changes.length > 0 && (
        <div className="notice changed">
          <strong>What changed</strong>
          <ul className="tight">
            {changes.map((change) => (
              <li key={change.label}>
                {change.label}:
                {change.added.length > 0 && ` added ${change.added.join(", ")}.`}
                {change.removed.length > 0 && ` removed ${change.removed.join(", ")}.`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="brief-grid">
        <section>
          <h2>The project</h2>
          <ul className="tight">{data.project_story.map((line) => <li key={line}>{line}</li>)}</ul>
          {user.hindiToggle && data.hindi_lines?.project_story && <p className="muted" lang="hi">{data.hindi_lines.project_story}</p>}
          <h2>Must-haves</h2>
          <ul className="tight">{data.must_haves.map((item) => <li key={item}>{item}</li>)}</ul>
          <h2>Nice-to-haves</h2>
          <p><Chips items={data.nice_to_haves} /></p>
        </section>

        <section>
          <h2>Technology names</h2>
          {data.tech_lineage.map((tech) => (
            <p key={tech.named_in_requirement}>
              <strong>{tech.named_in_requirement}</strong>: {tech.plain_explanation} Also: <Chips items={tech.current_or_related_names} />.
            </p>
          ))}
          <h2>Similar job titles</h2>
          <p><Chips items={data.adjacent_job_titles} /></p>
          <h2>Target companies</h2>
          {data.target_companies.length === 0 && <p className="muted">None suggested</p>}
          {data.target_companies.map((company) => <p key={company.name}><strong>{company.name}</strong>: {company.why}</p>)}
        </section>

        <section>
          <h2>LinkedIn Recruiter filters</h2>
          <dl className="filters">
            <dt>Job titles</dt><dd><Chips items={filters.job_titles} /></dd>
            <dt>Skills</dt><dd><Chips items={filters.skills} /></dd>
            <dt>Locations</dt><dd><Chips items={filters.locations} /></dd>
            <dt>Years</dt><dd>{filters.years_of_experience}</dd>
            <dt>Industries</dt><dd><Chips items={filters.industries} /></dd>
            <dt>Companies</dt><dd><Chips items={filters.companies_to_include} /></dd>
          </dl>
          <p className="muted">Confidence: {data.confidence}</p>
        </section>
      </div>
    </div>
  );
}
