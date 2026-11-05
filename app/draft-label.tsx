// Required on every AI output (G6).
export function DraftLabel({ model, generatedAt }: { model: string; generatedAt: Date }) {
  return (
    <p className="notice draft-label">
      Draft — check before use. Model: {model}. Generated: {generatedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.
    </p>
  );
}
