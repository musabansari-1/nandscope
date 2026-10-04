import type { Demo } from "./demo";
import { flattenStatements } from "../parser";
// `address` is a compatibility spelling for the runtime CYCLE index. New clients
// use cycleIndex. ROM selection is a separate action and never invents frames.
export interface ExecutionFocus { operationId: string; address: number; cycleIndex?: number; inspectedRom?: number; inspectedVM?: string; notice?: string }
export type ExecutionAction = { type: "seek"; address: number } | { type: "cycle"; cycleIndex: number } | { type: "step"; delta: number } | { type: "rom"; romAddress: number } | { type: "vm"; id: string } | { type: "operation"; id: string };
export function executionCursor(demo: Demo, cycleIndex: number) {
  const frame = demo.frames[cycleIndex], romAddress = frame.romAddress, assembly = demo.assembly[romAddress];
  const vm = demo.vm.find(c => c.id === assembly.vmId)!, group = demo.assembly.filter(l => l.vmId === vm.id);
  return { address: cycleIndex, cycleIndex, romAddress, assembly, machine: demo.machine[romAddress], frame, vm,
    statement: demo.statements.find(s => s.id === frame.sourceStatementId)!, instructionInVM: group.findIndex(l => l.address === romAddress) + 1, instructionsInVM: group.length,
    occurrence: (demo.romCycles[romAddress] ?? []).indexOf(cycleIndex) + 1, occurrences: demo.romCycles[romAddress]?.length ?? 0 };
}
export function nearestCycle(cycles: number[], current: number) { return cycles.find(c => c >= current) ?? cycles[0]; }
export function commandForOperation(demo: Demo, id: string) {
  return demo.vm.find(c => c.sourceId === id && c.controlRole === "backward")
    ?? demo.vm.find(c => c.sourceId === id && c.kind !== "label")
    ?? demo.vm.find(c => c.sourceStatementId === id && c.kind !== "label");
}
export function skippedReason(demo: Demo, romAddress: number) {
  const line = demo.assembly[romAddress];
  const jump = demo.frames.find(f => f.jump.taken && f.romAddress < romAddress && f.after.pc > romAddress && f.callStack.length === 0);
  if (jump) return `This instruction exists in ROM, but the jump at cycle ${jump.cycleIndex + 1} moved PC from ROM ${jump.romAddress} to ROM ${jump.after.pc}, past this code.`;
  return `This instruction exists in ROM and has no CPU cycle in this run. ${demo.stopReason ? "Execution stopped before reaching it." : line.sourceFunction !== "main" ? "The function was not called, or execution returned before reaching it." : "The condition selected a different path."}`;
}
export function updateExecution(demo: Demo, focus: ExecutionFocus, action: ExecutionAction): ExecutionFocus {
  const bound = (c: number) => Math.max(0, Math.min(demo.frames.length - 1, Math.trunc(Number.isFinite(c) ? c : 0)));
  const move = (c: number, operationId = focus.operationId): ExecutionFocus => ({ operationId, address: bound(c), ...(focus.cycleIndex !== undefined ? { cycleIndex: bound(c) } : {}) });
  const current = focus.cycleIndex ?? focus.address;
  if (action.type === "step") return move(current + action.delta);
  if (action.type === "seek" || action.type === "cycle") return move(action.type === "seek" ? action.address : action.cycleIndex);
  if (action.type === "rom") {
    const cycles = demo.romCycles[action.romAddress] ?? [], cycle = nearestCycle(cycles, current);
    return cycle === undefined ? { ...focus, inspectedRom: action.romAddress, notice: skippedReason(demo, action.romAddress) } : move(cycle);
  }
  const vm = action.type === "vm" ? demo.vm.find(c => c.id === action.id) : commandForOperation(demo, action.id);
  const operationId = action.type === "operation" ? action.id : focus.operationId;
  if (!vm) return { ...focus, operationId, notice: "This source concept describes a declaration or allocation; it has no standalone CPU instruction." };
  const events = [...demo.hardware.filter(a => a.vmId === vm.id).map(a => a.cycleIndex), ...demo.pointerEvents.filter(e => e.vmId === vm.id).map(e => e.cycleIndex)];
  const cycles = action.type === "operation" && events.length ? events : demo.vmFrames.filter(f => f.id === vm.id).map(f => f.startCycle);
  const cycle = action.type === "vm" && demo.frames[current].vmId === vm.id ? current : nearestCycle(cycles, current);
  if (cycle === undefined) {
    const rom = demo.assembly.find(l => l.vmId === vm.id)?.address;
    return { ...focus, operationId, inspectedVM: vm.id, inspectedRom: rom, notice: rom === undefined ? "Labels name ROM locations and do not consume a CPU cycle." : skippedReason(demo, rom) };
  }
  return move(cycle, operationId);
}
export function sourceExecutionState(demo: Demo, statementId: string, cycleIndex: number) {
  const cycles = demo.statementCycles[statementId] ?? [];
  if (demo.frames[cycleIndex].sourceStatementId === statementId) return "active";
  if (cycles.some(c => c < cycleIndex)) return "executed";
  if (cycles.length || demo.stopReason) return "not reached";
  return "skipped";
}
export function loopIteration(demo: Demo, statementId: string, cycleIndex: number) {
  const loop = demo.statements.filter(s => s.kind === "while" && (s.id === statementId || flattenStatements(s.body).some(child => child.id === statementId))).at(-1);
  if (!loop) return undefined;
  const command = demo.vm.find(v => v.sourceStatementId === loop.id && v.kind !== "label");
  return demo.vmFrames.filter(v => v.id === command?.id && v.startCycle <= cycleIndex && demo.frames[v.startCycle].frameId === demo.frames[cycleIndex].frameId).length || 1;
}

