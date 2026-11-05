import { configProblems } from "./lib/config";

// Runs once when the server starts, so an unsafe setup never serves a page.
export function register() {
  const problems = configProblems();
  if (problems.length > 0) {
    throw new Error(`Refusing to start: ${problems.join(" ")}`);
  }
}
