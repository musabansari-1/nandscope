import { LAYERS, type Layer } from "@/core/trace/graph";
import { useRef, type KeyboardEvent } from "react";

export const LAYER_INFO: Record<Layer, { label: string; subtitle: string; title: string; description: string; what: string; why: string; connection: string }> = {
  source: { label: "Code", subtitle: "The intent", title: "See what your code becomes.", description: "Computation, memory and control flow inside a real machine.", what: "Source statements name the values to store and read.", why: "The computer cannot execute this high-level expression directly. It must be translated into progressively simpler operations.", connection: "The + is the object we’re following. Move down to see it become a stack instruction." },
  vm: { label: "VM", subtitle: "The stack", title: "Values move through the stack.", description: "The expression becomes a small stack program.", what: "VM commands push values, read and write local slots, and add stack operands.", why: "Stack operations provide a simple intermediate language between source code and a specific processor.", connection: "Your + becomes add. It consumes the two top values and pushes their sum." },
  assembly: { label: "Assembly", subtitle: "The instructions", title: "Memory becomes instructions.", description: "Small instructions move the operands into position.", what: "Hack assembly, grouped by the VM instruction that generated it.", why: "The processor needs explicit instructions to address memory, move values, and perform arithmetic.", connection: "Five instructions implement add. M=D+M is the clock cycle where the original addition happens." },
  machine: { label: "Machine Code", subtitle: "The encoding", title: "Instructions become bits.", description: "A precise encoding tells the hardware what to do.", what: "The actual 16-bit ROM word for the selected assembly instruction.", why: "The CPU responds to bit patterns. A C-instruction encodes computation, destinations, and a jump condition.", connection: "M=D+M encodes the computation D+M and writes the ALU result to memory. No jump is requested." },
  cpu: { label: "CPU", subtitle: "The datapath", title: "Bits set hardware in motion.", description: "Follow one real instruction through the processor.", what: "A simplified Hack datapath showing state before and after one clock edge.", why: "Instruction bits control which values enter the ALU and where the result is written.", connection: "At M=D+M, D and the selected memory value meet at the ALU. The sum is written to the stack." },
  alu: { label: "ALU", subtitle: "The arithmetic", title: "Arithmetic is now hardware.", description: "Sixteen-bit inputs. Sixteen-bit output. The same operation.", what: "The arithmetic logic unit configured for addition.", why: "The ALU performs arithmetic and Boolean operations on binary words according to six control bits.", connection: "The recorded source operands become sixteen-bit binary inputs to the ALU." },
  gate: { label: "Logic Gates", subtitle: "The bit slice", title: "One bit. A sum and a carry.", description: "Zoom into one small slice of the 16-bit addition.", what: "A full adder made from two half adders and an OR gate.", why: "XOR produces sum bits; AND and OR produce carries. Connecting sixteen slices adds two words.", connection: "Each selected bit comes from the focused source addition. Its carry feeds the next bit." },
  nand: { label: "NAND", subtitle: "The foundation", title: "Finally, only NAND.", description: "The gates above reduce to one Boolean primitive.", what: "The selected adder primitive constructed entirely from NAND gates.", why: "NAND is universal: XOR, AND, and OR can all be built from it.", connection: "These constructions replace every primitive in the displayed full adder. Repeated bit slices implement the original source addition." },
};
export function Ladder({ active, onChange, busy = false }: { active: Layer; onChange: (layer: Layer) => boolean; busy?: boolean }) {
  const navRef = useRef<HTMLElement>(null);
  function navigate(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const index = Math.max(0, Math.min(LAYERS.length - 1, LAYERS.indexOf(active) + (event.key === "ArrowDown" ? 1 : -1)));
    if (onChange(LAYERS[index])) navRef.current?.querySelectorAll("button")[index].focus({ preventScroll: true });
  }
  return <nav className="ladder" aria-label="Abstraction levels" ref={navRef} onKeyDown={navigate}><div className="ladder-top"><span className="eyebrow">ABSTRACTION</span><span>High level</span></div><ol>{LAYERS.map((layer, index) => <li key={layer} className={active === layer ? "active" : ""}><button aria-current={active === layer ? "step" : undefined} aria-disabled={busy || undefined} onClick={() => onChange(layer)}><span className="ladder-index">{String(index + 1).padStart(2, "0")}</span><span className="ladder-copy"><strong>{LAYER_INFO[layer].label}</strong><small>{LAYER_INFO[layer].subtitle}</small></span>{active === layer && <span className="ladder-arrow">↗</span>}</button></li>)}</ol><div className="ladder-bottom"><span>Low level</span><span className="eyebrow">SAME OPERATION</span></div><div className="ladder-help"><kbd>↑</kbd><kbd>↓</kbd><span>Move between layers</span></div></nav>;
}




