import { describe, expect, it } from "vitest";
import { createDemo } from "./trace/demo";
import { pointerPath } from "./trace/pointers";
import { memorySnapshot } from "./trace/memory";
import { ancestors, descendants, LAYERS } from "./trace/graph";
import { parseSource, resolveSymbols, type LetStatement } from "./parser";
import { assembleProgram } from "./assembler";
import { executeRun, initialState } from "./cpu";
import { buildNandNetwork, evaluateNandNetwork, type Bit } from "./gates";
import { EXAMPLES, translateVM } from "./vm";
import { updateExecution } from "./trace/execution";
import { hardwareAvailable, relationship } from "../components/transitions/anchors";

describe("minimal pointer AST and semantics", () => {
  it("parses address-taking, dereference, arithmetic and a distinct write target", () => {
    const p = parseSource("let x = 7; let p = &x; let y = *p + 1; let *p = 9;");
    const s = p.statements as LetStatement[];
    expect(s[1].expression).toMatchObject({ kind: "address-of", target: { kind: "identifier", name: "x" } });
    expect(s[2].expression).toMatchObject({ kind: "binary", operator: "+", left: { kind: "dereference", pointer: { name: "p" } } });
    expect(s[3].target).toMatchObject({ kind: "dereference-target", pointer: { name: "p" } });
    const resolved = resolveSymbols(p);
    expect(resolved.symbols.p.valueKind).toBe("pointer");
    expect(resolved.symbols.x.valueKind).toBe("value");
  });
  it.each([
    ["let x = 7; let y = *x;", "must hold an address"],
    ["let p = &missing;", "before it has been defined"],
    ["let x = 7; let p = &x; let q = &p;", "pointer-to-pointer"],
    ["let x = 7; let p = &x; let y = p + 1;", "pointer arithmetic"],
    ["let p = 300; let y = *p;", "must hold an address"],
    ["let x = 7; let p = &x; let p = 301;", "keeps its pointer"],
    ["let x = 7; let p = &x; let *p = p;", "Dereference"],
    ["let x = 7; let p = &x; let y = p[0];", "Pointer indexing"],
    ["let x = 7; if (0) { let p = &x; } let y = *p;", "must hold an address"],
    ["let x = 7; while (0) { let p = &x; } let y = *p;", "must hold an address"],
    ["function f() { let x = 7; return &x; } let p = f();", "pointer arguments/returns"],
    ["function f(a) { return a; } let x = 7; let p = f(&x);", "pointer arguments/returns"],
  ])("rejects unsupported or uninitialized pointers: %s", (source, reason) => expect(() => createDemo(source)).toThrow(reason));
  it.each(["let p = &(x);", "let p = &300;", "let x = 7; let p = &x; let y = **p;", "let x = 1 && 2;", "let x = 1 || 2;"])("rejects grammar outside this pass: %s", source => expect(() => createDemo(source)).toThrow(/Line/));
  it("merges definite addresses from both branches and preserves pointer aliases", () => {
    const d = createDemo("let x = 7; let z = 9; if (0) { let p = &x; } else { let p = &z; } let q = p; let y = *q;");
    expect(d.frames.at(-1)!.after.ram[304]).toBe(9);
    expect(d.symbols.q.valueKind).toBe("pointer");
  });
});

describe("real pointer machine accesses and provenance", () => {
  it("stores the actual address and dereferences through the CPU bus", () => {
    const d = createDemo(EXAMPLES.Pointer), ram = d.frames.at(-1)!.after.ram;
    expect(Array.from(ram.slice(300, 303))).toEqual([7, 300, 7]);
    expect(d.pointerEvents.map(e => [e.effect, e.effectiveAddress, e.value])).toEqual([["address", 300, 300], ["read", 300, 7]]);
    const e = d.pointerEvents[1], f = d.frames[e.cycleIndex];
    expect(f.memory.address).toBe(300); expect(f.before.a).toBe(300); expect(f.after.d).toBe(7);
    expect(d.assembly[f.romAddress - 1].text).toBe("A=D");
    const path = descendants(d.graph, e.operationId);
    expect(path.has(`memory-access:${e.cycleIndex}`)).toBe(true); expect(path.has("ram-cell:300")).toBe(true);
    expect(ancestors(d.graph, e.id).has(e.vmId)).toBe(true);
  });
  it("takes LCL-relative addresses from a non-default real machine state", () => {
    const d = createDemo(EXAMPLES.Pointer), p = assembleProgram(translateVM(d.vm)), state = initialState(); state.ram[1] = 420;
    const run = executeRun(p.machine.map(m => m.value), { state });
    expect(run.stopReason).toBeNull(); expect(Array.from(run.frames.at(-1)!.after.ram.slice(420, 423))).toEqual([7, 420, 7]);
  });
  it("writes through a pointer and then uses a dereference in real arithmetic", () => {
    const d = createDemo(EXAMPLES["Pointer write"]), write = d.pointerEvents.find(e => e.effect === "write")!, f = d.frames[write.cycleIndex];
    expect(f.memory).toEqual({ address: 300, input: 7, output: 9, write: true });
    expect(f.before.ram[300]).toBe(7); expect(f.after.ram[300]).toBe(9);
    expect(d.frames.at(-1)!.after.ram[302]).toBe(10);
    expect(d.additions[0]).toMatchObject({ left: 9, right: 1 });
    expect(descendants(d.graph, d.additions[0].operationId).has(d.additions[0].gateId)).toBe(true);
  });
  it("uses actual ARG/LCL addresses inside a function", () => {
    const d = createDemo("function f(a) { let x = 7; let p = &x; let q = &a; let *p = *q + 1; return *p; } let result = f(9);");
    expect(d.frames.at(-1)!.after.ram[1536]).toBe(10);
    const addresses = d.pointerEvents.filter(e => e.effect === "address");
    for (const e of addresses) { const f = d.frames[e.cycleIndex], b = d.allSymbols.find(s => s.id === e.storageId)!; expect(e.value).toBe(f.before.ram[b.segment === "argument" ? 2 : 1] + b.index); }
    expect(addresses.map(e => e.value)).toEqual([262, 256]);
  });
  it("preserves the indirect-write address while an RHS function uses scratch registers", () => {
    const d = createDemo("function value() { return 9; } let x = 7; let p = &x; let *p = value(); let y = *p;");
    expect(Array.from(d.frames.at(-1)!.after.ram.slice(1536, 1539))).toEqual([9, 1536, 9]);
    expect(d.pointerEvents.find(e => e.effect === "write")?.effectiveAddress).toBe(1536);
  });
  it("traps a global pointer accessed by a function before its address assignment", () => {
    const d = createDemo("function read() { return *p; } let result = read(); let x = 7; let p = &x;");
    expect(d.stopReason).toContain("uninitialized pointer"); expect(d.pointerEvents).toEqual([]);
    expect(d.frames.at(-1)!.jump.taken).toBe(true);
  });
  it("distinguishes x, &x, p and *p paths from explicit AST bindings", () => {
    const d = createDemo(EXAMPLES.Pointer), last = d.frames.length - 1;
    const x = d.focuses.find(f => f.role === "read" && f.label === "x")!, address = d.focuses.find(f => f.role === "address-of")!, p = d.focuses.find(f => f.role === "read" && f.label === "p")!, read = d.focuses.find(f => f.role === "dereference")!;
    expect([x, address, p, read].map(f => pointerPath(d, f.id, last).kind)).toEqual(["value", "address-of", "pointer", "dereference"]);
    expect([x, address, p, read].map(f => pointerPath(d, f.id, last).address)).toEqual([300, 300, 301, 300]);
    expect(pointerPath(d, read.id, 0).kind).toBe("pending");
    const selected = updateExecution(d, { operationId: x.id, address: 0, cycleIndex: 0 }, { type: "operation", id: read.id });
    expect(selected.cycleIndex).toBe(d.pointerEvents.find(e => e.effect === "read")!.cycleIndex);
  });
});

describe("bitwise source → machine → operation-aware hardware", () => {
  it.each([
    ["12 & 10", "and", "M=D&M", "1000000", 8],
    ["12 | 10", "or", "M=D|M", "1010101", 14],
    ["~0", "not", "M=!M", "1110001", 65535],
  ])("executes %s using real ALU controls", (source, kind, assembly, comp, expected) => {
    const d = createDemo(`let x = ${source};`), h = d.bitwise[0], machine = d.machine[h.romAddress];
    expect(d.vm.some(c => c.kind === kind)).toBe(true); expect(d.assembly[h.romAddress].text).toBe(assembly); expect(d.assembly[h.romAddress].hardwareEffect).toBe("bitwise");
    expect(machine.fields).toMatchObject({ kind: "C", comp });
    expect(d.frames[h.cycleIndex].alu!.output).toBe(expected); expect(memorySnapshot(d, d.frames.length - 1).cells[0].value).toBe(expected);
    expect(h.class).toBe("bitwise"); expect(d.additions).toEqual([]); expect(h.slices.reduce((value, s) => value | s.output << s.index, 0)).toBe(expected);
    const path = descendants(d.graph, h.operationId); expect(new Set(d.graph.nodes.filter(n => path.has(n.id)).map(n => n.layer))).toEqual(new Set(LAYERS));
    expect(d.graph.nodes.some(n => path.has(n.id) && n.label.includes("ripple"))).toBe(false);
    const selected = updateExecution(d, { operationId: d.focuses[0].id, address: 0 }, { type: "operation", id: h.operationId }); expect(selected.address).toBe(h.cycleIndex);
    expect(hardwareAvailable(d, { operationId: h.operationId, address: h.cycleIndex, bit: 0, primitive: "xor" })).toBe(true);
    const t = { id: 1, from: "alu" as const, to: "gate" as const, direction: "deeper" as const, phase: "preparing" as const, reducedMotion: false, inspection: { operationId: h.operationId, address: h.cycleIndex, bit: 0, primitive: "xor" as const } };
    expect(relationship(d, t)).toMatchObject({ kind: "component", destination: "gate-bitwise" });
    expect(relationship(d, { ...t, from: "gate", to: "nand" }).source).toBe(`gate-${kind}`);
  });
  it("honors precedence, parentheses and sixteen-bit NOT", () => {
    const result = (expression: string) => createDemo(`let x = ${expression};`).frames.at(-1)!.after.ram[300];
    expect(result("12 & 10 + 1")).toBe(8); expect(result("(12 & 10) + 1")).toBe(9);
    expect(result("12 | 10 & 3")).toBe(14); expect(result("~(12 | 10)")).toBe(65521); expect(result("~~0")).toBe(0); expect(result("~(-1)")).toBe(0);
  });
  it("retains separate per-bit records in repeated execution", () => {
    const d = createDemo("let x = 0; while (x < 3) { let y = x | 1; let x = x + 1; }");
    expect(d.bitwise.map(h => [h.left, h.right, h.output])).toEqual([[0,1,1],[1,1,1],[2,1,3]]);
    expect(d.hardware.map(h => h.class)).toEqual(["bitwise", "arithmetic", "bitwise", "arithmetic", "bitwise", "arithmetic"]);
  });
  it.each(["and", "or", "not"] as const)("matches every primitive output and its NAND construction for %s", primitive => {
    for (const a of [0,1] as Bit[]) for (const b of [0,1] as Bit[]) {
      const expr = primitive === "not" ? `~${a}` : `${a} ${primitive === "and" ? "&" : "|"} ${b}`, d = createDemo(`let x = ${expr};`), slice = d.bitwise[0].slices[0];
      const expected = primitive === "and" ? a & b : primitive === "or" ? a | b : 1 - a;
      const network = buildNandNetwork(primitive), values = evaluateNandNetwork(network, a, b);
      expect(slice.output).toBe(expected); expect(values[network.output]).toBe(expected); expect(network.gates.length).toBe(primitive === "not" ? 1 : primitive === "and" ? 2 : 3);
      expect("cin" in slice).toBe(false); expect("carry" in slice).toBe(false);
    }
    if (primitive === "not") expect(buildNandNetwork(primitive).gates[0].inputs).toEqual(["a", "a"]);
  });
});
