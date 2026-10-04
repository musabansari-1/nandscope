import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { executionCursor, sourceExecutionState, loopIteration } from "@/core/trace/execution";
import { EXAMPLES } from "@/core/vm";
import { formatExpression, type Expression, type DereferenceTarget, type Statement } from "@/core/parser";
import { sourceAnchor } from "../transitions/anchors";
import type { LayerProps } from "../shared/types";
import { revealInstruction } from "../shared/reveal-instruction";
export function SourceLayer({ demo, address, operationId, onSelect, onCompile }: LayerProps) {
  const [draft, setDraft] = useState(demo.source), [error, setError] = useState<string | null>(null), [keyboard, setKeyboard] = useState(demo.keyboard);
  const cursor = executionCursor(demo, address), ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { revealInstruction(ref.current, true); }, [address]);
  function compile(source: string) { setDraft(source); setError(onCompile?.(source, keyboard) ?? null); }
  function token(id: string, text: string, line: number, role: string) { return <button data-visual-anchor={sourceAnchor(id)} onClick={() => onSelect(id)} aria-label={`Line ${line}: ${role}${text === "[" ? "" : ` ${text}`}`} aria-pressed={operationId === id}>{text}</button>; }
  function expression(e: Expression | DereferenceTarget): ReactNode {
    if (e.kind === "binary") return <>{expression(e.left)}{" "}{token(e.operatorId, e.operator, e.span.line, "follow operation")}{" "}{expression(e.right)}</>;
    if (e.kind === "unary") return <>{token(e.operatorId, "~", e.span.line, "bitwise NOT")}{e.operand.kind === "binary" ? "(" : ""}{expression(e.operand)}{e.operand.kind === "binary" ? ")" : ""}</>;
    if (e.kind === "address-of") return <>{token(e.id, "&", e.span.line, `address of ${e.target.name}`)}{expression(e.target)}</>;
    if (e.kind === "dereference" || e.kind === "dereference-target") return <>{token(e.id, "*", e.span.line, `${e.kind === "dereference" ? "dereference" : "indirect write through"} ${e.pointer.name}`)}{expression(e.pointer)}</>;
    if (e.kind === "array-access") return <>{expression(e.array)}{token(e.id, "[", e.span.line, `array element ${formatExpression(e)}`)}{expression(e.index)}]</>;
    if (e.kind === "call") return <>{token(e.id, e.callee.name, e.span.line, "call")}({e.arguments.map((a, i) => <span key={a.id}>{i ? ", " : ""}{expression(a)}</span>)})</>;
    return token(e.id, formatExpression(e), e.span.line, e.kind === "integer" ? "constant" : demo.focuses.find(f => f.id === e.id)?.role ?? "read");
  }
  function statements(list: Statement[], depth = 0): ReactNode {
    return list.map(s => {
      const state = sourceExecutionState(demo, s.id, address), active = cursor.statement.id === s.id;
      let code: ReactNode;
      if (s.kind === "let") code = <><span className="keyword">let</span>{" "}{expression(s.target)} = {expression(s.expression)};</>;
      else if (s.kind === "if" || s.kind === "while") code = <>{token(s.id, s.kind, s.line, "control flow")} ({expression(s.condition)}) {"{"}</>;
      else if (s.kind === "function") code = <><span className="keyword">function</span>{" "}{token(s.name.id, s.name.name, s.line, "function")}({s.parameters.map((p, i) => <span key={p.id}>{i ? ", " : ""}{expression(p)}</span>)}) {"{"}</>;
      else code = <>{s.kind === "return" && <>{token(s.id, "return", s.line, "return address")}{" "}</>}{expression(s.expression)};</>;
      return <div key={s.id}>
        <div className={`source-statement ${active ? "executing current" : ""} ${state === "skipped" ? "skipped-code" : ""}`} style={{ paddingLeft: 5 + depth * 12 }} data-statement-id={s.id} data-execution-state={state} aria-current={active ? "step" : undefined}><span className="line-number">{String(s.line).padStart(2, "0")}</span><code>{code}</code><small>{state}{active && loopIteration(demo, s.id, address) ? ` · ${s.kind === "while" ? "condition visit" : "iteration"} ${loopIteration(demo, s.id, address)}` : ""}{active && cursor.frame.callStack.length ? ` · frame ${cursor.frame.callStack.length}` : ""}</small></div>
        {s.kind === "if" ? <>{statements(s.then, depth + 1)}{s.otherwise.length > 0 && <div className="source-brace" style={{ paddingLeft: 40 + depth * 12 }}>{"} else {"}</div>}{statements(s.otherwise, depth + 1)}</> : s.kind === "while" || s.kind === "function" ? statements(s.body, depth + 1) : null}
        {["if", "while", "function"].includes(s.kind) && <div className="source-brace" style={{ paddingLeft: 40 + depth * 12 }}>{"}"}</div>}
      </div>;
    });
  }
  return <div className="source-scene"><div className="scene-caption"><span className="small-dot" /> THE PROGRAMMER’S INTENT</div><div ref={ref} className="source-program" aria-label="Compiled source program">{statements(demo.program.statements)}</div>
    <p className="scene-note">Select a name, operator, condition, call or array element to follow it. Source stays in place when ROM repeats.</p>
    <div className="example-buttons" aria-label="Example programs">{Object.entries(EXAMPLES).map(([name, source]) => <button className="quiet-button" key={name} onClick={() => compile(source)}>{name}</button>)}</div>
    <details className="source-editor"><summary>Edit this program</summary><form onSubmit={e => { e.preventDefault(); compile(draft); }}><label htmlFor="source-input">Tiny source program</label><textarea id="source-input" value={draft} onChange={e => setDraft(e.target.value)} rows={8} spellCheck={false} aria-describedby="source-help source-error" /><p id="source-help">let · + / - · bitwise &amp; / | / ~ · addresses &amp;name / *name · &lt; / &gt; / == · if / else · while · function / return · array · keyboard / screen. Semicolons end statements.</p><label htmlFor="keyboard-input">Simulated KBD value (signed 16-bit word)</label><input id="keyboard-input" type="number" min={-32768} max={32767} value={keyboard} onChange={e => setKeyboard(Math.max(-32768, Math.min(32767, Number(e.target.value))))} /><p id="source-error" role="alert">{error && <>{error} The previous valid trace is still available.</>}</p><div className="editor-actions"><button className="primary-button" type="submit">Compile & explore →</button></div></form></details>
  </div>;
}


