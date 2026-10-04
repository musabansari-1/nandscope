import { createDemo } from "./demo";
import { EXAMPLES } from "../vm";
import type { Layer } from "./graph";

export const SHOWCASE_STEP_MS = 3000;
export function createShowcase() {
  const addition = createDemo(EXAMPLES.Arithmetic), pointer = createDemo(EXAMPLES.Pointer), branch = createDemo(EXAMPLES.Decision);
  const h = addition.hardware[0], p = pointer.pointerEvents.find(e => e.effect === "read")!;
  const address = pointer.pointerEvents.find(e => e.effect === "address")!;
  const jump = branch.frames.find(f => branch.vm.find(v => v.id === f.vmId)?.kind === "if-goto" && f.jump.bits)!;
  const steps: { title: string; caption: string; demo: typeof addition; layer: Layer; cycle: number; focus: string; kind?: "pointer" | "finish" }[] = [
    ...(["source", "vm", "assembly", "machine", "alu", "gate", "nand"] as Layer[]).map((layer, i) => ({ title: ["Start with 7 + 9.", "Make the operation explicit.", "One operation becomes instructions.", "Instructions become bits.", "The ALU produces 16.", "Carry travels between bit slices.", "At the bottom, only NAND."][i], caption: "SOURCE → SILICON · ADDITION", demo: addition, layer, cycle: h.cycleIndex, focus: h.operationId })),
    { title: "A value has an address.", caption: "POINTERS · x → address → p", demo: pointer, layer: "source", cycle: address.cycleIndex, focus: address.operationId, kind: "pointer" },
    { title: "*p follows the stored address.", caption: "POINTERS · p → RAM → value", demo: pointer, layer: "cpu", cycle: p.cycleIndex, focus: p.operationId, kind: "pointer" },
    { title: "A comparison becomes a decision.", caption: "CONTROL FLOW · COMPARISON → FALSE", demo: branch, layer: "vm", cycle: jump.cycleIndex, focus: branch.focuses.find(f => f.role === "comparison")!.id },
    { title: "The Program Counter chooses the path.", caption: "CONTROL FLOW · ACTUAL CONDITIONAL JUMP", demo: branch, layer: "cpu", cycle: jump.cycleIndex, focus: branch.focuses.find(f => f.role === "control")!.id },
    { title: "Write code. Zoom down to NAND.", caption: "NANDSCOPE · SOURCE-TO-SILICON DEBUGGER", demo: addition, layer: "nand", cycle: h.cycleIndex, focus: h.operationId, kind: "finish" },
  ];
  return steps;
}
