/**
 * Sanity-check script for the logistics linter (P1-BE-4 mirror).
 *
 * Loads every JSON fixture in
 * `src/utils/__fixtures__/linter-cases/` (a symlink into REMIBackend's
 * canonical fixture dir, see `.cursor/rules/logistics-linter.mdc`),
 * runs `lintSession`, and compares the produced issues against each
 * fixture's `expected` array using the same rules as the (eventual)
 * Jest test:
 *
 *   - severity, kind, affectedAppointmentIds → strict equality
 *   - humanMessage  → regex match against `humanMessageRegex`
 *   - suggestedAutoFix → deep-equal (or undefined when expected is null)
 *
 * The point of this script is to give us cross-repo verification today
 * — REMITechnician has no Jest runner installed (carried gap from
 * P0-FE-1/2/7) so the colocated `__tests__/logistics-linter.test.ts`
 * file cannot execute yet. Run this manually:
 *
 *     npx ts-node --transpile-only scripts/sanity-check-logistics-linter.ts
 *
 * Exit code is 0 on success, 1 on any failed assertion.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { lintSession } from "../src/utils/logistics-linter";
import type { LinterIssue, LinterWorldSnapshot } from "../src/utils/logistics-linter";
import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
  ReorganizationSession,
} from "../src/types/reorganization";

interface ExpectedIssue {
  severity: "error" | "warning";
  kind: LinterIssue["kind"];
  affectedAppointmentIds: number[];
  humanMessageRegex: string;
  suggestedAutoFix: ReorganizationIntentPayload | null;
}

interface Fixture {
  label: string;
  input: { session: unknown; intents: unknown; world: unknown };
  expected: ExpectedIssue[];
}

const FIXTURE_DIR = path.resolve(__dirname, "..", "src", "utils", "__fixtures__", "linter-cases");

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function runOne(name: string, fixture: Fixture): string[] {
  const failures: string[] = [];
  const session = fixture.input.session as unknown as ReorganizationSession;
  const intents = fixture.input.intents as unknown as ReorganizationIntent[];
  const world = fixture.input.world as unknown as LinterWorldSnapshot;

  const issues = lintSession(session, intents, world);
  if (issues.length !== fixture.expected.length) {
    failures.push(`  expected ${fixture.expected.length} issues, got ${issues.length}`);
    failures.push(`  actual:   ${JSON.stringify(issues, null, 2)}`);
    return failures;
  }

  for (let i = 0; i < fixture.expected.length; i += 1) {
    const actual = issues[i];
    const expected = fixture.expected[i];
    const prefix = `  issue[${i}]`;

    if (actual.severity !== expected.severity) {
      failures.push(`${prefix} severity: expected ${expected.severity}, got ${actual.severity}`);
    }
    if (actual.kind !== expected.kind) {
      failures.push(`${prefix} kind: expected ${expected.kind}, got ${actual.kind}`);
    }
    if (!deepEqual(actual.affectedAppointmentIds, expected.affectedAppointmentIds)) {
      failures.push(
        `${prefix} affectedAppointmentIds: expected ${JSON.stringify(
          expected.affectedAppointmentIds,
        )}, got ${JSON.stringify(actual.affectedAppointmentIds)}`,
      );
    }
    const re = new RegExp(expected.humanMessageRegex);
    if (!re.test(actual.humanMessage)) {
      failures.push(
        `${prefix} humanMessage did not match /${expected.humanMessageRegex}/\n    got: ${actual.humanMessage}`,
      );
    }
    if (expected.suggestedAutoFix === null) {
      if (actual.suggestedAutoFix !== undefined) {
        failures.push(
          `${prefix} suggestedAutoFix: expected undefined, got ${JSON.stringify(actual.suggestedAutoFix)}`,
        );
      }
    } else if (!deepEqual(actual.suggestedAutoFix, expected.suggestedAutoFix)) {
      failures.push(
        `${prefix} suggestedAutoFix mismatch:\n    expected: ${JSON.stringify(
          expected.suggestedAutoFix,
        )}\n    actual:   ${JSON.stringify(actual.suggestedAutoFix)}`,
      );
    }
  }

  return failures;
}

function main(): void {
  if (!fs.existsSync(FIXTURE_DIR)) {
    console.error(`fixture dir not found: ${FIXTURE_DIR}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length < 8) {
    console.error(`expected at least 8 fixtures, found ${files.length}`);
    process.exit(1);
  }

  let totalFailures = 0;
  for (const file of files) {
    const raw = fs.readFileSync(path.join(FIXTURE_DIR, file), "utf8");
    const fixture = JSON.parse(raw) as Fixture;
    const failures = runOne(file, fixture);
    if (failures.length === 0) {
      console.log(`PASS  ${file}`);
    } else {
      totalFailures += failures.length;
      console.log(`FAIL  ${file} — ${fixture.label}`);
      for (const line of failures) console.log(line);
    }
  }

  if (totalFailures > 0) {
    console.log(`\n${totalFailures} assertion(s) failed across ${files.length} fixture(s).`);
    process.exit(1);
  }
  console.log(`\nAll ${files.length} fixture(s) green.`);
}

main();
