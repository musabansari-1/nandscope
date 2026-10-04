import { commandForOperation, executionCursor } from "../../core/trace/execution";
import type { Demo } from "../../core/trace/demo";
import { focusedAddition, focusedHardware } from "../../core/trace/demo";
import type { Layer } from "../../core/trace/graph";
import type { Inspection, Transition } from "./state";

export interface Relationship { source: string; destination: string; kind: "identity" | "unfold" | "encode" | "control" | "component" | "slice" | "decompose" | "context"; group?: string }
export const sourceAnchor = (id: string) => id.replace(":", "-");
export const vmAnchor = (id: string) => id.replace(":", "-");
export const assemblyAnchor = (address: number) => `asm-instruction-${address}`;
export const groupAnchor = (id: string) => `asm-group-${id}`;

export function arithmeticAvailable(demo: Demo, focus: Inspection) {
  return focusedAddition(demo, focus.operationId, focus.address)?.address === focus.address;
}
export function hardwareAvailable(demo: Demo, focus: Inspection) { return focusedHardware(demo, focus.operationId, focus.address)?.cycleIndex === focus.address; }
export function visualAnchor(demo: Demo, layer: Layer, focus: Inspection): string {
  const vm = commandForOperation(demo, focus.operationId) ?? executionCursor(demo, focus.address).vm;
  if (layer === "source") return sourceAnchor(focus.operationId);
  if (layer === "vm") return vmAnchor(vm.id);
  if (layer === "assembly") return assemblyAnchor(executionCursor(demo, focus.address).romAddress);
  if (layer === "machine") return "machine-word";
  if (layer === "cpu") return "cpu-instruction";
  if (!hardwareAvailable(demo, focus)) return "arithmetic-context";
  if (layer === "alu") return "alu-add";
  if (layer === "gate") return focusedHardware(demo, focus.operationId, focus.address)?.class === "bitwise" ? "gate-bitwise" : "gate-full-adder";
  return "nand-network";
}

// Explicit relationships; neither DOM order nor the trace graph is modified for motion.
export function relationship(demo: Demo, transition: Transition): Relationship {
  const { from, to, inspection: focus } = transition;
  const lower = transition.direction === "deeper" ? from : to;
  const upper = transition.direction === "deeper" ? to : from;
  let pair: Relationship = { source: visualAnchor(demo, from, focus), destination: visualAnchor(demo, to, focus), kind: "identity" };
  // ROM inspection without an executed occurrence cannot become a CPU event.
  if (focus.inspectedRom !== undefined && !demo.romCycles[focus.inspectedRom]?.length) return { ...pair, kind: "context" };
  if (["alu", "gate", "nand"].some(layer => layer === from || layer === to) && !hardwareAvailable(demo, focus)) return { ...pair, kind: "context" };
  const vm = commandForOperation(demo, focus.operationId) ?? executionCursor(demo, focus.address).vm;
  if (lower === "source" && upper === "vm") pair = { source: sourceAnchor(focus.operationId), destination: `${vmAnchor(vm.id)}-label`, kind: "identity" };
  if (lower === "vm" && upper === "assembly") pair = { source: vmAnchor(vm.id), destination: groupAnchor(vm.id), kind: "unfold", group: vm.id };
  if (lower === "assembly" && upper === "machine") pair = { source: assemblyAnchor(executionCursor(demo, focus.address).romAddress), destination: "machine-fields", kind: "encode" };
  if (lower === "machine" && upper === "cpu") pair = { source: "machine-fields", destination: "cpu-instruction", kind: "control" };
  if (lower === "cpu" && upper === "alu") pair = { source: "cpu-alu", destination: "alu-add", kind: "component" };
  if (lower === "alu" && upper === "gate") pair = { source: "alu-add", destination: "gate-full-adder", kind: "slice" };
  const hardware = focusedHardware(demo, focus.operationId, focus.address);
  if (lower === "alu" && upper === "gate" && hardware?.class === "bitwise") pair = { source: "alu-add", destination: "gate-bitwise", kind: "component" };
  if (lower === "gate" && upper === "nand") pair = { source: `gate-${focus.primitive}`, destination: "nand-network", kind: "decompose" };
  if (lower === "gate" && upper === "nand" && hardware?.class === "bitwise") pair.source = `gate-${hardware.primitive}`;
  return transition.direction === "shallower" && (pair.kind !== "identity" || (lower === "source" && upper === "vm"))
    ? { ...pair, source: pair.destination, destination: pair.source } : pair;
}

