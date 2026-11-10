import { describe, expect, it } from "vitest";
import type { RequirementCheck } from "./agents/a1_requirement_check";
import type { RecruiterBrief } from "./agents/a2_recruiter_brief";
import { averageWords, readSummary, renderReport, scoreCase, summarise, worseThan, type GoldenCase, type Summary } from "./eval";
import { mockOutput } from "./mock-outputs";

const golden = (terms: string[]): GoldenCase => ({
  id: "G1",
  industry: "energy services",
  text: "We need help with our ontology and semantic layer. Must know OWL.",
  what_client_wanted: "A technical ontologist",
  expected_ambiguous_terms: terms,
});
const check = mockOutput("a1_requirement_check", "ontology") as RequirementCheck;
const brief = mockOutput("a2_recruiter_brief", "ontology") as RecruiterBrief;

describe("evaluation scoring (section 13)", () => {
  it.each([
    [["ontology"], "yes"],
    [["Ontology", "semantic layer"], "partly"],
    [["knowledge graph vendor"], "no"],
    [[], "none expected"],
  ])("rates ambiguity %j as %s", (terms, expected) => {
    expect(scoreCase(golden(terms), check, brief).ambiguity).toBe(expected);
  });

  it("lists names that the requirement never mentioned, for a human to judge", () => {
    const result = scoreCase(golden(["ontology"]), check, brief);
    expect(result.namesToCheck).toContain("knowledge graph");
    expect(result.namesToCheck).not.toContain("Ontology");
  });

  it("measures sentence length", () => {
    expect(averageWords(["One two three. One two three four five."])).toBe(4);
    expect(averageWords([])).toBe(0);
  });

  it("flags a brief too long for one screen", () => {
    const long = { ...brief, must_haves: Array(40).fill("A long must-have line that takes a lot of room on the screen") };
    expect(scoreCase(golden([]), check, long).fitsOneScreen).toBe(false);
  });

  it("counts failed cases apart from scored ones", () => {
    const summary = summarise([scoreCase(golden(["ontology"]), check, brief), { id: "G2", error: "Stopped" }]);
    expect(summary).toMatchObject({ cases: 2, errors: 1, ambiguityYes: 1 });
  });
});

describe("never ship a worse prompt", () => {
  const base: Summary = { cases: 10, errors: 0, ambiguityYes: 6, ambiguityPartly: 2, ambiguityNo: 2, namesToCheck: 5, averageSentenceWords: 14, notFittingOneScreen: 0, booleanFilters: 0 };

  it("passes an equal or better run", () => {
    expect(worseThan(base, base)).toEqual([]);
    expect(worseThan(base, { ...base, ambiguityYes: 7, ambiguityNo: 1 })).toEqual([]);
  });

  it("names each way a run got worse", () => {
    expect(worseThan(base, { ...base, ambiguityYes: 5, namesToCheck: 9, averageSentenceWords: 22 })).toEqual([
      "Fewer ambiguities fully caught",
      "More unfamiliar names to check",
      "Sentences got longer",
    ]);
  });

  it("reads the summary back from a saved report", () => {
    const report = renderReport({ set: "golden", date: new Date(), provider: "mock", model: "m", promptVersions: [], results: [], summary: base, worse: null, costUsd: 0 });
    expect(readSummary(report)).toEqual(base);
    expect(report).toContain("First run for this set");
  });
});
