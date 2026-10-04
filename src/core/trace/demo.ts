import { assembleProgram } from "../assembler";
import { executeRun } from "../cpu";
import { rippleAdd } from "../gates";
import { compileToVM } from "../compiler";
import { flattenStatements, formatExpression, parseSource, resolveSymbols, type Expression, type DereferenceTarget, type StorageSymbol } from "../parser";
import { bitwiseSlices, type ArithmeticTrace, type BitwiseTrace, type HardwareTrace } from "./hardware";
import { runtimeVMFrames, PROGRAM, SOURCE, translateVM } from "../vm";
import { ancestors, type TraceGraph, type TraceNode, type Layer } from "./graph";
export interface SourceFocus { id: string; label: string; role: "read" | "write" | "constant" | "arithmetic" | "bitwise" | "address-of" | "dereference" | "indirect-write" | "comparison" | "control" | "call" | "return" | "array"; statementId: string; symbol?: StorageSymbol; pointerSymbol?: StorageSymbol }
export interface CallFrame { id: string; name: string; lcl: number; arg: number; returnAddress: number; callCycle: number }
export function createDemo(source?: string, options: { keyboard?: number; maxCycles?: number } = {}) {
  const ast = parseSource(source ?? SOURCE), legacy = source === undefined;
  if (legacy) {
    const s = ast.statements[0];
    if (s.kind === "let") { s.target.id = "source:assign"; if (s.expression.kind === "binary") { s.expression.left.id = "source:two"; s.expression.right.id = "source:three"; s.expression.operatorId = "source:plus"; } }
  }
  const resolved = resolveSymbols(ast);
  const vm = compileToVM(resolved).map((c, i) => legacy ? { ...c, id: PROGRAM[i].id } : c);
  const { symbolic, labels, assembly, machine } = assembleProgram(translateVM(vm));
  const run = executeRun(machine.map(m => m.value), { ...options, trapAddress: labels["NS$TRAP"], trapJumps: assembly.filter((line, i) => i > 0 && assembly[i - 1].text === "@NS$TRAP").map(line => line.address) });
  let callStack: CallFrame[] = [];
  const frames = run.frames.map(frame => {
    const line = assembly[frame.romAddress], command = vm.find(c => c.id === line.vmId)!;
    const beforeStack = callStack;
    if (command.kind === "call" && frame.jump.taken && frame.jump.bits === 7) {
      const lcl = frame.after.ram[1];
      callStack = [...callStack, { id: `frame:${frame.cycleIndex}`, name: command.name, lcl, arg: frame.after.ram[2], returnAddress: frame.after.ram[lcl - 5], callCycle: frame.cycleIndex }];
    } else if (command.kind === "return" && frame.jump.taken) callStack = callStack.slice(0, -1);
    return { ...frame, machineId: machine[frame.romAddress].id, assemblyId: line.id, vmId: line.vmId,
      sourceStatementId: line.sourceStatementId!, sourceExpressionId: line.sourceExpressionId!, sourceId: line.sourceId, sourceFunction: line.sourceFunction ?? "main", callStack, beforeStack, frameId: (command.kind === "return" ? beforeStack : callStack).at(-1)?.id ?? "frame:main" };
  });
  const vmFrames = runtimeVMFrames(vm, frames);
  const allocations = vmFrames.filter(f => vm.find(v => v.id === f.id)?.kind === "array").map(f => ({ base: f.after.at(-1)!, size: frames[f.endCycle].after.ram[f.after.at(-1)! - 1], cycleIndex: f.endCycle, vmId: f.id }));
  const statements = flattenStatements(ast.statements);
  const romCycles: Record<number, number[]> = Object.create(null), statementCycles: Record<string, number[]> = Object.create(null), vmCycles: Record<string, number[]> = Object.create(null);
  for (const f of frames) { (romCycles[f.romAddress] ??= []).push(f.cycleIndex); (statementCycles[f.sourceStatementId] ??= []).push(f.cycleIndex); (vmCycles[f.vmId] ??= []).push(f.cycleIndex); }
  const graph: TraceGraph = { nodes: [], edges: [] }, ids = new Set<string>();
  const node = (id: string, layer: Layer, label: string, metadata: TraceNode["metadata"] = {}) => { if (!ids.has(id)) { ids.add(id); graph.nodes.push({ id, layer, label, metadata }); } };
  const edge = (from: string, to: string, relation: TraceGraph["edges"][number]["relation"]) => graph.edges.push({ from, to, relation });
  const focuses: SourceFocus[] = [];
  function addFocus(id: string, label: string, role: SourceFocus["role"], statementId: string, symbol = resolved.bindings[id]) {
    if (focuses.some(f => f.id === id)) return;
    const focus = { id, label, role, statementId, symbol }; focuses.push(focus); node(id, "source", label, { role, statementId, symbolId: symbol?.id });
    if (id !== statementId) edge(statementId, id, "contains"); if (symbol) edge(id, symbol.id, "allocated-as");
  }
  function expression(e: Expression | DereferenceTarget, statementId: string, role: SourceFocus["role"] = "read") {
    if (e.kind === "identifier" || e.kind === "integer") addFocus(e.id, formatExpression(e), e.kind === "integer" ? "constant" : role, statementId);
    else if (e.kind === "binary") { expression(e.left, statementId); expression(e.right, statementId); addFocus(e.operatorId, e.operator, ["+", "-"].includes(e.operator) ? "arithmetic" : ["&", "|"].includes(e.operator) ? "bitwise" : "comparison", statementId); }
    else if (e.kind === "unary") { expression(e.operand, statementId); addFocus(e.operatorId, "~", "bitwise", statementId); }
    else if (e.kind === "address-of") { expression(e.target, statementId); addFocus(e.id, formatExpression(e), "address-of", statementId, resolved.bindings[e.target.id]); }
    else if (e.kind === "dereference" || e.kind === "dereference-target") {
      expression(e.pointer, statementId); addFocus(e.id, formatExpression(e), e.kind === "dereference" ? "dereference" : "indirect-write", statementId);
      focuses.at(-1)!.pointerSymbol = resolved.bindings[e.pointer.id]; edge(e.pointer.id, e.id, "contains");
    }
    else if (e.kind === "array-access") { expression(e.array, statementId); expression(e.index, statementId); addFocus(e.id, formatExpression(e), role === "write" ? "write" : "array", statementId); }
    else {
      addFocus(e.id, e.callee.name, "call", statementId); addFocus(e.callee.id, e.callee.name, "call", statementId); edge(e.callee.id, e.id, "contains");
      e.arguments.forEach(a => expression(a, statementId));
      if (resolved.functions[e.callee.name]) edge(e.id, resolved.functions[e.callee.name].declaration.id, "invokes");
    }
  }
  for (const s of statements) {
    node(s.id, "source", `Line ${s.line} · ${s.kind}`, { line: s.line });
    if (s.kind === "let") { expression(s.target, s.id, "write"); expression(s.expression, s.id); }
    else if (s.kind === "if" || s.kind === "while") {
      addFocus(s.id, s.kind, "control", s.id); expression(s.condition, s.id); node(s.condition.id, "source", formatExpression(s.condition)); edge(s.id, s.condition.id, "contains");
      if (s.kind === "while") edge(s.id, s.condition.id, "loops-to");
      for (const child of s.kind === "if" ? [...s.then, ...s.otherwise] : s.body) edge(s.id, child.id, "contains");
    } else if (s.kind === "function") {
      addFocus(s.name.id, s.name.name, "call", s.id); s.parameters.forEach(p => expression(p, s.id));
      s.body.forEach(child => edge(s.id, child.id, "contains"));
    } else { addFocus(s.id, s.kind === "return" ? "return" : "call", s.kind === "return" ? "return" : "call", s.id); expression(s.expression, s.id); }
  }
  for (const allocation of allocations) {
    const id = `heap:${allocation.cycleIndex}`; node(id, "cpu", `Array base RAM[${allocation.base}]`, { ...allocation }); edge(allocation.vmId, id, "allocated-as");
  }
  const allSymbols = [...Object.values(resolved.symbols), ...Object.values(resolved.functions).flatMap(f => Object.values(f.symbols))];
  function memoryId(s: StorageSymbol) { return s.scope === "main" ? `memory:${s.segment}:${s.index}` : `memory:${s.scope}:${s.segment}:${s.index}`; }
  for (const s of allSymbols) {
    node(s.id, "vm", `${s.scope} · ${s.segment} ${s.index}`, { ...s }); node(memoryId(s), "cpu", s.segment === "static" ? `RAM[${1536 + s.index}]` : `RAM[${s.segment === "local" ? "LCL" : "ARG"} + ${s.index}]`, { ...s }); edge(s.id, memoryId(s), "resolved-to");
  }
  for (const c of vm) {
    node(c.id, "vm", c.label, { sourceStatementId: c.sourceStatementId, sourceExpressionId: c.sourceExpressionId, sourceFunction: c.sourceFunction });
    // Compiler-only fallback commands still originate in a real statement.
    if (!ids.has(c.sourceId)) node(c.sourceId, "source", c.label);
    edge(c.sourceId, c.id, "compiled-to");
    if (c.kind === "if-goto") edge(c.sourceStatementId!, c.id, "controls");
  }
  for (const line of assembly) { node(line.id, "assembly", line.text, { ...line }); edge(line.vmId, line.id, "translated-to"); }
  for (const line of machine) { node(line.id, "machine", line.bits, { ...line }); edge(line.assemblyId, line.id, "encoded-as"); }
  for (const f of frames) {
    const line = assembly[f.romAddress], command = vm.find(c => c.id === f.vmId)!;
    node(`cpu:${f.cycleIndex}`, "cpu", `Cycle ${f.cycleIndex} · ROM ${f.romAddress}`, { frame: f.cycleIndex, romAddress: f.romAddress, vmId: f.vmId, sourceStatementId: f.sourceStatementId, sourceExpressionId: f.sourceExpressionId, frameId: f.frameId }); edge(machine[f.romAddress].id, `cpu:${f.cycleIndex}`, "executed-by");
    const read = f.usesY && f.ySource === "M" && !f.memory.write;
    if (read || f.memory.write) {
      const boundSymbol = resolved.bindings[command.sourceId];
      const symbolAddress = boundSymbol && (boundSymbol.segment === "static" ? 1536 : f.before.ram[boundSymbol.segment === "local" ? 1 : 2]) + boundSymbol.index;
      const relevant = f.memory.address === symbolAddress || f.memory.address >= 2048 || line.pointerEffect === "read" || line.pointerEffect === "write";
      const id = `${relevant ? "memory-access" : "bus-access"}:${f.cycleIndex}`;
      node(id, "cpu", `${f.memory.write ? "Write" : "Read"} RAM[${f.memory.address}]`, { frame: f.cycleIndex, vmId: f.vmId, address: f.memory.address, value: f.memory.write ? f.memory.output : f.memory.input, write: f.memory.write }); edge(`cpu:${f.cycleIndex}`, id, "accesses");
      if (relevant) { const cellId = `ram-cell:${f.memory.address}`; node(cellId, "cpu", `RAM[${f.memory.address}]`, { address: f.memory.address }); edge(id, cellId, "accesses"); }
      const symbol = resolved.bindings[command.sourceId];
      if (symbol) {
        const base = symbol.segment === "static" ? 1536 : f.before.ram[symbol.segment === "local" ? 1 : 2];
        if (f.memory.address === base + symbol.index) edge(id, memoryId(symbol), "accesses");
      }
      if (["array-read", "array-write"].includes(command.kind) && f.memory.address === f.before.ram[13]) edge(command.sourceId, id, "resolves-to");
      if (line.pointerEffect === "read" || line.pointerEffect === "write") {
        edge(command.sourceId, id, "resolves-to");
        const storage = allSymbols.find(s => s.id === line.storageId)!;
        edge(storage.id, id, "resolves-to");
      }
    }
    if (command.kind === "return" && f.jump.taken) { node(`return:${f.cycleIndex}`, "cpu", `Resume ROM ${f.after.pc}`, { address: f.after.pc }); edge(command.id, `return:${f.cycleIndex}`, "resumes-at"); }
    if (command.kind === "call" && f.jump.taken) {
      const active = f.callStack.at(-1)!;
      node(active.id, "cpu", `${active.name} frame`, { ...active }); edge(command.id, active.id, "invokes");
      Object.values(resolved.functions[active.name].symbols).filter(s => s.segment === "argument").forEach(s => { node(`${active.id}:arg:${s.index}`, "cpu", `RAM[${active.arg + s.index}]`, { address: active.arg + s.index }); edge(s.id, `${active.id}:arg:${s.index}`, "stored-as"); });
    }
    void line;
  }
  // One hardware record per EXECUTED arithmetic occurrence, including loops and
  // recursion. Operands come from this clock edge, never a JS source evaluator.
  const pointerEvents = frames.filter(f => assembly[f.romAddress].pointerEffect).map(f => {
    const line = assembly[f.romAddress], effect = line.pointerEffect!, storage = allSymbols.find(s => s.id === line.storageId)!;
    const value = effect === "address" ? f.after.d : effect === "write" ? f.memory.output! : f.memory.input;
    const effectiveAddress = effect === "address" ? value : f.memory.address;
    const id = `pointer-address:${f.cycleIndex}`;
    node(id, "cpu", `${effect === "address" ? "Address value" : "Effective address"} ${effectiveAddress}`, { cycleIndex: f.cycleIndex, effectiveAddress, value, effect, storageId: storage.id });
    edge(line.sourceId, id, "resolves-to"); edge(memoryId(storage), id, effect === "address" ? "resolved-to" : "resolves-to"); edge(`cpu:${f.cycleIndex}`, id, "implemented-by");
    const cellId = `ram-cell:${effectiveAddress}`; node(cellId, "cpu", `RAM[${effectiveAddress}]`, { address: effectiveAddress }); edge(id, cellId, "resolves-to");
    if (effect !== "address") edge(id, `memory-access:${f.cycleIndex}`, "accesses");
    return { id, operationId: line.sourceId, vmId: line.vmId, cycleIndex: f.cycleIndex, frameId: f.frameId, storageId: storage.id, effect, effectiveAddress, value };
  });
  const additions: ArithmeticTrace[] = frames.filter(f => assembly[f.romAddress].hardwareEffect === "arithmetic").map((f, ordinal) => {
    const c = vm.find(c => c.id === f.vmId)!, left = f.memory.input, right = f.before.d, operator = c.kind === "add" ? "+" : "-";
    const hardwareRight = operator === "+" ? right : (~right & 65535), carryIn = operator === "+" ? 0 : 1;
    const addition = rippleAdd(left, hardwareRight, carryIn as 0 | 1);
    const aluId = legacy ? "alu:add" : `alu:add:${ordinal}`, gateId = legacy ? "gate:add16" : `gate:add16:${ordinal}`;
    node(aluId, "alu", operator === "+" ? "16-bit ADD" : "16-bit SUB · x + ~y + 1", { x: f.alu!.x, y: f.alu!.y, output: f.alu!.output }); edge(`cpu:${f.cycleIndex}`, aluId, "implemented-by");
    node(gateId, "gate", "16-bit ripple-carry adder"); edge(aluId, gateId, "implemented-by");
    for (const slice of addition.slices) {
      const id = legacy ? `gate:bit${slice.index}` : `${gateId}:bit${slice.index}`; node(id, "gate", `Bit ${slice.index}`, { ...slice }); edge(gateId, id, "implemented-by");
      for (const primitive of ["xor", "and", "or"] as const) {
        node(`${id}:${primitive}`, "gate", primitive.toUpperCase()); edge(id, `${id}:${primitive}`, "implemented-by");
        const nandId = legacy ? `nand:bit${slice.index}:${primitive}` : `nand:add:${ordinal}:bit${slice.index}:${primitive}`;
        node(nandId, "nand", `${primitive.toUpperCase()} from NAND`, { primitive, bit: slice.index }); edge(`${id}:${primitive}`, nandId, "implemented-by");
      }
    }
    return { class: "arithmetic", operationId: c.sourceId, vmId: c.id, address: f.cycleIndex, cycleIndex: f.cycleIndex, romAddress: f.romAddress, left, right, operator, hardwareRight, carryIn, addition, aluId, gateId };
  });
  const bitwise: BitwiseTrace[] = frames.filter(f => assembly[f.romAddress].hardwareEffect === "bitwise").map((f, ordinal) => {
    const c = vm.find(c => c.id === f.vmId)!, primitive = c.kind === "and" ? "and" : c.kind === "or" ? "or" : "not", operator = primitive === "and" ? "&" : primitive === "or" ? "|" : "~";
    const left = f.memory.input, right = primitive === "not" ? 0 : f.before.d, output = f.alu!.output;
    const slices = bitwiseSlices(primitive, left, right), aluId = `alu:bitwise:${ordinal}`, gateId = `gate:bitwise:${ordinal}`;
    node(aluId, "alu", `16-bit ${primitive.toUpperCase()}`, { class: "bitwise", primitive, left, right, output }); edge(`cpu:${f.cycleIndex}`, aluId, "implemented-by");
    node(gateId, "gate", `16 parallel ${primitive.toUpperCase()} operations`); edge(aluId, gateId, "implemented-by");
    for (const slice of slices) {
      const id = `${gateId}:bit${slice.index}`; node(id, "gate", `Bit ${slice.index} · ${primitive.toUpperCase()}`, { ...slice, primitive }); edge(gateId, id, "implemented-by");
      const nandId = `nand:bitwise:${ordinal}:bit${slice.index}:${primitive}`; node(nandId, "nand", `${primitive.toUpperCase()} from NAND`, { primitive, bit: slice.index }); edge(id, nandId, "implemented-by");
    }
    return { class: "bitwise", operationId: c.sourceId, vmId: c.id, address: f.cycleIndex, cycleIndex: f.cycleIndex, romAddress: f.romAddress, left, right, output, operator, primitive, slices, aluId, gateId };
  });
  const hardware: HardwareTrace[] = [...additions, ...bitwise].sort((a, b) => a.cycleIndex - b.cycleIndex);
  return { source: ast.source, program: ast, statements, symbols: resolved.symbols, functions: resolved.functions, bindings: resolved.bindings, allSymbols, focuses, vm, vmFrames, symbolic, labels, assembly, machine, frames, graph, additions, bitwise, hardware, pointerEvents, allocations, romCycles, statementCycles, vmCycles, stopReason: run.stopReason, keyboard: options.keyboard ?? 0,
    additionIndex: additions[0]?.address ?? -1, addition: additions[0]?.addition ?? rippleAdd(0, 0) };
}
export type Demo = ReturnType<typeof createDemo>;
export function focusedAddition(demo: Demo, operationId: string, cycleIndex?: number) { return demo.additions.find(a => a.operationId === operationId && a.cycleIndex === cycleIndex) ?? demo.additions.find(a => a.operationId === operationId); }
export function focusedHardware(demo: Demo, operationId: string, cycleIndex?: number) { return demo.hardware.find(a => a.operationId === operationId && a.cycleIndex === cycleIndex) ?? demo.hardware.find(a => a.operationId === operationId); }
export function originatingVM(demo: Demo, id: string) { const parents = ancestors(demo.graph, id); return demo.vm.find(c => parents.has(c.id)); }



