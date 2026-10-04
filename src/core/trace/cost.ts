import { buildNandNetwork, type NandNetwork, type Primitive } from "../gates";
import type { Demo } from "./demo";
import type { HardwareTrace } from "./hardware";

// Compose the very primitives used by fullAdder: two half adders, then OR.
// Keeping the expanded graph also lets depth follow the carry dependency.
export function arithmeticNetwork(bits = 16): NandNetwork {
  const gates: NandNetwork["gates"] = [], depths: Record<string, number> = { carry0: 0 };
  function append(kind: Primitive, a: string, b: string, prefix: string) {
    const network = buildNandNetwork(kind), names: Record<string, string> = { a, b };
    for (const gate of network.gates) {
      const id = `${prefix}:${gate.id}`, inputs = gate.inputs.map(input => names[input]) as [string, string];
      names[gate.id] = id; gates.push({ ...gate, id, inputs });
      depths[id] = 1 + Math.max(...inputs.map(input => depths[input]));
    }
    return names[network.output];
  }
  let carry = "carry0", sum = carry;
  for (let i = 0; i < bits; i++) {
    const a = `a${i}`, b = `b${i}`; depths[a] = depths[b] = 0;
    const p = append("xor", a, b, `${i}:p`), c1 = append("and", a, b, `${i}:c1`);
    sum = append("xor", p, carry, `${i}:sum`);
    const c2 = append("and", p, carry, `${i}:c2`);
    carry = append("or", c1, c2, `${i}:carry`);
  }
  return { gates, depths, output: sum, stages: Math.max(depths[sum], depths[carry]) };
}
export function hardwareCost(event: HardwareTrace) {
  const network = event.class === "arithmetic" ? arithmeticNetwork(event.addition.slices.length) : buildNandNetwork(event.primitive);
  return { nandEquivalent: network.gates.length * (event.class === "bitwise" ? event.slices.length : 1), logicalDepth: network.stages,
    fullAdderSlices: event.class === "arithmetic" ? event.addition.slices.length : 0,
    independentBits: event.class === "bitwise" ? event.slices.length : 0 };
}
export function programMetrics(demo: Demo, frames = demo.frames) {
  const cycles = new Set(frames.map(f => f.cycleIndex)), hardware = demo.hardware.filter(h => cycles.has(h.cycleIndex));
  return {
    romWords: demo.machine.length, cpuCycles: frames.length,
    uniqueROM: new Set(frames.map(f => f.romAddress)).size,
    ramReads: frames.filter(f => f.alu && f.usesY && f.ySource === "M").length,
    ramWrites: frames.filter(f => f.destinations.includes("M")).length,
    aluOperations: frames.filter(f => f.alu !== null).length,
    takenJumps: frames.filter(f => f.jump.taken).length,
    backwardJumps: frames.filter(f => f.jump.backward).length,
    maxStackDepth: Math.max(0, ...frames.flatMap(f => [f.before.ram[0] - 256, f.after.ram[0] - 256])),
    maxCallDepth: Math.max(0, ...frames.flatMap(f => [f.beforeStack.length, f.callStack.length])),
    arithmeticOperations: hardware.filter(h => h.class === "arithmetic").length,
    bitwiseOperations: hardware.filter(h => h.class === "bitwise").length,
  };
}
export function operationMetrics(demo: Demo, cycleIndex: number) {
  const visit = demo.vmFrames.find(v => v.startCycle <= cycleIndex && v.endCycle >= cycleIndex);
  if (!visit) return null;
  const frames = demo.frames.slice(visit.startCycle, visit.endCycle + 1), event = demo.hardware.find(h => h.cycleIndex >= visit.startCycle && h.cycleIndex <= visit.endCycle);
  const romWords = demo.machine.filter(m => m.vmId === visit.id).length;
  return { ...programMetrics(demo, frames), romWords, assemblyInstructions: demo.assembly.filter(a => a.vmId === visit.id).length,
    startCycle: visit.startCycle, endCycle: visit.endCycle, hardware: event ? hardwareCost(event) : null };
}
export const METRIC_LABELS: Record<keyof ReturnType<typeof programMetrics>, string> = {
  romWords: "ROM words", cpuCycles: "Executed CPU cycles", uniqueROM: "Unique ROM instructions executed", ramReads: "RAM reads", ramWrites: "RAM writes", aluOperations: "ALU operations", takenJumps: "Taken jumps", backwardJumps: "Backward jumps", maxStackDepth: "Maximum stack words above 256", maxCallDepth: "Maximum call depth", arithmeticOperations: "Source arithmetic edges", bitwiseOperations: "Source bitwise edges",
};
