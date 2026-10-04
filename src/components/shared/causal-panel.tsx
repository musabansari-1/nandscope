import { useLayoutEffect, useMemo, useRef } from "react";
import { explainValue, type CauseNode } from "@/core/trace/causes";
import type { Demo } from "@/core/trace/demo";
import { signed } from "@/core/limits";

export function CausalPanel({ demo, address, cycleIndex, onInspect, onALU, onClose, onPrevious }: { demo: Demo; address: number; cycleIndex: number; onInspect: (cycle: number) => void; onALU: (id: string, cycle: number) => void; onClose: () => void; onPrevious: (cycle: number) => void }) {
  const explanation = useMemo(() => explainValue(demo, { address, cycleIndex }), [demo, address, cycleIndex]);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [address, cycleIndex]);
  function chain(node: CauseNode, depth = 0) {
    return <li key={`${node.id}-${depth}`}><div className="cause-event" data-cause-kind={node.kind}><span className="eyebrow">{node.kind.replace("-", " ")}{node.cycleIndex !== undefined ? ` · cycle ${node.cycleIndex + 1}` : ""}{node.iteration ? ` · iteration ${node.iteration}` : ""}</span><p>{node.label}</p><div className="cause-actions">{node.kind === "write" && node.cycleIndex !== undefined && <button onClick={() => onInspect(node.cycleIndex!)}>Inspect write</button>}{node.kind === "alu" && demo.hardware.some(h => h.cycleIndex === node.cycleIndex) && <button onClick={() => onALU(node.operationId!, node.cycleIndex!)}>Inspect ALU</button>}{node.kind === "return" && node.callCycle !== undefined && <button onClick={() => onInspect(node.callCycle!)}>Inspect call frame</button>}{node.kind === "write" && node.previousCycle !== undefined && <button onClick={() => onPrevious(node.previousCycle!)}>Go to previous value</button>}</div></div>{node.causes.length > 0 && (node.kind === "read" && node.address === address && node.causes.some(c => c.kind === "write") ? <details className="previous-causes"><summary>Show previous causes</summary><ol>{node.causes.map(child => chain(child, depth + 1))}</ol></details> : <ol>{node.causes.map(child => chain(child, depth + 1))}</ol>)}</li>;
  }
  return <section className="causal-panel" aria-label="Causal value explanation"><div className="debug-heading"><div><span className="eyebrow">ACTUAL EXECUTION HISTORY</span><h2 ref={heading} tabIndex={-1}>Why is {explanation.sourceSymbol?.name ?? `RAM[${address}]`} = {signed(explanation.value)}?</h2><p>RAM[{address}] after cycle {cycleIndex + 1}{explanation.producingWrite !== undefined ? ` · last written at cycle ${explanation.producingWrite + 1}` : " · initial memory"}</p></div><button className="quiet-button" onClick={onClose}>Close explanation</button></div><ol className="cause-chain">{explanation.causes.map(node => chain(node))}</ol>{explanation.truncated && <p>Earlier dependencies are folded here. Use “Go to previous value” to inspect earlier writes.</p>}</section>;
}
