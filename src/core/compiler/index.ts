import { LIMITS } from "../limits";
import type { Expression, ResolvedProgram, Statement } from "../parser";
import type { VMInstruction } from "../vm";
type Details<T = VMInstruction> = T extends VMInstruction ? Omit<T, "id" | "label" | "sourceId"> : never;
export function compileToVM(resolved: ResolvedProgram): VMInstruction[] {
  const { program, bindings, functions } = resolved, commands: VMInstruction[] = [];
  let scope = "main";
  function emit(s: Statement, sourceId: string, details: Details, label: string, suffix = "") {
    commands.push({ ...details, id: `vm:${sourceId}${suffix}`, label, sourceId, sourceStatementId: s.id, sourceFunction: scope, sourceExpressionId: sourceId } as VMInstruction);
  }
  function expression(e: Expression, s: Statement) {
    if (e.kind === "integer") emit(s, e.id, { kind: "push", segment: "constant", value: e.value }, `push constant ${e.value}`);
    else if (e.kind === "identifier") { const b = bindings[e.id]; emit(s, e.id, { kind: "push", segment: b.segment, index: b.index, variableName: b.name }, `push ${b.segment} ${b.index}`); }
    else if (e.kind === "address-of") { const b = bindings[e.target.id]; emit(s, e.id, { kind: "address-of", segment: b.segment, index: b.index, storageId: b.id }, `address-of ${b.segment} ${b.index} · &${b.name}`); }
    else if (e.kind === "dereference") { expression(e.pointer, s); emit(s, e.id, { kind: "indirect-read", storageId: bindings[e.pointer.id].id }, `indirect-read · *${e.pointer.name}`); }
    else if (e.kind === "unary") { expression(e.operand, s); emit(s, e.operatorId, { kind: "not" }, "not"); commands.at(-1)!.sourceExpressionId = e.id; }
    else if (e.kind === "binary") {
      expression(e.left, s); expression(e.right, s);
      const kind = ({ "+": "add", "-": "sub", ">": "gt", "<": "lt", "==": "eq", "&": "and", "|": "or" } as const)[e.operator];
      emit(s, e.operatorId, { kind }, kind); commands.at(-1)!.sourceExpressionId = e.id;
    } else if (e.kind === "array-access") {
      expression(e.array, s); expression(e.index, s); emit(s, e.id, { kind: "array-read" }, "array-read · base + index");
    } else {
      const name = e.callee.name;
      if (name !== "array") e.arguments.forEach(a => expression(a, s));
      if (name === "array") emit(s, e.id, { kind: "array", size: (e.arguments[0] as { value: number }).value }, `array ${(e.arguments[0] as { value: number }).value}`);
      else if (name === "keyboard" || name === "screen") emit(s, e.id, { kind: name }, name === "keyboard" ? "keyboard · RAM[24576]" : "screen · RAM[16384 + offset]");
      else emit(s, e.id, { kind: "call", name, argumentCount: e.arguments.length }, `call ${name} ${e.arguments.length}`);
    }
  }
  function label(s: Statement, kind: "label" | "goto" | "if-goto", name: string, suffix: string) { emit(s, s.id, { kind, name, controlId: s.id, controlRole: suffix === ":backward" ? "backward" : kind === "if-goto" ? "branch" : kind === "label" ? "label" : "exit" }, `${kind} ${name}`, suffix); }
  function statements(list: Statement[]) {
    for (const s of list) {
      if (s.kind === "function") continue;
      if (s.kind === "let") {
        if (s.target.kind === "array-access") { expression(s.target.array, s); expression(s.target.index, s); expression(s.expression, s); emit(s, s.target.id, { kind: "array-write" }, "array-write · base + index"); }
        else if (s.target.kind === "dereference-target") { expression(s.target.pointer, s); expression(s.expression, s); emit(s, s.target.id, { kind: "indirect-write", storageId: bindings[s.target.pointer.id].id }, `indirect-write · *${s.target.pointer.name}`); }
        else { expression(s.expression, s); const b = bindings[s.target.id]; emit(s, s.target.id, { kind: "pop", segment: b.segment, index: b.index, variableName: b.name }, `pop ${b.segment} ${b.index}`); }
      } else if (s.kind === "if" || s.kind === "while") {
        const start = `${s.id}$CONDITION`, body = `${s.id}$BODY`, end = `${s.id}$END`;
        if (s.kind === "while") label(s, "label", start, ":condition-label");
        expression(s.condition, s); label(s, "if-goto", body, ":branch");
        if (s.kind === "if") statements(s.otherwise);
        label(s, "goto", end, ":exit"); label(s, "label", body, ":body-label");
        statements(s.kind === "if" ? s.then : s.body);
        if (s.kind === "while") label(s, "goto", start, ":backward"); label(s, "label", end, ":end-label");
      } else {
        expression(s.expression, s); emit(s, s.id, { kind: s.kind === "return" ? "return" : "drop" }, s.kind === "return" ? "return" : "drop");
      }
    }
  }
  statements(program.statements);
  if (Object.keys(functions).length) {
    const owner = program.statements.find(s => s.kind !== "function") ?? program.statements[0];
    label(owner, "goto", "PROGRAM_END", ":halt");
    for (const [name, fn] of Object.entries(functions)) {
      scope = name; emit(fn.declaration, fn.declaration.name.id, { kind: "function", name, localCount: fn.localCount }, `function ${name} ${fn.localCount}`);
      statements(fn.declaration.body);
      // Falling through a function returns zero through the same real convention.
      emit(fn.declaration, fn.declaration.id, { kind: "push", segment: "constant", value: 0 }, "push constant 0", ":implicit-value");
      emit(fn.declaration, fn.declaration.id, { kind: "return" }, "return", ":implicit-return");
    }
    scope = "main"; label(owner, "label", "PROGRAM_END", ":end");
  }
  if (commands.length > LIMITS.vmCommands) throw new Error(`Use at most ${LIMITS.vmCommands} VM commands.`);
  return commands;
}

