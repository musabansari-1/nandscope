import { describe, it, expect } from "vitest";
import { createDemo } from "./trace/demo";
import { createComparison, compareDemos, COMPARE_PRESETS, inspectComparison, machineBitDiff } from "./trace/compare";
import { explainValue, type CauseNode } from "./trace/causes";
import { arithmeticNetwork, hardwareCost, operationMetrics, programMetrics } from "./trace/cost";
import { buildNandNetwork, fullAdder } from "./gates";
import { restoreShareState, serializeShareState, type ShareState } from "./trace/share";
import { createShowcase, SHOWCASE_STEP_MS } from "./trace/showcase";
import { EXAMPLES } from "./vm";
const nodes = (roots: CauseNode[]): CauseNode[] => roots.flatMap(n => [n, ...nodes(n.causes)]);
const finalCause = (demo: ReturnType<typeof createDemo>, name: string) => explainValue(demo, { address: Object.keys(demo.functions).length ? 1536 + demo.symbols[name].index : 300 + demo.symbols[name].index, cycleIndex: demo.frames.length - 1 });
describe("Independent execution comparison", () => {
  it("follows + vs & across source, VM, assembly, decoded machine fields and real hardware", () => {
    const c = createComparison(COMPARE_PRESETS.addition.left, COMPARE_PRESETS.addition.right);
    expect(c.sourceDiff[0].left?.kind).toBe("let");
    if (c.sourceDiff[0].left?.kind === "let" && c.sourceDiff[0].right?.kind === "let") {
      expect(c.sourceDiff[0].left.expression).toMatchObject({ operator: "+" }); expect(c.sourceDiff[0].right.expression).toMatchObject({ operator: "&" });
    }
    expect(c.vmDiff.some(p => c.left.vm.find(v => v.id === p.left?.vmId)?.kind === "add" && c.right.vm.find(v => v.id === p.right?.vmId)?.kind === "and")).toBe(true);
    expect(c.assemblyDiff.some(p => p.left?.text === "M=D+M" && p.right?.text === "M=D&M")).toBe(true);
    const h = c.hardwareDiff[0]; expect(h.left?.class).toBe("arithmetic"); expect(h.right?.class).toBe("bitwise");
    const selection = inspectComparison(c, h.index);
    const bits = machineBitDiff(c.left.machine[c.left.frames[selection.leftCycle!].romAddress], c.right.machine[c.right.frames[selection.rightCycle!].romAddress]);
    expect(bits.fields).toEqual(["comp"]); expect(bits.changedBits.some(Boolean)).toBe(true);
    expect(c.firstDivergence?.leftCycle).toBe(c.left.hardware[0].cycleIndex);
    expect(c.firstDivergence?.rightCycle).toBe(c.right.hardware[0].cycleIndex);
  });
  it("identifies different comparison outputs, conditional decisions and PC/source paths with unequal cycles", () => {
    const c = createComparison(COMPARE_PRESETS.branch.left, COMPARE_PRESETS.branch.right);
    expect(c.left.frames.length).not.toBe(c.right.frames.length);
    expect(c.controlFlowDivergence?.category).toBe("control-flow path");
    const l = c.left.frames[c.controlFlowDivergence!.leftCycle!], r = c.right.frames[c.controlFlowDivergence!.rightCycle!];
    expect(l.jump.taken).toBe(false); expect(r.jump.taken).toBe(true); expect(l.after.pc).not.toBe(r.after.pc);
    expect(c.runtimeDiff.some(d => d.leftOutput === 0 && d.rightOutput === 65535)).toBe(true);
    expect(c.executedStatements.left).not.toEqual(c.executedStatements.right);
    expect(c.firstDivergence!.leftCycle!).toBeLessThan(c.controlFlowDivergence!.leftCycle!);
  });
  it("aligns the same later dereference after an inserted pointer write instead of equal cycles", () => {
    const c = createComparison(COMPARE_PRESETS.pointer.left, COMPARE_PRESETS.pointer.right);
    const index = c.operations.findIndex(p => c.left.vm.find(v => v.id === p.left?.vmId)?.kind === "indirect-read" && c.right.vm.find(v => v.id === p.right?.vmId)?.kind === "indirect-read");
    expect(index).toBeGreaterThan(-1); const s = inspectComparison(c, index);
    expect(s.leftCycle).not.toBe(s.rightCycle);
    expect(c.left.frames[s.leftCycle!].memory.input).toBe(7); expect(c.right.frames[s.rightCycle!].memory.input).toBe(9);
  });
  it("keeps repeated loop occurrences semantically aligned", () => {
    const c = createComparison(EXAMPLES.Loop, EXAMPLES.Loop.replace("< 3", "< 4"));
    const pairs = c.operations.filter(p => c.left.vm.find(v => v.id === p.left?.vmId)?.kind === "add" && p.right);
    expect(pairs).toHaveLength(3); expect(pairs.map(p => p.left?.ordinal)).toEqual([1, 2, 3]);
    expect(c.operations.some(p => !p.left && c.right.vm.find(v => v.id === p.right?.vmId)?.kind === "add")).toBe(true);
  });
  it("agrees on identical independent runs and never fabricates missing occurrences", () => {
    const c = compareDemos(createDemo(EXAMPLES.Function), createDemo(EXAMPLES.Function));
    expect(c.firstDivergence).toBeNull(); expect(c.runtimeDiff).toHaveLength(0); expect(c.operations.every(p => p.left && p.right)).toBe(true);
  });
});
describe("Runtime causal dataflow", () => {
  it("explains 3 through the actual final write, add edge, prior x and constant", () => {
    const d = createDemo(EXAMPLES.Reassignment), why = finalCause(d, "x"), all = nodes(why.causes);
    expect(why.value).toBe(3); expect(why.producingWrite).toBe(d.frames.findLast(f => f.memory.write && f.memory.address === 300)!.cycleIndex);
    expect(all.some(n => n.kind === "alu" && n.cycleIndex === d.hardware[0].cycleIndex && n.value === 3)).toBe(true);
    expect(all.some(n => n.kind === "read" && n.address === 300 && n.value === 2)).toBe(true);
    expect(all.some(n => n.kind === "constant" && n.value === 1)).toBe(true);
  });
  it("explains x through p's actual indirect-write event, not a direct source assignment", () => {
    const d = createDemo("let x = 7; let p = &x; let *p = 9;"), why = finalCause(d, "x"), all = nodes(why.causes), p = d.pointerEvents.find(p => p.effect === "write")!;
    expect(why.value).toBe(9); expect(why.producingWrite).toBe(p.cycleIndex);
    expect(all.find(n => n.kind === "pointer-write")).toMatchObject({ cycleIndex: p.cycleIndex, address: 300, value: 9 });
    expect(all.some(n => n.value === 300 && n.kind === "address")).toBe(true);
    expect(all.some(n => n.kind === "constant" && n.value === 9)).toBe(true);
  });
  it("traces a returned sum through its real call frame, locals, arguments and ALU", () => {
    const d = createDemo(EXAMPLES.Function), why = finalCause(d, "result"), all = nodes(why.causes);
    expect(why.value).toBe(5);
    const ret = all.find(n => n.kind === "return"); expect(ret).toBeDefined(); expect(ret?.callCycle).toBe(d.frames.find(f => f.callStack.length)?.callStack[0].callCycle);
    expect(why.causes[0].kind).toBe("write");
    const returnFrame = d.frames[ret!.cycleIndex!]; expect(d.vm.find(v => v.id === returnFrame.vmId)?.kind).toBe("return"); expect(returnFrame.memory.address).toBe(returnFrame.before.ram[2]);
    expect(all.some(n => n.kind === "alu" && n.cycleIndex === d.hardware[0].cycleIndex)).toBe(true);
    expect(all.some(n => n.kind === "read" && n.value === 5)).toBe(true);
  });
  it("starts at the last loop iteration and supports earlier historical causes", () => {
    const d = createDemo(EXAMPLES.Loop), why = finalCause(d, "x"), write = why.causes[0];
    expect(why.value).toBe(3); expect(write.iteration).toBe(3); expect(write.label).toContain("2 → 3");
    const previous = explainValue(d, { address: 300, cycleIndex: write.previousCycle! }); expect(previous.value).toBe(2); expect(previous.causes[0].iteration).toBe(2);
  });
  it("deduplicates and bounds recursive/repeated histories", () => {
    const d = createDemo("let x = 0; while (x < 20) { let x = x + x + 1; }"), why = finalCause(d, "x");
    expect(nodes(why.causes).length).toBeLessThan(100); expect(nodes(why.causes).some(n => n.kind === "reference" || n.kind === "limit")).toBe(true);
  });
  it("uses the selected historical cycle and memory-mapped input", () => {
    const d = createDemo(EXAMPLES["I/O"], { keyboard: 65 }), why = finalCause(d, "key");
    expect(nodes(why.causes).some(n => n.kind === "input" && n.value === 65)).toBe(true);
    expect(explainValue(d, { address: 300, cycleIndex: 0 }).value).toBe(0);
  });
});
describe("Derived machine and logical costs", () => {
  it.each(["Arithmetic", "Loop", "Function", "Recursion", "Pointer write", "I/O"])("matches the actual generated/executed quantities for %s", name => {
    const d = createDemo(EXAMPLES[name]), m = programMetrics(d);
    expect(m.romWords).toBe(d.machine.length); expect(m.cpuCycles).toBe(d.frames.length);
    expect(m.uniqueROM).toBe(new Set(d.frames.map(f => f.romAddress)).size);
    expect(m.ramReads).toBe(d.frames.filter(f => f.alu && f.usesY && f.ySource === "M").length);
    expect(m.ramWrites).toBe(d.frames.filter(f => f.destinations.includes("M")).length);
    expect(m.aluOperations).toBe(d.frames.filter(f => f.alu).length);
    expect(m.takenJumps).toBe(d.frames.filter(f => f.jump.taken).length); expect(m.backwardJumps).toBe(d.frames.filter(f => f.jump.backward).length);
    expect(m.maxCallDepth).toBe(Math.max(...d.frames.flatMap(f => [f.callStack.length, f.beforeStack.length])));
    expect(m.maxStackDepth).toBe(Math.max(0, ...d.frames.flatMap(f => [f.before.ram[0] - 256, f.after.ram[0] - 256])));
  });
  it.each(["Bitwise AND", "Bitwise OR", "Bitwise NOT"])("counts the existing primitive circuit for %s", name => {
    const d = createDemo(EXAMPLES[name]), h = d.bitwise[0], cost = hardwareCost(h), network = buildNandNetwork(h.primitive);
    expect(cost.nandEquivalent).toBe(network.gates.length * h.slices.length); expect(cost.logicalDepth).toBe(network.stages); expect(cost.fullAdderSlices).toBe(0);
  });
  it("composes and evaluates the displayed full adder using its real primitive networks", () => {
    const network = arithmeticNetwork(1), count = 2 * (buildNandNetwork("xor").gates.length + buildNandNetwork("and").gates.length) + buildNandNetwork("or").gates.length;
    expect(network.gates).toHaveLength(count);
    for (const a of [0, 1] as const) for (const b of [0, 1] as const) for (const cin of [0, 1] as const) {
      const signals: Record<string, number> = { a0: a, b0: b, carry0: cin };
      for (const g of network.gates) signals[g.id] = signals[g.inputs[0]] && signals[g.inputs[1]] ? 0 : 1;
      expect(signals[network.output]).toBe(fullAdder(a, b, cin).sum);
      expect(signals[network.gates.at(-1)!.id]).toBe(fullAdder(a, b, cin).carry);
    }
    const d = createDemo(EXAMPLES.Arithmetic), h = d.hardware[0], cost = hardwareCost(h); expect(cost.nandEquivalent).toBe(count * 16);
    expect(cost.logicalDepth).toBe(Math.max(...Object.values(arithmeticNetwork().depths)));
  });
  it("measures one executed VM occurrence instead of all repetitions", () => {
    const d = createDemo(EXAMPLES.Loop), h = d.hardware[2], m = operationMetrics(d, h.cycleIndex)!;
    const visit = d.vmFrames.find(v => v.startCycle <= h.cycleIndex && v.endCycle >= h.cycleIndex)!;
    expect(m.cpuCycles).toBe(visit.endCycle - visit.startCycle + 1); expect(m.romWords).toBe(d.machine.filter(word => word.vmId === h.vmId).length);
    expect(m.arithmeticOperations).toBe(1);
  });
});
describe("Versioned bounded share links", () => {
  it.each<ShareState>([
    { mode: "guided", concept: "pointer", step: 3 },
    { mode: "explorer", source: EXAMPLES.Loop, layer: "nand", cycle: 268, focus: "source:statement:2:expr:operator", bit: 7, primitive: "and", keyboard: 65 },
    { mode: "compare", preset: "addition", source: COMPARE_PRESETS.addition.left, rightSource: COMPARE_PRESETS.addition.right, pair: 2, layer: "nand", bit: 4 },
    { mode: "showcase", step: 8 },
    { mode: "explorer", source: "// Unicode 🙂\nlet number = 23;", layer: "cpu", cycle: 2, bit: 0 },
  ])("round trips $mode", state => { const hash = serializeShareState(state); expect(restoreShareState(hash)).toEqual(state); expect(hash.length).toBeLessThan(8004); });
  it.each(["", "#ns=!!", "#ns=a", "#ns=____", `#ns=${"a".repeat(8100)}`])("falls back safely for invalid input", hash => expect(restoreShareState(hash)).toEqual({ mode: "guided" }));
  it("compresses repeated custom source and rejects invalid enums / numeric fields", () => {
    const state: ShareState = { mode: "explorer", source: `let x = 1;\n${"let x = x + 1;\n".repeat(100)}`, layer: "cpu" };
    const hash = serializeShareState(state); expect(hash.length).toBeLessThan(state.source!.length); expect(restoreShareState(hash)).toEqual(state);
    expect(() => serializeShareState({ mode: "explorer", bit: 16 })).toThrow();
  });
});
describe("Showcase real-data sequence", () => {
  it("finishes in 30–45 seconds and uses actual hardware, pointer and branch cycles", () => {
    const steps = createShowcase(); expect(steps.length * SHOWCASE_STEP_MS).toBeGreaterThanOrEqual(30000); expect(steps.length * SHOWCASE_STEP_MS).toBeLessThanOrEqual(45000);
    for (const step of steps) expect(step.demo.frames[step.cycle]).toBeDefined();
    const pointerSteps = steps.filter(s => s.kind === "pointer");
    expect(pointerSteps.map(s => s.demo.pointerEvents.find(p => p.cycleIndex === s.cycle)?.effect)).toEqual(["address", "read"]);
    expect(pointerSteps[0].cycle).toBeLessThan(pointerSteps[1].cycle);
    const pc = steps.find(s => s.caption.includes("CONDITIONAL"))!; expect(pc.demo.frames[pc.cycle].jump.bits).not.toBe(0);
    expect(steps.at(-1)?.kind).toBe("finish");
  });
});
