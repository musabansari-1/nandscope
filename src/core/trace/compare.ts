import { createDemo, type Demo } from "./demo";
import { formatStatement, type Statement } from "../parser";
import { EXAMPLES } from "../vm";
import { operationMetrics, programMetrics } from "./cost";

export const COMPARE_PRESETS = {
  addition: { label: "Addition vs AND", left: "let x = 7 + 9;", right: "let x = 7 & 9;" },
  branch: { label: "if false vs if true", left: EXAMPLES.Decision, right: EXAMPLES.Decision.replace("x = 7", "x = 10") },
  pointer: { label: "Before vs after indirect write", left: "let x = 7;\nlet p = &x;\nlet y = *p;", right: "let x = 7;\nlet p = &x;\nlet *p = 9;\nlet y = *p;" },
} as const;
export type ComparePreset = keyof typeof COMPARE_PRESETS;
export interface Visit { key: string; vmId: string; startCycle: number; endCycle: number; statementId: string; ordinal: number }
export interface AlignedOperation { key: string; left?: Visit; right?: Visit }
export interface FirstDivergence { category: "source" | "VM" | "machine" | "CPU state" | "memory" | "control-flow path"; leftCycle?: number; rightCycle?: number; sourceStatementLeft?: string; sourceStatementRight?: string; leftDescription: string; rightDescription: string }

// Sibling AST sequences align by kind/target in their enclosing block. Values
// and operators may change, but IF and ELSE remain different semantic regions.
function statementShape(s: Statement) {
  return s.kind === "let" ? `let:${s.target.kind}:${s.target.kind === "identifier" ? s.target.name : s.target.kind === "dereference-target" ? s.target.pointer.name : s.target.array.name}` : s.kind === "function" ? `function:${s.name.name}` : s.kind;
}
function alignSequence<T>(left: T[], right: T[], key: (item: T) => string): { left?: T; right?: T }[] {
  // Bounded LCS for source/VM sequences. Runtime can reach 12,000 visits; the
  // unique occurrence keys let runtime alignment use a linear anchor merge.
  const rows = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) rows[i][j] = key(left[i]) === key(right[j]) ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  const result: { left?: T; right?: T }[] = []; let i = 0, j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && key(left[i]) === key(right[j])) result.push({ left: left[i++], right: right[j++] });
    else if (i < left.length && (j === right.length || rows[i + 1][j] >= rows[i][j + 1])) result.push({ left: left[i++] });
    else result.push({ right: right[j++] });
  }
  return result;
}
function statementAlignment(left: Demo, right: Demo) {
  const pairs: { key: string; left?: Statement; right?: Statement }[] = [];
  function block(l: Statement[], r: Statement[], region: string) {
    alignSequence(l, r, statementShape).forEach((pair, i) => {
      const key = `${region}/${i}`; pairs.push({ ...pair, key });
      const a = pair.left, b = pair.right;
      if (a?.kind === "if" || b?.kind === "if") { block(a?.kind === "if" ? a.then : [], b?.kind === "if" ? b.then : [], `${key}:if`); block(a?.kind === "if" ? a.otherwise : [], b?.kind === "if" ? b.otherwise : [], `${key}:else`); }
      if (a?.kind === "while" || b?.kind === "while") block(a?.kind === "while" ? a.body : [], b?.kind === "while" ? b.body : [], `${key}:loop`);
      if (a?.kind === "function" || b?.kind === "function") block(a?.kind === "function" ? a.body : [], b?.kind === "function" ? b.body : [], `${key}:function`);
    });
  }
  block(left.program.statements, right.program.statements, "main"); return pairs;
}
function visits(demo: Demo, statements: Map<string, string>) {
  const counts = new Map<string, number>(), commands = new Map(demo.vm.map(c => [c.id, c]));
  return demo.vmFrames.map(v => {
    const c = commands.get(v.id)!, f = demo.frames[v.startCycle];
    const path = f.beforeStack.map(call => call.name).join("/");
    const suffix = c.sourceId.slice(c.sourceStatementId?.length ?? 0);
    const family = ["add", "sub", "and", "or", "not", "gt", "lt", "eq"].includes(c.kind) ? "operation" : c.kind;
    const base = `${statements.get(f.sourceStatementId)}/${suffix}/${family}/${c.controlRole ?? ""}/${path}`;
    const ordinal = (counts.get(base) ?? 0) + 1; counts.set(base, ordinal);
    return { key: `${base}#${ordinal}`, vmId: v.id, startCycle: v.startCycle, endCycle: v.endCycle, statementId: f.sourceStatementId, ordinal };
  });
}
function alignVisits(left: Visit[], right: Visit[]): AlignedOperation[] {
  const positions = new Map(right.map((v, i) => [v.key, i])), pairs: AlignedOperation[] = []; let j = 0;
  for (const l of left) {
    const pos = positions.get(l.key);
    if (pos === undefined || pos < j) pairs.push({ key: l.key, left: l });
    else { while (j < pos) { const r = right[j++]; pairs.push({ key: r.key, right: r }); } pairs.push({ key: l.key, left: l, right: right[j++] }); }
  }
  while (j < right.length) { const r = right[j++]; pairs.push({ key: r.key, right: r }); }
  return pairs;
}
function eventCycle(demo: Demo, visit?: Visit) {
  if (!visit) return undefined;
  return demo.hardware.find(h => h.vmId === visit.vmId && h.cycleIndex >= visit.startCycle && h.cycleIndex <= visit.endCycle)?.cycleIndex
    ?? demo.pointerEvents.find(e => e.vmId === visit.vmId && e.cycleIndex >= visit.startCycle && e.cycleIndex <= visit.endCycle)?.cycleIndex
    ?? demo.frames.slice(visit.startCycle, visit.endCycle + 1).find(f => f.jump.bits !== 0)?.cycleIndex ?? visit.endCycle;
}
export function inspectComparison(comparison: TraceComparison, index: number) {
  const pair = comparison.operations[Math.max(0, Math.min(comparison.operations.length - 1, index))];
  return { pair, leftCycle: eventCycle(comparison.left, pair?.left), rightCycle: eventCycle(comparison.right, pair?.right) };
}
export function machineBitDiff(left?: Demo["machine"][number], right?: Demo["machine"][number]) {
  const changedBits = Array.from({ length: 16 }, (_, i) => left?.bits[i] !== right?.bits[i]);
  const lf = left?.fields, rf = right?.fields;
  const fields = lf?.kind === "C" && rf?.kind === "C" ? (["comp", "dest", "jump"] as const).filter(name => lf[name] !== rf[name]) : left?.bits !== right?.bits ? ["address / instruction kind"] : [];
  return { changedBits, fields };
}
export function compareDemos(left: Demo, right: Demo) {
  const sourcePairs = statementAlignment(left, right);
  const lmap = new Map(sourcePairs.filter(p => p.left).map(p => [p.left!.id, p.key])), rmap = new Map(sourcePairs.filter(p => p.right).map(p => [p.right!.id, p.key]));
  const operations = alignVisits(visits(left, lmap), visits(right, rmap));
  const command = (demo: Demo, visit?: Visit) => demo.vm.find(c => c.id === visit?.vmId);
  const sourceDiff = sourcePairs.filter(p => !p.left || !p.right || formatStatement(p.left) !== formatStatement(p.right));
  const vmDiff = operations.filter(p => command(left, p.left)?.label !== command(right, p.right)?.label);
  const assemblyDiff = operations.flatMap(p => {
    const l = left.assembly.filter(a => a.vmId === p.left?.vmId), r = right.assembly.filter(a => a.vmId === p.right?.vmId);
    return Array.from({ length: Math.max(l.length, r.length) }, (_, i) => ({ key: p.key, left: l[i], right: r[i] })).filter(a => a.left?.text !== a.right?.text);
  });
  const machineDiff = assemblyDiff.map(p => ({ ...p, ...machineBitDiff(p.left ? left.machine[p.left.address] : undefined, p.right ? right.machine[p.right.address] : undefined) }));
  const hardwareDiff = operations.map((p, index) => ({ index, left: left.hardware.find(h => h.cycleIndex === eventCycle(left, p.left)), right: right.hardware.find(h => h.cycleIndex === eventCycle(right, p.right)) })).filter(p => p.left?.operator !== p.right?.operator || p.left?.left !== p.right?.left || p.left?.right !== p.right?.right);
  const divergence = (p: AlignedOperation, category: FirstDivergence["category"], lc: number | undefined, rc: number | undefined, ld: string, rd: string): FirstDivergence => ({ category, leftCycle: lc, rightCycle: rc, sourceStatementLeft: p.left?.statementId, sourceStatementRight: p.right?.statementId, leftDescription: ld, rightDescription: rd });
  let firstDivergence: FirstDivergence | null = null;
  let controlFlowDivergence: FirstDivergence | null = null;
  const runtimeDiff: { index: number; left?: Visit; right?: Visit; leftOutput?: number; rightOutput?: number; leftJump?: boolean; rightJump?: boolean }[] = [];
  operations.forEach((p, index) => {
    const l = p.left, r = p.right, lv = command(left, l), rv = command(right, r);
    if (!l || !r) {
      firstDivergence ??= divergence(p, "control-flow path", l?.startCycle, r?.startCycle, lv?.label ?? "Not executed", rv?.label ?? "Not executed");
      runtimeDiff.push({ index, left: l, right: r }); return;
    }
    const lf = left.frames[l.endCycle], rf = right.frames[r.endCycle];
    const lo = left.vmFrames.find(v => v.startCycle === l.startCycle)!.after.at(-1), ro = right.vmFrames.find(v => v.startCycle === r.startCycle)!.after.at(-1);
    if (lo !== ro || lf.jump.taken !== rf.jump.taken) runtimeDiff.push({ index, left: l, right: r, leftOutput: lo, rightOutput: ro, leftJump: lf.jump.taken, rightJump: rf.jump.taken });
    if (lv?.kind === "if-goto" && rv?.kind === "if-goto" && lf.jump.taken !== rf.jump.taken) controlFlowDivergence ??= divergence(p, "control-flow path", l.endCycle, r.endCycle, `Condition ${lf.before.d ? "true" : "false"} → jump ${lf.jump.taken ? "taken" : "not taken"} · PC ${lf.romAddress} → ${lf.after.pc}`, `Condition ${rf.before.d ? "true" : "false"} → jump ${rf.jump.taken ? "taken" : "not taken"} · PC ${rf.romAddress} → ${rf.after.pc}`);
    if (firstDivergence) return;
    // First differing real clock edge within aligned VM visits. Unequal visits
    // align instructions by their relative executable offset, never global cycle.
    for (let offset = 0; offset <= Math.max(l.endCycle - l.startCycle, r.endCycle - r.startCycle); offset++) {
      const a = offset <= l.endCycle - l.startCycle ? left.frames[l.startCycle + offset] : undefined;
      const b = offset <= r.endCycle - r.startCycle ? right.frames[r.startCycle + offset] : undefined;
      if (!a || !b || a.instruction !== b.instruction || a.after.a !== b.after.a || a.after.d !== b.after.d || a.memory.output !== b.memory.output || a.jump.taken !== b.jump.taken) {
        const category = !a || !b ? "control-flow path" : a.instruction !== b.instruction ? "machine" : a.memory.output !== b.memory.output ? "memory" : "CPU state";
        firstDivergence = divergence(p, category, a?.cycleIndex, b?.cycleIndex, a ? `${left.assembly[a.romAddress].text} · A=${a.after.a} D=${a.after.d}` : "No corresponding edge", b ? `${right.assembly[b.romAddress].text} · A=${b.after.a} D=${b.after.d}` : "No corresponding edge"); break;
      }
    }
  });
  const leftMetrics = programMetrics(left), rightMetrics = programMetrics(right);
  return { left, right, sourceDiff, vmDiff, assemblyDiff, machineDiff, runtimeDiff, hardwareDiff, operations, firstDivergence: firstDivergence as FirstDivergence | null, controlFlowDivergence: controlFlowDivergence as FirstDivergence | null,
    metricsDiff: { left: leftMetrics, right: rightMetrics, delta: Object.fromEntries(Object.keys(leftMetrics).map(k => [k, rightMetrics[k as keyof typeof rightMetrics] - leftMetrics[k as keyof typeof leftMetrics]])) },
    executedStatements: { left: Object.keys(left.statementCycles), right: Object.keys(right.statementCycles) } };
}
export type TraceComparison = ReturnType<typeof compareDemos>;
export function createComparison(left: string, right: string, keyboard = 0) { return compareDemos(createDemo(left, { keyboard }), createDemo(right, { keyboard })); }
export function comparisonCosts(c: TraceComparison, index: number) {
  const inspection = inspectComparison(c, index);
  return { left: inspection.leftCycle === undefined ? null : operationMetrics(c.left, inspection.leftCycle), right: inspection.rightCycle === undefined ? null : operationMetrics(c.right, inspection.rightCycle) };
}
