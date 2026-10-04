import { executionCursor } from "@/core/trace/execution";
import type { LayerProps } from "../shared/types";
import { vmAnchor } from "../transitions/anchors";
import { useLayoutEffect, useRef } from "react";
import { revealInstruction } from "../shared/reveal-instruction";
function Stack({ values, label }: { values: number[]; label: string }) {
  return <div className="stack"><span className="eyebrow">{label}</span><div className="stack-slots">{[...values].slice(-6).reverse().map((v, i) => <div className="stack-value" key={i}><code>{v}</code>{i === 0 && <small>top</small>}</div>)}{!values.length && <div className="stack-value muted">empty</div>}</div><span className="stack-base">{values.length > 6 ? `TOP 6 OF ${values.length}` : "STACK"}</span></div>;
}
export function VMLayer({ demo, address, related, inspectedVM, onSelect }: LayerProps) {
  const cursor = executionCursor(demo, address), listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { revealInstruction(listRef.current, true); }, [address]);
  const frame = demo.vmFrames.find(f => f.startCycle <= address && f.endCycle >= address)!;
  return <div className="vm-scene"><div className="vm-program" ref={listRef}><span className="eyebrow">STACK INSTRUCTIONS</span>{demo.vm.map((c, i) => {
    const pseudo = c.kind === "label", skipped = !pseudo && !demo.vmCycles[c.id];
    return <button key={c.id} data-visual-anchor={vmAnchor(c.id)} className={`vm-line ${related.has(c.id) ? "traced" : ""} ${cursor.vm.id === c.id ? "current" : ""} ${skipped ? "skipped-code" : ""} ${inspectedVM === c.id ? "inspected-code" : ""}`} onClick={() => onSelect(c.id)} aria-pressed={cursor.vm.id === c.id}><span className="line-number">{i + 1}</span><code data-visual-anchor={`${vmAnchor(c.id)}-label`}>{c.label}</code><span className="line-link">{pseudo ? "label · no cycle" : skipped ? "skipped on this run" : `${demo.vmFrames.filter(f => f.id === c.id).length} visits`}</span></button>;
  })}</div><div className="instruction-note"><code>{cursor.vm.label} · instruction {cursor.instructionInVM} / {cursor.instructionsInVM}</code><span>Cycle {address + 1} · ROM {cursor.romAddress} · {cursor.assembly.text}</span></div>
    <div className="stack-transform"><Stack values={frame.before} label="VISIT BEFORE" /><div className="stack-operation"><code>{cursor.vm.kind.toUpperCase()}</code></div><Stack values={frame.after} label="VISIT AFTER" /></div><p className="scene-note">Stack boundaries are from this executed VM visit (cycles {frame.startCycle + 1}–{frame.endCycle + 1}). Calls also push saved frame state. Labels consume no ROM word or cycle.</p></div>;
}
