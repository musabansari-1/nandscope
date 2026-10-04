import { describe, expect, it } from "vitest";
import { createDemo } from "./trace/demo";
import { executionCursor, sourceExecutionState, updateExecution, loopIteration } from "./trace/execution";
import { memorySnapshot } from "./trace/memory";
import { ancestors, descendants } from "./trace/graph";
import { flattenStatements, parseSource, resolveSymbols } from "./parser";
import { assembleProgram } from "./assembler";
import { initialState, executeRun } from "./cpu";
import { RAM } from "./cpu/ram";
import { LIMITS } from "./limits";
import { EXAMPLES, translateVM, type AssemblyLine, type VMInstruction } from "./vm";
import { arithmeticAvailable, relationship } from "../components/transitions/anchors";
const final = (source: string, name = "result") => { const demo = createDemo(source); expect(demo.stopReason).toBeNull(); return memorySnapshot(demo, demo.frames.length - 1).cells.find(c => c.symbol.name === name)!.value; };
describe("expanded AST and validation", () => {
  it("parses every teaching example into stable, spanned nodes", () => {
    for (const source of Object.values(EXAMPLES)) {
      const ast = parseSource(source); expect(flattenStatements(ast.statements).every(s => s.id && s.span.start >= 0 && s.span.end <= source.length && s.line > 0)).toBe(true);
      expect(resolveSymbols(ast)).toBeTruthy();
    }
    const left = parseSource("let x = 1 + 2;"), right = parseSource("let x = 7 + 9;");
    expect(left.statements[0].id).toBe(right.statements[0].id);
  });
  it("honors arithmetic precedence, parentheses and left associativity", () => {
    expect(final("let result = 9 - 3 - 2;")).toBe(4);
    expect(final("let result = (9 - (3 + 2));")).toBe(4);
    expect(final("let result = 1 + 2 < 4;")).toBe(65535);
  });
  it.each(["return 1;", "function f(a, a) { return a; } let x = f(1,2);", "function f() { function g() { return 1; } }", "function f() {} function f() {}", "let x = f();", "let x = keyboard(1);", "screen(1);", "let x = array(0);", "let x = array(65);", "let n = 2; let x = array(n);", "let x = -32769;", "let x = 32768;", "let x = x + 1;"])("rejects invalid source with lines: %s", source => expect(() => createDemo(source)).toThrow(/Line \d+:/));
  it("separates main, arguments, locals and same-named variables", () => {
    const d = createDemo("function f(x) { let y = x + 1; return y; } let x = 7; let result = f(2);");
    expect(d.symbols.x.segment).toBe("static"); expect(d.functions.f.symbols.x.segment).toBe("argument"); expect(d.functions.f.symbols.y.segment).toBe("local");
    expect(memorySnapshot(d, d.frames.length - 1).cells.map(c => c.value)).toEqual([7, 3]);
  });
});
describe("signed comparisons and wraparound on actual Hack hardware", () => {
  it.each([">", "<", "=="])("handles boundary pairs for %s without subtraction overflow", operator => {
    for (const a of [-32768, -2, -1, 0, 1, 32767]) for (const b of [-32768, -2, -1, 0, 1, 32767]) {
      const truth = operator === ">" ? a > b : operator === "<" ? a < b : a === b;
      expect(final(`let result = ${a} ${operator} ${b};`), `${a} ${operator} ${b}`).toBe(truth ? 65535 : 0);
    }
  });
  it("preserves wraparound and builds subtraction's actual adder slices", () => {
    expect(final("let result = 32767 + 1;")).toBe(32768);
    expect(final("let result = -32768 - 1;")).toBe(32767);
    const d = createDemo("let result = 7 - 9;"); const a = d.additions[0];
    expect(a.operator).toBe("-"); expect(a.addition.output).toBe(65534); expect(a.addition.slices[0].cin).toBe(1);
    expect(descendants(d.graph, a.operationId).has(a.gateId)).toBe(true);
  });
});
describe("label assembly, branches and skipped program code", () => {
  const lines = (texts: string[]) => texts.map((text, i) => ({ id: `line:${i}`, vmId: "v", sourceId: "s", text, address: i } as AssemblyLine));
  it("resolves forward/backward labels without consuming ROM and keeps provenance", () => {
    const p = assembleProgram(lines(["@END", "0;JMP", "(START)", "@START", "(END)", "D=0"]));
    expect(p.labels).toEqual({ START: 2, END: 3 }); expect(p.machine.map(m => m.text)).toEqual(["@3", "0;JMP", "@2", "D=0"]); expect(p.machine[0].sourceId).toBe("s");
  });
  it.each([["(X)", "(X)"], ["@missing"], ["(SP)"], ["(bad-label)"]].map(texts => [texts]))("rejects assembler ambiguity %s", texts => expect(() => assembleProgram(lines(texts))).toThrow());
  it.each([[7,9,9],[9,7,9]])("takes a real branch for %s > %s", (x,y,expected) => {
    const d = createDemo(`let x = ${x}; let y = ${y}; let result = 0; if (x > y) { let result = x; } else { let result = y; }`);
    expect(memorySnapshot(d, d.frames.length - 1).cells.at(-1)!.value).toBe(expected);
    const branch = d.statements.find(s => s.kind === "if")!;
    if (branch.kind !== "if") throw new Error("Expected if");
    const skipped = x > y ? branch.otherwise[0] : branch.then[0];
    expect(d.statementCycles[skipped.id]).toBeUndefined(); expect(d.vm.some(v => v.sourceStatementId === skipped.id)).toBe(true);
    const code = d.assembly.find(l => l.sourceStatementId === skipped.id)!;
    expect(d.machine[code.address]).toBeDefined(); expect(d.romCycles[code.address]).toBeUndefined(); expect(sourceExecutionState(d, skipped.id, 0)).toBe("skipped");
    const focus = updateExecution(d, { operationId: d.focuses[0].id, address: 0, cycleIndex: 0 }, { type: "rom", romAddress: code.address });
    expect(focus.cycleIndex).toBe(0); expect(focus.notice).toContain("ROM");
    expect(d.frames.some(f => f.jump.taken && f.jump.bits === 5)).toBe(x > y);
  });
  it("supports optional else, nested decisions and empty blocks", () => {
    expect(final("let result = 3; if (0) {} else { if (1) { let result = 5; } }")).toBe(5);
    expect(final("let result = 3; if (0) { let result = 5; }")).toBe(3);
  });
});
describe("cycle identity, loops and runtime memory", () => {
  const d = createDemo(EXAMPLES.Loop);
  it("executes each condition repeatedly and genuinely jumps PC backward", () => {
    expect(final(EXAMPLES.Loop, "x")).toBe(3);
    const loop = d.statements.find(s => s.kind === "while")!, conditions = d.frames.filter(f => f.sourceStatementId === loop.id && d.vm.find(v => v.id === f.vmId)?.kind === "if-goto" && f.jump.bits);
    expect(conditions.map(f => f.before.d)).toEqual([65535,65535,65535,0]);
    expect(d.frames.filter(f => d.vm.find(v => v.id === f.vmId)?.kind === "goto" && f.jump.backward)).toHaveLength(3);
    expect(conditions.map(f => memorySnapshot(d,f.cycleIndex).cells[0].value)).toEqual([0,1,2,3]);
    expect(d.romCycles[conditions[0].romAddress]).toHaveLength(4);
    expect(d.additions.map(a => loopIteration(d, d.frames[a.cycleIndex].sourceStatementId, a.cycleIndex))).toEqual([1,2,3]);
  });
  it("maps every cycle and keeps reverse seeking exact across backward jumps", () => {
    for (const f of d.frames) {
      const c = executionCursor(d, f.cycleIndex); expect(c.machine.value).toBe(f.instruction); expect(c.romAddress).toBe(f.before.pc); expect(c.statement.id).toBe(f.sourceStatementId);
      expect(ancestors(d.graph, `cpu:${f.cycleIndex}`).has(c.vm.id)).toBe(true);
    }
    const back = d.frames.find(f => f.jump.backward)!, next = executionCursor(d,back.cycleIndex+1);
    expect(next.romAddress).toBe(back.after.pc); expect(next.romAddress).toBeLessThan(back.romAddress);
    const focus = { operationId: d.additions[1].operationId, address: back.cycleIndex, cycleIndex: back.cycleIndex };
    const moved = updateExecution(d, focus, { type: "step", delta: 1 }); expect(moved.cycleIndex).toBe(back.cycleIndex+1);
    expect(updateExecution(d,moved,{ type: "step",delta:-1 })).toEqual(focus);
  });
  it("selects a while concept through its real backward jump", () => {
    const loop = d.statements.find(s => s.kind === "while")!;
    const focus = updateExecution(d,{operationId:d.focuses[0].id,address:0,cycleIndex:0},{type:"operation",id:loop.id});
    const c = executionCursor(d,focus.cycleIndex!); expect(c.vm.controlRole).toBe("backward");
    expect(d.frames.slice(focus.cycleIndex!,focus.cycleIndex!+2).some(f=>f.jump.backward)).toBe(true);
  });
  it("keeps separate hardware operands for every repeated addition occurrence", () => {
    expect(d.additions.map(a => [a.left,a.right,a.addition.output])).toEqual([[0,1,1],[1,1,2],[2,1,3]]);
    for (const a of d.additions) {
      const inspection = { operationId:a.operationId,address:a.cycleIndex,bit:1,primitive:"xor" as const };
      expect(arithmeticAvailable(d,inspection)).toBe(true);
      expect(relationship(d,{ id:1,from:"assembly",to:"machine",direction:"deeper",phase:"preparing",reducedMotion:false,inspection }).source).toBe(`asm-instruction-${a.romAddress}`);
    }
  });
  it("bounds infinite loops and recursion while retaining their real history", () => {
    const loop = createDemo("while (1) {}", { maxCycles:200 }); expect(loop.frames).toHaveLength(200); expect(loop.stopReason).toContain("infinite loop");
    const recursive = createDemo("function f(n) { return f(n + 1); } let result = f(0);", { maxCycles:1000 }); expect(recursive.frames).toHaveLength(1000); expect(recursive.stopReason).toContain("recursion");
  });
});
describe("calls, frame RAM and returns", () => {
  it("preserves argument order, initializes locals and places one result", () => {
    const source = "function sub(a,b) { let value = a - b; return value; } let result = sub(9,2);", d = createDemo(source);
    expect(final(source)).toBe(7);
    const call = d.frames.find(f => d.vm.find(v=>v.id===f.vmId)?.kind==="call" && f.jump.taken)!;
    const stack = call.callStack[0]; expect(call.after.ram[stack.arg]).toBe(9); expect(call.after.ram[stack.arg+1]).toBe(2);
    expect(call.after.ram[stack.lcl-5]).toBe(stack.returnAddress);
    const entry = d.vmFrames.find(v=>d.vm.find(c=>c.id===v.id)?.kind==="function")!;
    expect(d.frames[entry.endCycle].after.ram[stack.lcl]).toBe(0);
    const ret = d.frames.find(f=>d.vm.find(c=>c.id===f.vmId)?.kind==="return" && f.jump.taken)!;
    expect(ret.after.pc).toBe(stack.returnAddress); expect(ret.after.ram[0]).toBe(257); expect(ret.after.ram[1]).toBe(300); expect(ret.after.ram[2]).toBe(0); expect(ret.after.ram[256]).toBe(7); expect(ret.callStack).toHaveLength(0);
    expect(d.frames.at(-1)!.after.ram[0]).toBe(256);
  });
  it("supports multiple calls, nested arguments and caller local restoration", () => {
    expect(final(EXAMPLES.Nested)).toBe(10);
    expect(final("function f(a,b) { return a - b; } let x = f(9,2); let result = f(x,3);")).toBe(4);
    expect(final("function g(n) { return n + 1; } function f(n) { let held = n + 2; let other = g(n); return held + other; } let result = f(7);")).toBe(17);
  });
  it("restores THIS/THAT through an actual custom machine state", () => {
    const vm: VMInstruction[] = [ {kind:"call",name:"f",argumentCount:0,id:"c",label:"call f 0",sourceId:"s"}, {kind:"goto",name:"END",id:"end",label:"goto END",sourceId:"s"}, {kind:"function",name:"f",localCount:0,id:"fn",label:"function f 0",sourceId:"s"}, {kind:"push",segment:"constant",value:123,id:"p",label:"push constant 123",sourceId:"s"}, {kind:"pop",segment:"pointer",index:0,id:"pt",label:"pop pointer 0",sourceId:"s"}, {kind:"push",segment:"constant",value:456,id:"q",label:"push constant 456",sourceId:"s"}, {kind:"pop",segment:"pointer",index:1,id:"qt",label:"pop pointer 1",sourceId:"s"}, {kind:"push",segment:"constant",value:7,id:"v",label:"push constant 7",sourceId:"s"}, {kind:"return",id:"r",label:"return",sourceId:"s"}, {kind:"label",name:"END",id:"e",label:"label END",sourceId:"s"} ];
    const p=assembleProgram(translateVM(vm)), state=initialState(); state.ram[3]=17;state.ram[4]=29;
    const run=executeRun(p.machine.map(m=>m.value),{state}); expect(run.stopReason).toBeNull();const end=run.frames.at(-1)!.after;
    expect([end.ram[1],end.ram[2],end.ram[3],end.ram[4],end.ram[0],end.ram[256]]).toEqual([300,0,17,29,257,7]);
  });
  it("records distinct recursive frames and returns through all saved addresses", () => {
    const d=createDemo(EXAMPLES.Recursion);expect(final(EXAMPLES.Recursion)).toBe(0);
    expect(Math.max(...d.frames.map(f=>f.callStack.length))).toBe(4);
    const deepest=d.frames.find(f=>f.callStack.length===4)!;
    expect(deepest.callStack.map(s=>deepest.after.ram[s.arg])).toEqual([3,2,1,0]);
    expect(new Set(deepest.callStack.map(s=>s.lcl)).size).toBe(4);
    expect(d.frames.at(-1)!.callStack).toEqual([]);
  });
});
describe("indirect arrays, devices and memory limits", () => {
  it("allocates distinct real heap bases and reads/writes two indices", () => {
    const d=createDemo(EXAMPLES.Array), ram=d.frames.at(-1)!.after.ram;expect(ram[300]).toBe(2049); expect(ram[2048]).toBe(4);expect(ram[2049]).toBe(7);expect(ram[2050]).toBe(9);expect(ram[302]).toBe(9);
    expect(d.frames.some(f=>f.memory.write&&f.memory.address===2050&&f.memory.output===9)).toBe(true);
    expect(d.frames.some(f=>f.usesY&&f.ySource==="M"&&f.memory.address===2050&&f.memory.input===9)).toBe(true);
    expect(memorySnapshot(d,d.frames.length-1).arrays[0].cells.slice(0,2).map(c=>c.value)).toEqual([7,9]);
    const a=createDemo("let a = array(2); let b = array(3); let b[2] = 6; let result = b[2];"); expect(a.frames.at(-1)!.after.ram[301]).toBe(2052);expect(final(a.source)).toBe(6);
  });
  it("supports allocated arrays in functions and indirect parameter reads", () => {
    expect(final("function read(a,i) { return a[i]; } let a = array(2); let a[1] = 12; let result = read(a,1);")).toBe(12);
    const d = createDemo("function make() { let a = array(2); let a[1] = 12; return a; } let b = make(); let result = b[1];");
    expect(memorySnapshot(d,d.frames.length-1).arrays[0].cells[1].value).toBe(12);
  });
  it.each(["let a = array(2); let a[-1] = 7;", "let a = array(2); let result = a[2];", "screen(-1, 7);", "screen(8192, 7);"])("stops safely on invalid memory access: %s",source=> {const d=createDemo(source);expect(d.stopReason).toContain("bounds");expect(d.frames.at(-1)!.after.ram[16383]).toBe(0);});
  it("does not mistake a valid branch to the ROM end for an array trap", () => { expect(createDemo("screen(0, 1); if (1) {}").stopReason).toBeNull(); });
  it("loads KBD and writes SCREEN through the CPU bus", () => {
    const d=createDemo(EXAMPLES["I/O"],{keyboard:65}), ram=d.frames.at(-1)!.after.ram;expect(ram[300]).toBe(65);expect(ram[16394]).toBe(65);
    expect(d.frames.some(f=>f.memory.address===24576&&f.memory.input===65&&f.ySource==="M")).toBe(true);
    expect(d.frames.some(f=>f.memory.address===16394&&f.memory.write&&f.memory.output===65)).toBe(true);
    expect(memorySnapshot(d,d.frames.length-1).screen).toEqual([{address:16394,value:65}]);
  });
  it("shares pages while retaining independent RAM history",()=> {const a=new RAM();a[300]=7;const b=a.fork();b[300]=9;expect(a[300]).toBe(7);expect(b[300]).toBe(9);a[301]=4;expect(b[301]).toBe(0);expect(b.slice(300,302)).toEqual(new Uint16Array([9,0]));});
  it("stops at the stack boundary before overwriting globals", () => {
    const state = initialState(); state.ram[0] = LIMITS.stackEnd; state.ram[1536] = 99;
    const run = executeRun([0], { state }); expect(run.frames).toHaveLength(0); expect(run.stopReason).toContain("stack"); expect(state.ram[1536]).toBe(99);
  });
  it("enforces source, function, syntax, VM and ROM limits",()=> {
    expect(()=>parseSource(" ".repeat(LIMITS.sourceCharacters+1))).toThrow("characters");
    expect(()=>parseSource(Array.from({length:129},()=>"let x = 1;").join("\n"))).toThrow("128 statements");
    expect(()=>createDemo(Array.from({length:13},(_,i)=>`function f${i}() { return 0; }`).join("\n"))).toThrow("12 functions");
    expect(()=>parseSource(`let x = ${"(".repeat(30)}1${")".repeat(30)};`)).toThrow("nested");
    expect(()=>translateVM(Array.from({length:2049},()=>({kind:"add",id:"a",sourceId:"s",label:"add"})))).toThrow("VM commands");
    expect(()=>assembleProgram(Array.from({length:16001},(_,i)=>({id:String(i),vmId:"v",sourceId:"s",text:"D=0",address:i})))).toThrow("ROM instructions");
  });
  it("has complete unique provenance edges for all examples, including skipped code",()=> {
    for(const source of Object.values(EXAMPLES)) { const d=createDemo(source); const ids=new Set(d.graph.nodes.map(n=>n.id));expect(ids.size).toBe(d.graph.nodes.length);for(const e of d.graph.edges){expect(ids.has(e.from),e.from).toBe(true);expect(ids.has(e.to),e.to).toBe(true);} for(const f of d.frames){expect(f.sourceStatementId).toBeTruthy();expect(f.sourceFunction).toBeTruthy();expect(f.machineId).toBe(d.machine[f.romAddress].id);} }
  });
});




