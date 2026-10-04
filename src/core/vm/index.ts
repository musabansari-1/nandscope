import { LIMITS } from "../limits";
import { assembleProgram } from "../assembler";
import { executeProgram, type ExecutionFrame } from "../cpu";
export interface Provenance { sourceStatementId?: string; sourceExpressionId?: string; sourceFunction?: string; controlId?: string; controlRole?: "backward" | "branch" | "exit" | "label" }
interface VMCommand extends Provenance { id: string; label: string; sourceId: string }
export type Segment = "local" | "argument" | "static" | "temp" | "pointer";
export type VMInstruction = VMCommand & (
  | { kind: "push"; segment: "constant"; value: number }
  | { kind: "push" | "pop"; segment: Segment; index: number; variableName?: string }
  | { kind: "add" | "sub" | "gt" | "lt" | "eq" | "return" | "drop" | "keyboard" | "screen" | "array-read" | "array-write" }
  | { kind: "and" | "or" | "not" }
  | { kind: "address-of"; segment: "local" | "argument" | "static"; index: number; storageId: string }
  | { kind: "indirect-read" | "indirect-write"; storageId: string }
  | { kind: "label" | "goto" | "if-goto"; name: string }
  | { kind: "function"; name: string; localCount: number }
  | { kind: "call"; name: string; argumentCount: number }
  | { kind: "array"; size: number });
export interface VMFrame { id: string; before: number[]; after: number[]; local: number | null; locals: number[]; startCycle: number; endCycle: number }
export interface AssemblyLine extends Provenance { id: string; vmId: string; sourceId: string; text: string; address: number; symbolicText?: string; pointerEffect?: "address" | "read" | "write"; storageId?: string; hardwareEffect?: "arithmetic" | "bitwise" }
export const SOURCE = "let x = 2 + 3;";
export const DECISION_SOURCE = "let x = 7;\nlet y = 9;\nlet result = 0;\nif (x > y) {\n    let result = x;\n} else {\n    let result = y;\n}";
export const DEFAULT_SOURCE = "let x = 7;\nlet y = 9;\nlet result = x + y;";
export const EXAMPLES: Record<string, string> = {
  Arithmetic: "let x = 7 + 9;", Memory: "let x = 7;\nlet y = x;", Reassignment: "let x = 2;\nlet x = x + 1;", Decision: DECISION_SOURCE,
  Loop: "let x = 0;\nwhile (x < 3) {\n    let x = x + 1;\n}",
  Function: "function add(a, b) {\n    let sum = a + b;\n    return sum;\n}\nlet result = add(2, 3);",
  Nested: "function add(a, b) { return a + b; }\nfunction twice(n) { return add(n, n); }\nlet result = twice(add(2, 3));",
  Recursion: "function countdown(n) {\n    if (n == 0) { return 0; }\n    return countdown(n - 1);\n}\nlet result = countdown(3);",
  Array: "let values = array(4);\nlet values[0] = 7;\nlet values[1] = 9;\nlet i = 1;\nlet x = values[i];",
  "I/O": "let key = keyboard();\nscreen(10, key);",
  Pointer: "let x = 7;\nlet p = &x;\nlet y = *p;",
  "Pointer write": "let x = 7;\nlet p = &x;\nlet *p = 9;\nlet y = *p + 1;",
  "Bitwise AND": "let x = 12 & 10;", "Bitwise OR": "let x = 12 | 10;", "Bitwise NOT": "let x = ~0;"
};
export const PROGRAM: VMInstruction[] = [
  { id: "vm:push2", kind: "push", segment: "constant", value: 2, label: "push constant 2", sourceId: "source:two" },
  { id: "vm:push3", kind: "push", segment: "constant", value: 3, label: "push constant 3", sourceId: "source:three" },
  { id: "vm:add", kind: "add", label: "add", sourceId: "source:plus" },
  { id: "vm:pop", kind: "pop", segment: "local", index: 0, label: "pop local 0", sourceId: "source:assign" },
];
const PUSH = ["@SP", "A=M", "M=D", "@SP", "M=M+1"];
const POP = ["@SP", "AM=M-1", "D=M"];
const labelName = (name: string) => `NS$${name.replace(/[^A-Za-z0-9_$.:]/g, "_")}`;
export function translateVM(program: VMInstruction[]): AssemblyLine[] {
  if (program.length > LIMITS.vmCommands) throw new Error(`Use at most ${LIMITS.vmCommands} VM commands.`);
  const lines: AssemblyLine[] = []; let rom = 0;
  program.forEach((c, ordinal) => {
    const tag = `NS$INTERNAL$${ordinal}`, target = "name" in c ? labelName(c.name) : "", trap = "NS$TRAP";
    let group: string[] = [];
    if (c.kind === "push" || c.kind === "pop") {
      if (c.kind === "push" && c.segment === "constant") {
        group = c.value >= 0 ? [`@${c.value}`, "D=A", ...PUSH] : c.value === -32768 ? ["@32767", "D=A", "D=D+1", ...PUSH] : [`@${-c.value}`, "D=A", "D=-D", ...PUSH];
      } else {
        const register = c.segment === "local" ? "LCL" : c.segment === "argument" ? "ARG" : c.segment === "pointer" ? (c.index === 0 ? "THIS" : "THAT") : String((c.segment === "static" ? 1536 : 5) + c.index);
        const relative = c.segment === "local" || c.segment === "argument";
        group = c.kind === "push" ? [...(relative ? [`@${register}`, "D=M", `@${c.index}`, "A=D+A", "D=M"] : [`@${register}`, "D=M"]), ...PUSH]
          : relative ? [`@${register}`, "D=M", `@${c.index}`, "D=D+A", "@R13", "M=D", ...POP, "@R13", "A=M", "M=D"] : [...POP, `@${register}`, "M=D"];
      }
    } else if (c.kind === "add" || c.kind === "sub" || c.kind === "and" || c.kind === "or") group = [...POP, "A=A-1", ({ add: "M=D+M", sub: "M=M-D", and: "M=D&M", or: "M=D|M" } as const)[c.kind]];
    else if (c.kind === "not") group = ["@SP", "A=M-1", "M=!M"];
    else if (c.kind === "address-of") group = c.segment === "static" ? [`@${1536 + c.index}`, "D=A", ...PUSH] : [`@${c.segment === "local" ? "LCL" : "ARG"}`, "D=M", `@${c.index}`, "D=D+A", ...PUSH];
    // The address stays on the machine stack while the RHS is evaluated,
    // including calls that use R13/R14. Only the final store uses scratch RAM.
    else if (c.kind === "indirect-read") group = [...POP, `@${trap}`, "D;JEQ", "A=D", "D=M", ...PUSH];
    else if (c.kind === "indirect-write") group = [...POP, "@R14", "M=D", ...POP, `@${trap}`, "D;JEQ", "@R13", "M=D", "@R14", "D=M", "@R13", "A=M", "M=D"];
    else if (c.kind === "gt" || c.kind === "lt" || c.kind === "eq") {
      // For ordered comparisons, split opposite signs BEFORE subtracting. Same-sign
      // subtraction cannot overflow. Booleans are exactly -1 or 0.
      const yes = `${tag}$TRUE`, no = `${tag}$FALSE`, end = `${tag}$END`, neg = `${tag}$NEG`, same = `${tag}$SAME`;
      group = [...POP, "@R13", "M=D", "@SP", "A=M-1", "D=M"];
      if (c.kind !== "eq") group.push(`@${neg}`, "D;JLT", "@R13", "D=M", `@${c.kind === "gt" ? yes : no}`, "D;JLT", `@${same}`, "0;JMP", `(${neg})`, "@R13", "D=M", `@${c.kind === "lt" ? yes : no}`, "D;JGE", `(${same})`, "@SP", "A=M-1", "D=M");
      group.push("@R13", "D=D-M", `@${yes}`, `D;${c.kind === "eq" ? "JEQ" : c.kind === "gt" ? "JGT" : "JLT"}`, `(${no})`, "@SP", "A=M-1", "M=0", `@${end}`, "0;JMP", `(${yes})`, "@SP", "A=M-1", "M=-1", `(${end})`);
    } else if (c.kind === "label") group = [`(${target})`];
    else if (c.kind === "goto") group = [`@${target}`, "0;JMP"];
    else if (c.kind === "if-goto") group = [...POP, `@${target}`, "D;JNE"];
    else if (c.kind === "function") {
      group = [`(${target})`]; for (let i = 0; i < c.localCount; i++) group.push("D=0", ...PUSH);
      // A real no-op makes even zero-local entry observable without counting labels.
      if (!c.localCount) group.push("@SP");
    } else if (c.kind === "call") {
      const ret = `${tag}$RETURN`;
      group = [`@${ret}`, "D=A", ...PUSH];
      for (const register of ["LCL", "ARG", "THIS", "THAT"]) group.push(`@${register}`, "D=M", ...PUSH);
      group.push("@SP", "D=M", `@${c.argumentCount + 5}`, "D=D-A", "@ARG", "M=D", "@SP", "D=M", "@LCL", "M=D", `@${target}`, "0;JMP", `(${ret})`);
    } else if (c.kind === "return") {
      group = ["@LCL", "D=M", "@R13", "M=D", "@5", "A=D-A", "D=M", "@R14", "M=D", ...POP, "@ARG", "A=M", "M=D", "@ARG", "D=M+1", "@SP", "M=D"];
      for (const register of ["THAT", "THIS", "ARG", "LCL"]) group.push("@R13", "AM=M-1", "D=M", `@${register}`, "M=D");
      group.push("@R14", "A=M", "0;JMP");
    } else if (c.kind === "drop") group = ["@SP", "M=M-1"];
    else if (c.kind === "keyboard") group = ["@KBD", "D=M", ...PUSH];
    else if (c.kind === "screen") {
      group = [...POP, "@R14", "M=D", ...POP, `@${trap}`, "D;JLT", "@8192", "D=D-A", `@${trap}`, "D;JGE", "@8192", "D=D+A", "@SCREEN", "D=D+A", "@R13", "M=D", "@R14", "D=M", "@R13", "A=M", "M=D", "D=0", ...PUSH];
    } else if (c.kind === "array") {
      group = ["@16", "D=M", `@${c.size + 1}`, "D=D+A", "@8192", "D=D-A", `@${trap}`, "D;JGT", `@${c.size}`, "D=A", "@16", "A=M", "M=D", "@16", "D=M+1", ...PUSH, "@16", "D=M", `@${c.size + 1}`, "D=D+A", "@16", "M=D"];
    } else if (c.kind === "array-read" || c.kind === "array-write") {
      group = c.kind === "array-write" ? [...POP, "@R15", "M=D"] : [];
      group.push(...POP, "@R14", "M=D", `@${trap}`, "D;JLT", ...POP, "@R13", "M=D", "@2049", "D=D-A", `@${trap}`, "D;JLT", "@R13", "D=M", "@8192", "D=D-A", `@${trap}`, "D;JGE", "@R13", "A=M-1", "D=M", "@R14", "D=D-M", `@${trap}`, "D;JLE", "@R13", "D=M", "@R14", "D=D+M", "@R13", "M=D");
      group.push(...(c.kind === "array-read" ? ["@R13", "A=M", "D=M", ...PUSH] : ["@R15", "D=M", "@R13", "A=M", "M=D"]));
    }
    for (const [groupIndex, text] of group.entries()) {
      const pseudo = text.startsWith("(");
      const pointerEffect = c.kind === "address-of" && groupIndex === group.length - PUSH.length - 1 ? "address" : c.kind === "indirect-read" && groupIndex === group.length - PUSH.length - 1 ? "read" : c.kind === "indirect-write" && groupIndex === group.length - 1 ? "write" : undefined;
      const hardwareEffect = groupIndex !== group.length - 1 ? undefined : c.kind === "add" || c.kind === "sub" ? "arithmetic" : c.kind === "and" || c.kind === "or" || c.kind === "not" ? "bitwise" : undefined;
      lines.push({ ...c, id: pseudo ? `assembly:label:${lines.length}` : `assembly:${rom}`, vmId: c.id, text, address: pseudo ? -1 : rom++, pointerEffect, hardwareEffect });
    }
  });
  // All bounds failures stop at the end of ROM, without synthesizing a CPU frame.
  if (program.some(c => ["array", "array-read", "array-write", "screen", "indirect-read", "indirect-write"].includes(c.kind))) {
    const last = program.at(-1)!; lines.push({ ...last, id: "assembly:trap", vmId: last.id, text: "(NS$TRAP)", address: -1 });
  }
  return lines;
}
export function runtimeVMFrames(program: VMInstruction[], frames: (ExecutionFrame & { vmId: string })[]): VMFrame[] {
  const result: VMFrame[] = [];
  for (let start = 0; start < frames.length;) {
    let end = start; while (end + 1 < frames.length && frames[end + 1].vmId === frames[start].vmId) end++;
    const before = frames[start].before, after = frames[end].after;
    const command = program.find(c => c.id === frames[start].vmId)!;
    const locals = Array.from(after.ram.slice(after.ram[1], Math.min(after.ram[1] + 128, 32768)));
    result.push({ id: command.id, before: Array.from(before.ram.slice(256, Math.min(before.ram[0], LIMITS.stackEnd))), after: Array.from(after.ram.slice(256, Math.min(after.ram[0], LIMITS.stackEnd))), local: command.kind === "pop" ? after.ram[command.segment === "static" ? 1536 + command.index : command.segment === "local" ? after.ram[1] + command.index : after.ram[2] + command.index] : null, locals, startCycle: start, endCycle: end });
    start = end + 1;
  }
  return result;
}
export function executeVM(program: VMInstruction[]): VMFrame[] {
  if (program[0]?.kind === "add" || program[0]?.kind === "sub" || program[0]?.kind === "pop") throw new Error("Stack underflow");
  const assembled = assembleProgram(translateVM(program));
  return runtimeVMFrames(program, executeProgram(assembled.machine.map(m => m.value)).map(f => ({ ...f, vmId: assembled.assembly[f.romAddress].vmId })));
}

