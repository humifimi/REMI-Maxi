// Mirrors REMIDashboard `_lib/path-utils.ts`. Mobile re-implements the same
// dotted-path setter so each operator-mode input field can call
// `setOperatorField("balance_sheet_medium.accounts_receivable", v)` instead
// of hand-spreading nested `OperatorState` shapes at every call site.
//
// Supports dotted paths with bracketed array indexes, e.g.
//   "period.start_date"
//   "balance_sheet_medium.accounts_receivable"
//   "upcoming_obligations[0].amount"

type AnyRecord = Record<string, unknown>;

function tokenize(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  const re = /[^.[\]]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    const token = m[0];
    out.push(/^\d+$/.test(token) ? Number(token) : token);
  }
  return out;
}

export function setAtPath(
  obj: AnyRecord,
  path: string,
  value: unknown
): void {
  const tokens = tokenize(path);
  if (tokens.length === 0) return;
  let cur: AnyRecord = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i] as string;
    const nextIsIndex = typeof tokens[i + 1] === "number";
    const existing = cur[key];
    if (existing == null) {
      cur[key] = nextIsIndex ? [] : {};
    }
    cur = cur[key] as AnyRecord;
  }
  cur[tokens[tokens.length - 1] as string] = value;
}

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
