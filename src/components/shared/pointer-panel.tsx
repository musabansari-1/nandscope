import { pointerPath } from "@/core/trace/pointers";
import type { LayerProps } from "./types";

export function PointerPanel({ demo, operationId, address, onInstruction }: LayerProps) {
  if (!demo.vm.some(c => c.kind === "address-of")) return null;
  const focus = demo.focuses.find(f => f.id === operationId)!;
  if (!focus.symbol && !focus.pointerSymbol) return null;
  const path = pointerPath(demo, operationId, address);
  const event = demo.pointerEvents.find(e => e.operationId === operationId && e.cycleIndex >= address) ?? demo.pointerEvents.find(e => e.operationId === operationId);
  return <section className="system-card pointer-card" aria-label="Pointer trace"><span className="eyebrow">{path.kind === "address-of" ? "TAKE AN ADDRESS" : path.kind === "pointer" ? "A POINTER STORES AN ADDRESS" : path.kind === "dereference" ? "USE THE STORED ADDRESS" : path.kind === "indirect-write" ? "WRITE THROUGH THE STORED ADDRESS" : "A VALUE HAS A LOCATION"}</span><ol className="pointer-path">{path.items.map((item, i) => <li key={i}><code>{item}</code>{i < path.items.length - 1 && <span aria-hidden="true">↓</span>}</li>)}</ol><p>{path.kind === "address-of" ? "& gives the location of the variable, rather than reading its contents." : path.kind === "pointer" ? "This RAM cell holds a number that names another RAM address." : path.kind === "dereference" || path.kind === "indirect-write" ? "The CPU loads that numeric address into A, then accesses RAM[A]." : "The name is a label for a storage slot. The selected CPU snapshot supplies its address and value."}</p>{event && <button className="quiet-button" onClick={() => onInstruction(event.cycleIndex)}>Inspect actual {event.effect === "address" ? "address computation" : `RAM ${event.effect}`} · cycle {event.cycleIndex + 1} →</button>}</section>;
}
