import { describe, expect, it } from "vitest";
import { compileToVM } from "./compiler";
import { expressionOperands, parseSource, resolveSymbols, type LetStatement } from "./parser";
import { createDemo } from "./trace/demo";
import { executionCursor, updateExecution } from "./trace/execution";
import { ancestors, descendants, LAYERS } from "./trace/graph";
import { memorySnapshot } from "./trace/memory";
import { DEFAULT_SOURCE, translateVM } from "./vm";

describe("P4 syntax and symbol resolution", () => {
  it("builds statements, operands and a real binary AST", () => {
    const program = parseSource(DEFAULT_SOURCE);
    expect(program.statements).toHaveLength(3);
    expect(program.statements.map(statement => statement.line)).toEqual([1, 2, 3]);
    expect((program.statements[2] as LetStatement).target.kind === "identifier" ? ((program.statements[2] as LetStatement).target as { name: string }).name : "").toBe("result");
    expect((program.statements[2] as LetStatement).expression).toMatchObject({ kind: "binary", operator: "+", left: { kind: "identifier", name: "x" }, right: { kind: "identifier", name: "y" } });
  });
  it.each(["let x = 7;", "let x = 7; let y = x;", "let x = 2 + 3;", "let x = 2; let y = x + 3;", "let x = 2; let y = 3 + x;", "let x = 2; let y = 3; let z = x + y;"])("supports the scoped grammar: %s", source => {
    expect(() => resolveSymbols(parseSource(source))).not.toThrow();
  });
  it.each(["let x = 2 * 3;", "let x = 8 / 2;", "let x = 8 % 2;", "let x = 32768;", "let x = 2", ""])("rejects unsupported syntax with line context: %s", source => {
    expect(() => parseSource(source)).toThrow(/Line \d+:/);
  });
  it("rejects unknown reads, forward definitions and first self-reference", () => {
    for (const source of ["let y = x + 1;", "let result = x + 3;\nlet x = 2;", "let x = x + 1;"]) expect(() => resolveSymbols(parseSource(source))).toThrow('Line 1: "x" is used before it has been defined.');
    expect(() => createDemo("let x = 2;\nlet y = missing + 1;")).toThrow('Line 2: "missing" is used before it has been defined.');
    expect(() => createDemo("let x = 2;\nlet y = 3 * x;")).toThrow("Line 2:");
  });
  it("allocates in first-definition order and reuses a slot on reassignment", () => {
    const { symbols } = resolveSymbols(parseSource(DEFAULT_SOURCE));
    expect(Object.values(symbols).map(symbol => [symbol.name, symbol.segment, symbol.index])).toEqual([["x", "local", 0], ["y", "local", 1], ["result", "local", 2]]);
    const reassignment = resolveSymbols(parseSource("let renamed = 2;\nlet renamed = renamed + 1;"));
    expect(Object.keys(reassignment.symbols)).toEqual(["renamed"]);
    expect(reassignment.symbols.renamed.index).toBe(0);
  });
  it("accepts prototype-like names without confusing them with existing symbols", () => {
    expect(() => createDemo("let x = constructor;")).toThrow("used before");
    const demo = createDemo("let __proto__ = 7; let constructor = __proto__;");
    expect(Object.keys(demo.symbols)).toEqual(["__proto__", "constructor"]);
    expect([...demo.frames.at(-1)!.after.ram.slice(300, 302)]).toEqual([7, 7]);
  });
  it("uses role-based IDs independent of numbers and distinct IDs for each occurrence", () => {
    const ids = (source: string) => (parseSource(source).statements as LetStatement[]).flatMap(statement => [statement.id, statement.target.id, ...expressionOperands(statement.expression).map(operand => operand.id), ...(statement.expression.kind === "binary" ? [statement.expression.operatorId] : [])]);
    expect(ids("let x = 2; let x = x + 1;")).toEqual(ids("let x = 77; let x = x + 9;"));
    const values = ids("let x = 2; let x = x + x;");
    expect(new Set(values).size).toBe(values.length);
    expect(parseSource("\nlet x = 7;\r\nlet y = x;").statements.map(statement => statement.line)).toEqual([2, 3]);
  });
  it("bounds the teaching program before creating large execution snapshots", () => {
    expect(() => parseSource(Array.from({ length: 129 }, () => "let x = 1;").join("\n"))).toThrow("at most 128");
  });
});

describe("P4 lowering, assembly and execution", () => {
  const demo = createDemo(DEFAULT_SOURCE);
  it("generates the actual load/store VM program", () => {
    expect(compileToVM(resolveSymbols(parseSource(DEFAULT_SOURCE))).map(command => command.label)).toEqual([
      "push constant 7", "pop local 0", "push constant 9", "pop local 1", "push local 0", "push local 1", "add", "pop local 2",
    ]);
  });
  it("uses real LCL-relative address calculation for push local 1", () => {
    const command = demo.vm.find(command => command.label === "push local 1")!;
    const lines = translateVM([command]);
    expect(lines.map(line => line.text)).toEqual(["@LCL", "D=M", "@1", "A=D+A", "D=M", "@SP", "A=M", "M=D", "@SP", "M=M+1"]);
    const group = demo.assembly.filter(line => line.vmId === command.id);
    const read = demo.frames[group[4].address];
    expect(read.before.a).toBe(301); expect(read.memory.input).toBe(9); expect(read.after.d).toBe(9);
    const after = demo.frames[group.at(-1)!.address].after;
    expect(after.ram[after.ram[0] - 1]).toBe(9);
  });
  it("preserves the pop-local address in R13 and writes the correct cell", () => {
    const command = demo.vm.at(-1)!;
    const lines = demo.assembly.filter(line => line.vmId === command.id);
    expect(lines.map(line => line.text)).toEqual(["@LCL", "D=M", "@2", "D=D+A", "@R13", "M=D", "@SP", "AM=M-1", "D=M", "@R13", "A=M", "M=D"]);
    const frame = demo.frames[lines.at(-1)!.address];
    expect(frame.before.ram[13]).toBe(302); expect(frame.before.a).toBe(302);
    expect(frame.memory).toEqual({ address: 302, input: 0, output: 16, write: true });
    expect(frame.after.ram[302]).toBe(16);
  });
  it("executes every command and matches VM stacks and locals at each boundary", () => {
    for (const vmFrame of demo.vmFrames) {
      const group = demo.assembly.filter(line => line.vmId === vmFrame.id);
      const before = demo.frames[group[0].address].before;
      const after = demo.frames[group.at(-1)!.address].after;
      expect([...before.ram.slice(256, before.ram[0])]).toEqual(vmFrame.before);
      expect([...after.ram.slice(256, after.ram[0])]).toEqual(vmFrame.after);
      vmFrame.locals.forEach((value, index) => expect(after.ram[after.ram[1] + index]).toBe(value));
    }
    expect([...demo.frames.at(-1)!.after.ram.slice(300, 303)]).toEqual([7, 9, 16]);
    expect(demo.machine.every(word => /^[01]{16}$/.test(word.bits))).toBe(true);
  });
  it("copies values, adds a literal and keeps no-addition programs valid", () => {
    const copy = createDemo("let x = 5; let y = x; let z = y + 3;");
    expect([...copy.frames.at(-1)!.after.ram.slice(300, 303)]).toEqual([5, 5, 8]);
    const simple = createDemo("let first = 7; let second = first;");
    expect(simple.additions).toEqual([]);
    expect([...simple.frames.at(-1)!.after.ram.slice(300, 302)]).toEqual([7, 7]);
  });
  it("can record a complete straight-line program longer than the historical 256-cycle guard", () => {
    const long = createDemo(Array.from({ length: 15 }, (_, index) => `let v${index} = ${index};`).join("\n"));
    expect(long.frames).toHaveLength(285);
    expect([...long.frames.at(-1)!.after.ram.slice(300, 315)]).toEqual(Array.from({ length: 15 }, (_, index) => index));
  });
  it("preserves sixteen-bit runtime wraparound, including variable reads", () => {
    const overflow = createDemo("let x = 32767 + 32767; let x = x + 2;");
    expect(overflow.additions.map(addition => addition.addition.output)).toEqual([65534, 0]);
    expect(overflow.frames.at(-1)!.after.ram[300]).toBe(0);
  });
});

describe("P4 memory timeline and provenance", () => {
  const demo = createDemo(DEFAULT_SOURCE);
  it("shows writes only at their own clock edge and reverses exactly", () => {
    const writes = demo.frames.filter(frame => frame.memory.write && frame.memory.address >= 300 && frame.memory.address <= 302);
    expect(writes.map(frame => [frame.index, frame.memory.address, frame.memory.output])).toEqual([[18, 300, 7], [37, 301, 9], [74, 302, 16]]);
    for (const frame of writes) {
      const previous = memorySnapshot(demo, frame.index - 1);
      const current = memorySnapshot(demo, frame.index);
      const cell = current.cells.find(cell => cell.address === frame.memory.address)!;
      expect(previous.cells.find(previousCell => previousCell.address === cell.address)!.value).toBe(0);
      expect(cell.beforeValue).toBe(0); expect(cell.value).toBe(frame.memory.output);
      expect(cell.written).toBe(true); expect(cell.changed).toBe(true);
      expect(memorySnapshot(demo, frame.index - 1)).toEqual(previous);
    }
    expect(memorySnapshot(demo, 0).cells.map(cell => cell.value)).toEqual([0, 0, 0]);
    expect(memorySnapshot(demo, 36).cells.map(cell => cell.value)).toEqual([7, 0, 0]);
  });
  it("uses the simulator's LCL rather than a view constant", () => {
    const frame = demo.frames[0];
    const previousBase = frame.after.ram[1];
    try {
      frame.after.ram[1] = 400; frame.after.ram[400] = 42;
      expect(memorySnapshot(demo, 0).cells[0]).toMatchObject({ address: 400, value: 42 });
    } finally { frame.after.ram[1] = previousBase; frame.after.ram[400] = 0; }
  });
  it("shows one reassigned slot changing from 2 to 3, with independent snapshots", () => {
    const reassigned = createDemo("let x = 2; let x = x + 1;");
    expect(Object.keys(reassigned.symbols)).toEqual(["x"]);
    const writes = reassigned.frames.filter(frame => frame.memory.write && frame.memory.address === 300);
    expect(writes.map(frame => [frame.before.ram[300], frame.after.ram[300]])).toEqual([[0, 2], [2, 3]]);
    expect(memorySnapshot(reassigned, writes[1].index - 1).cells[0].value).toBe(2);
    expect(memorySnapshot(reassigned, writes[1].index).cells[0].value).toBe(3);
    expect(writes[0].after.ram).not.toBe(writes[1].after.ram);
  });
  it("maps every CPU frame through machine, assembly and VM to its owning statement", () => {
    for (const frame of demo.frames) {
      const cursor = executionCursor(demo, frame.index);
      const command = cursor.vm;
      expect(frame.machineId).toBe(cursor.machine.id); expect(frame.assemblyId).toBe(cursor.assembly.id); expect(frame.vmId).toBe(command.id);
      expect(frame.sourceStatementId).toBe(cursor.statement.id);
      expect(frame.sourceExpressionId).toBe(command.sourceExpressionId);
      expect(cursor.machine.sourceStatementId).toBe(cursor.statement.id);
      const parents = ancestors(demo.graph, `cpu:${frame.index}`);
      for (const id of [cursor.machine.id, cursor.assembly.id, command.id, command.sourceId]) expect(parents.has(id)).toBe(true);
    }
  });
  it("connects variable occurrences to storage, real VM operations and CPU accesses", () => {
    for (const focus of demo.focuses.filter(focus => focus.symbol)) {
      const path = descendants(demo.graph, focus.id);
      const command = demo.vm.find(command => command.sourceId === focus.id)!;
      expect(path.has(focus.symbol!.id)).toBe(true);
      expect(path.has(`memory:local:${focus.symbol!.index}`)).toBe(true);
      expect(path.has(command.id)).toBe(true);
      const accesses = demo.graph.nodes.filter(node => node.id.startsWith("memory-access:") && node.metadata.vmId === command.id);
      expect(accesses).toHaveLength(1); expect(path.has(accesses[0].id)).toBe(true);
      expect(accesses[0].metadata.write).toBe(focus.role === "write");
    }
  });
  it("keeps each source + connected to its own real adder and NAND network", () => {
    const multiple = createDemo("let x = 2 + 3; let y = x + 9;");
    expect(multiple.additions.map(addition => [addition.left, addition.right, addition.addition.output])).toEqual([[2, 3, 5], [5, 9, 14]]);
    for (const addition of multiple.additions) {
      const path = descendants(multiple.graph, addition.operationId);
      expect(new Set(multiple.graph.nodes.filter(node => path.has(node.id)).map(node => node.layer))).toEqual(new Set(LAYERS));
      expect(path.has(addition.aluId)).toBe(true); expect(path.has(addition.gateId)).toBe(true);
      expect(multiple.frames[addition.address].alu!.output).toBe(addition.addition.output);
      const focus = updateExecution(multiple, { operationId: multiple.focuses[0].id, address: 0 }, { type: "operation", id: addition.operationId });
      expect(focus.address).toBe(addition.address);
      expect(updateExecution(multiple, focus, { type: "step", delta: -1 }).operationId).toBe(addition.operationId);
    }
    expect(new Set(multiple.graph.nodes.map(node => node.id)).size).toBe(multiple.graph.nodes.length);
    for (const edge of multiple.graph.edges) { expect(multiple.graph.nodes.some(node => node.id === edge.from)).toBe(true); expect(multiple.graph.nodes.some(node => node.id === edge.to)).toBe(true); }
  });
});

