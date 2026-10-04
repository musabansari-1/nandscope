import { LIMITS } from "../limits";
export interface SourceSpan { line: number; column: number; start: number; end: number }
interface Node { id: string; span: SourceSpan }
export interface Identifier extends Node { kind: "identifier"; name: string }
export interface IntegerLiteral extends Node { kind: "integer"; value: number }
export type Operand = Identifier | IntegerLiteral;
export interface BinaryExpression extends Node { kind: "binary"; operatorId: string; operator: "+" | "-" | ">" | "<" | "==" | "&" | "|"; left: Expression; right: Expression }
export interface UnaryExpression extends Node { kind: "unary"; operatorId: string; operator: "~"; operand: Expression }
export interface AddressOfExpression extends Node { kind: "address-of"; target: Identifier }
export interface DereferenceExpression extends Node { kind: "dereference"; pointer: Identifier }
export interface DereferenceTarget extends Node { kind: "dereference-target"; pointer: Identifier }
export interface CallExpression extends Node { kind: "call"; callee: Identifier; arguments: Expression[] }
export interface ArrayAccess extends Node { kind: "array-access"; array: Identifier; index: Expression }
export type Expression = Operand | BinaryExpression | UnaryExpression | AddressOfExpression | DereferenceExpression | CallExpression | ArrayAccess;
export type AssignmentTarget = Identifier | ArrayAccess | DereferenceTarget;
export interface LetStatement extends Node { kind: "let"; target: AssignmentTarget; expression: Expression; line: number }
export interface IfStatement extends Node { kind: "if"; condition: Expression; then: Statement[]; otherwise: Statement[]; line: number }
export interface WhileStatement extends Node { kind: "while"; condition: Expression; body: Statement[]; line: number }
export interface ReturnStatement extends Node { kind: "return"; expression: Expression; line: number }
export interface ExpressionStatement extends Node { kind: "expression-statement"; expression: Expression; line: number }
export interface FunctionDeclaration extends Node { kind: "function"; name: Identifier; parameters: Identifier[]; body: Statement[]; line: number }
export type Statement = LetStatement | IfStatement | WhileStatement | ReturnStatement | ExpressionStatement | FunctionDeclaration;
export interface Program extends Node { kind: "program"; statements: Statement[]; source: string }
export type ValueKind = "value" | "pointer";
export interface StorageSymbol { id: string; name: string; segment: "local" | "argument" | "static"; index: number; declarationId: string; scope: string; arraySize?: number; valueKind?: ValueKind }
export interface FunctionSymbol { declaration: FunctionDeclaration; symbols: Record<string, StorageSymbol>; localCount: number }
export interface ResolvedProgram { program: Program; symbols: Record<string, StorageSymbol>; functions: Record<string, FunctionSymbol>; bindings: Record<string, StorageSymbol> }
export class SourceError extends Error {
  constructor(public line: number, message: string) { super(`Line ${line}: ${message}`); this.name = "SourceError"; }
}
interface Token { text: string; span: SourceSpan }
const RESERVED = new Set(["let", "if", "else", "while", "function", "return", "array", "keyboard", "screen"]);
export function parseSource(source: string): Program {
  if (source.length > LIMITS.sourceCharacters) throw new SourceError(1, `Use at most ${LIMITS.sourceCharacters} source characters.`);
  const tokens: Token[] = [];
  let line = 1, column = 1;
  for (let start = 0; start < source.length;) {
    const char = source[start];
    if (/\s/.test(char)) { if (char === "\n") { line++; column = 1; } else column++; start++; continue; }
    if (source.slice(start, start + 2) === "//") { while (start < source.length && source[start] !== "\n") { start++; column++; } continue; }
    if (["&&", "||"].includes(source.slice(start, start + 2))) throw new SourceError(line, "Use & or | for bitwise operations. Logical && and || are not supported.");
    const text = /^(?:[A-Za-z_][A-Za-z_0-9]*|\d+|==|[=+;\-<>(){},\[\]&|~*])/.exec(source.slice(start))?.[0];
    if (!text) throw new SourceError(line, `Unexpected "${char}". Use the teaching language syntax.`);
    tokens.push({ text, span: { line, column, start, end: start + text.length } }); start += text.length; column += text.length;
  }
  let position = 0, count = 0, depth = 0;
  const peek = () => tokens[position];
  const fail = (message: string): never => { throw new SourceError(peek()?.span.line ?? line, message); };
  const take = (text: string) => { if (peek()?.text !== text) fail(`Expected "${text}".`); return tokens[position++]; };
  const identifier = (id: string, builtin = false): Identifier => {
    const token = peek();
    if (!token || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(token.text) || (!builtin && RESERVED.has(token.text))) fail("Expected a variable or function name.");
    position++; return { kind: "identifier", id, name: token.text, span: token.span };
  };
  function primary(id: string): Expression {
    if (++depth > LIMITS.syntaxDepth) fail(`Use at most ${LIMITS.syntaxDepth} nested expressions/blocks.`);
    const token = peek(); let result: Expression;
    if (token?.text === "&" || token?.text === "*") {
      position++; const name = identifier(`${id}:${token.text === "&" ? "target" : "pointer"}`);
      result = token.text === "&" ? { kind: "address-of", id, target: name, span: { ...token.span, end: name.span.end } } : { kind: "dereference", id, pointer: name, span: { ...token.span, end: name.span.end } };
    }
    else if (token?.text === "~") { position++; const operand = primary(`${id}:operand`); result = { kind: "unary", id, operatorId: `${id}:operator`, operator: "~", operand, span: { ...token.span, end: operand.span.end } }; }
    else if (token?.text === "(") { take("("); result = expression(id); take(")"); }
    else if (token?.text === "-" || /^\d+$/.test(token?.text ?? "")) {
      const negative = token?.text === "-"; if (negative) take("-"); const number = peek();
      if (!number || !/^\d+$/.test(number.text)) fail("Unary - applies to an integer literal; use 0 - expression otherwise.");
      position++; const value = Number(number.text) * (negative ? -1 : 1);
      if (!Number.isSafeInteger(value) || value < -32768 || value > 32767) fail("Integer literals must be between -32768 and 32767.");
      result = { kind: "integer", id, value, span: { ...token!.span, end: number.span.end } };
    } else {
      const name = identifier(id, true);
      if (peek()?.text === "(") {
        take("("); const args: Expression[] = [];
        if (peek()?.text !== ")") do { args.push(expression(`${id}:argument:${args.length}`)); if (peek()?.text !== ",") break; take(","); } while (peek());
        const end = take(")"); result = { kind: "call", id, callee: { ...name, id: `${id}:callee` }, arguments: args, span: { ...name.span, end: end.span.end } };
      } else if (peek()?.text === "[") {
        take("["); const index = expression(`${id}:index`); const end = take("]");
        result = { kind: "array-access", id, array: { ...name, id: `${id}:base` }, index, span: { ...name.span, end: end.span.end } };
      } else { if (RESERVED.has(name.name)) fail(`"${name.name}" needs a call or statement.`); result = name; }
    }
    depth--; return result;
  }
  function expression(id: string, minimum = 0): Expression {
    const precedence: Record<string, number> = { "|": 1, "&": 2, "==": 3, ">": 4, "<": 4, "+": 5, "-": 5 };
    let left = primary(`${id}:left`), ordinal = 0;
    while ((precedence[peek()?.text ?? ""] ?? 0) > minimum) {
      const op = tokens[position++], right = expression(`${id}:right:${ordinal}`, precedence[op.text]);
      left = { kind: "binary", id: ordinal ? `${id}:expression:${ordinal}` : `${id}:expression`, operatorId: ordinal ? `${id}:operator:${ordinal}` : `${id}:operator`, operator: op.text as BinaryExpression["operator"], left, right, span: { ...left.span, end: right.span.end } }; ordinal++;
    }
    if (left.kind === "binary" && left.right.kind !== "binary") left.right.id = `${id}:right`;
    
    return left;
  }
  function block(): Statement[] {
    take("{"); if (++depth > LIMITS.syntaxDepth) fail("Too many nested blocks."); const result: Statement[] = [];
    while (peek() && peek().text !== "}") result.push(statement()); take("}"); depth--; return result;
  }
  function statement(): Statement {
    if (count >= LIMITS.statements) fail(`Use at most ${LIMITS.statements} statements.`);
    const id = `source:statement:${count++}`, start = peek(); if (!start) return fail("Expected a statement."); let result: Statement;
    if (start.text === "let") {
      take("let"); let target: AssignmentTarget;
      if (peek()?.text === "*") { const start = take("*"); const pointer = identifier(`${id}:target:pointer`); target = { kind: "dereference-target", id: `${id}:target`, pointer, span: { ...start.span, end: pointer.span.end } }; }
      else target = identifier(`${id}:target`);
      if (target.kind === "identifier" && peek()?.text === "[") {
        take("["); const index = expression(`${id}:target:index`), end = take("]");
        target = { kind: "array-access", id: `${id}:target`, array: { ...target, id: `${id}:target:base` }, index, span: { ...target.span, end: end.span.end } };
      }
      take("="); const value = expression(id); take(";"); result = { kind: "let", id, target, expression: value, line: start.span.line, span: start.span };
    } else if (start.text === "if" || start.text === "while") {
      position++; take("("); const condition = expression(`${id}:condition`); take(")"); const body = block();
      if (start.text === "if") { const otherwise = peek()?.text === "else" ? (take("else"), block()) : []; result = { kind: "if", id, condition, then: body, otherwise, line: start.span.line, span: start.span }; }
      else result = { kind: "while", id, condition, body, line: start.span.line, span: start.span };
    } else if (start.text === "function") {
      take("function"); const name = identifier(`${id}:name`); take("("); const parameters: Identifier[] = [];
      if (peek()?.text !== ")") do { parameters.push(identifier(`${id}:parameter:${parameters.length}`)); if (peek()?.text !== ",") break; take(","); } while (peek());
      take(")"); const body = block(); result = { kind: "function", id, name, parameters, body, line: start.span.line, span: start.span };
    } else {
      const returning = start.text === "return"; if (returning) take("return"); const value = expression(`${id}:value`); take(";");
      result = { kind: returning ? "return" : "expression-statement", id, expression: value, line: start.span.line, span: start.span };
    }
    result.span = { ...start.span, end: tokens[position - 1].span.end }; return result;
  }
  const statements: Statement[] = []; while (peek()) statements.push(statement());
  if (!statements.length) throw new SourceError(1, "Write at least one statement.");
  return { kind: "program", id: "source:program", span: { line: 1, column: 1, start: 0, end: source.length }, source, statements };
}
export function flattenStatements(statements: Statement[]): Statement[] {
  return statements.flatMap(s => [s, ...flattenStatements(s.kind === "if" ? [...s.then, ...s.otherwise] : s.kind === "while" || s.kind === "function" ? s.body : [])]);
}
export function expressionOperands(e: Expression): Operand[] {
  if (e.kind === "binary") return [...expressionOperands(e.left), ...expressionOperands(e.right)];
  if (e.kind === "unary") return expressionOperands(e.operand);
  if (e.kind === "address-of") return [e.target];
  if (e.kind === "dereference") return [e.pointer];
  if (e.kind === "call") return e.arguments.flatMap(expressionOperands);
  if (e.kind === "array-access") return [e.array, ...expressionOperands(e.index)]; return [e];
}
export function formatExpression(e: Expression | DereferenceTarget): string {
  if (e.kind === "binary") return `${formatExpression(e.left)} ${e.operator} ${formatExpression(e.right)}`;
  if (e.kind === "unary") return `~${e.operand.kind === "binary" ? `(${formatExpression(e.operand)})` : formatExpression(e.operand)}`;
  if (e.kind === "address-of") return `&${e.target.name}`;
  if (e.kind === "dereference" || e.kind === "dereference-target") return `*${e.pointer.name}`;
  if (e.kind === "call") return `${e.callee.name}(${e.arguments.map(formatExpression).join(", ")})`;
  if (e.kind === "array-access") return `${e.array.name}[${formatExpression(e.index)}]`; return e.kind === "integer" ? String(e.value) : e.name;
}
export function formatStatement(s: Statement): string {
  if (s.kind === "let") return `let ${formatExpression(s.target)} = ${formatExpression(s.expression)};`;
  if (s.kind === "if" || s.kind === "while") return `${s.kind} (${formatExpression(s.condition)})`;
  if (s.kind === "function") return `function ${s.name.name}(${s.parameters.map(p => p.name).join(", ")})`;
  return `${s.kind === "return" ? "return " : ""}${formatExpression(s.expression)};`;
}
export function resolveSymbols(program: Program): ResolvedProgram {
  const symbols: Record<string, StorageSymbol> = Object.create(null), functions: Record<string, FunctionSymbol> = Object.create(null), bindings: Record<string, StorageSymbol> = Object.create(null);
  for (const s of flattenStatements(program.statements)) if (s.kind === "function") {
    if (!program.statements.includes(s)) throw new SourceError(s.line, "Declare functions at the top level.");
    if (functions[s.name.name]) throw new SourceError(s.line, `Duplicate function "${s.name.name}".`);
    functions[s.name.name] = { declaration: s, symbols: Object.create(null), localCount: 0 };
  }
  if (Object.keys(functions).length > LIMITS.functions) throw new SourceError(1, `Use at most ${LIMITS.functions} functions.`);
  const globalSegment = Object.keys(functions).length ? "static" : "local";
  function read(name: Identifier, table: Record<string, StorageSymbol>) {
    const symbol = table[name.name] ?? (table !== symbols ? symbols[name.name] : undefined);
    if (!symbol) throw new SourceError(name.span.line, `"${name.name}" is used before it has been defined.`); bindings[name.id] = symbol;
  }
  // Types remain deliberately small. Definite pointer initialization is tracked
  // across branches so an unexecuted address assignment cannot mean RAM[0].
  let initializedPointers = new Set<string>();
  const kind = (e: Expression): ValueKind => e.kind === "address-of" ? "pointer" : e.kind === "identifier" ? bindings[e.id].valueKind ?? "value" : "value";
  function ordinary(e: Expression) { if (kind(e) === "pointer") throw new SourceError(e.span.line, "Pointers contain addresses. Dereference with *name before using a value; pointer arithmetic and pointer arguments/returns are not supported."); }
  function pointer(name: Identifier, table: Record<string, StorageSymbol>) {
    read(name, table); const b = bindings[name.id];
    if (b.valueKind !== "pointer" || !initializedPointers.has(b.id)) throw new SourceError(name.span.line, `"${name.name}" must hold an address assigned with &name before it can be dereferenced.`);
  }
  function validate(e: Expression, table: Record<string, StorageSymbol>) {
    if (e.kind === "identifier") read(e, table);
    if (e.kind === "binary") { validate(e.left, table); validate(e.right, table); ordinary(e.left); ordinary(e.right); }
    if (e.kind === "unary") { validate(e.operand, table); ordinary(e.operand); }
    if (e.kind === "address-of") { read(e.target, table); if (bindings[e.target.id].valueKind === "pointer") throw new SourceError(e.span.line, "Taking a pointer's address would create a pointer-to-pointer, which is not supported."); }
    if (e.kind === "dereference") pointer(e.pointer, table);
    if (e.kind === "array-access") { read(e.array, table); if (bindings[e.array.id].valueKind === "pointer") throw new SourceError(e.span.line, "Use *name to dereference a pointer. Pointer indexing is not supported."); validate(e.index, table); ordinary(e.index); }
    if (e.kind === "call") {
      const name = e.callee.name, arity = name === "keyboard" ? 0 : name === "screen" ? 2 : name === "array" ? 1 : functions[name]?.declaration.parameters.length;
      if (arity === undefined) throw new SourceError(e.span.line, `Unknown function "${name}".`);
      if (e.arguments.length !== arity) throw new SourceError(e.span.line, `"${name}" expects ${arity} arguments.`);
      if (name === "array" && (e.arguments[0].kind !== "integer" || e.arguments[0].value < 1 || e.arguments[0].value > LIMITS.arraySize)) throw new SourceError(e.span.line, `array requires a fixed size from 1 to ${LIMITS.arraySize}.`);
      e.arguments.forEach(a => { validate(a, table); ordinary(a); });
    }
  }
  function visit(list: Statement[], table: Record<string, StorageSymbol>, scope: string) {
    for (const s of list) {
      if (s.kind === "function") continue;
      if (s.kind === "let") {
        validate(s.expression, table);
        if (s.target.kind === "array-access") { validate(s.target, table); ordinary(s.expression); }
        else if (s.target.kind === "dereference-target") { pointer(s.target.pointer, table); ordinary(s.expression); }
        else {
          if (!table[s.target.name]) {
            const segment = scope === "main" ? globalSegment : "local", index = Object.values(table).filter(s => s.segment === segment).length;
            table[s.target.name] = { id: scope === "main" ? `storage:${segment}:${index}` : `storage:${scope}:${segment}:${index}`, name: s.target.name, segment, index, declarationId: s.id, scope, valueKind: kind(s.expression), arraySize: s.expression.kind === "call" && s.expression.callee.name === "array" ? (s.expression.arguments[0] as IntegerLiteral).value : undefined };
          }
          const b = table[s.target.name];
          if ((b.valueKind ?? "value") !== kind(s.expression)) throw new SourceError(s.line, `"${b.name}" keeps its ${b.valueKind ?? "value"} storage kind. Assign another &name to a pointer, or use *name to read its value.`);
          if (kind(s.expression) === "pointer") {
            if (s.expression.kind === "identifier" && !initializedPointers.has(bindings[s.expression.id].id)) throw new SourceError(s.line, "The pointer being copied has not been assigned an address on every path.");
            initializedPointers.add(b.id);
          }
          bindings[s.target.id] = b;
        }
      } else if (s.kind === "if" || s.kind === "while") {
        validate(s.condition, table); ordinary(s.condition);
        const before = new Set(initializedPointers);
        visit(s.kind === "if" ? s.then : s.body, table, scope); const then = new Set(initializedPointers);
        initializedPointers = new Set(before);
        if (s.kind === "if") { visit(s.otherwise, table, scope); initializedPointers = new Set([...then].filter(id => initializedPointers.has(id))); }
      } else {
        if (s.kind === "return" && scope === "main") throw new SourceError(s.line, "return belongs inside a function.");
        if (s.kind === "expression-statement" && s.expression.kind !== "call") throw new SourceError(s.line, "Use let to store an expression, or a function call as a statement.");
        validate(s.expression, table); ordinary(s.expression);
      }
    }
  }
  visit(program.statements, symbols, "main");
  for (const [name, fn] of Object.entries(functions)) {
    fn.declaration.parameters.forEach((p, index) => {
      if (fn.symbols[p.name]) throw new SourceError(p.span.line, `Duplicate parameter "${p.name}".`);
      const symbol: StorageSymbol = { id: `storage:${name}:argument:${index}`, name: p.name, segment: "argument", index, declarationId: fn.declaration.id, scope: name };
      fn.symbols[p.name] = symbol; bindings[p.id] = symbol;
    });
    visit(fn.declaration.body, fn.symbols, name); fn.localCount = Object.values(fn.symbols).filter(s => s.segment === "local").length;
  }
  return { program, symbols, functions, bindings };
}

