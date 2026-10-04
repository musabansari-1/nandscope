import { useLayoutEffect, useRef } from "react";
import { executionCursor } from "@/core/trace/execution";
import type { LayerProps } from "../shared/types";
import { revealInstruction } from "../shared/reveal-instruction";

export function MachineLayer({ demo, address, related, inspectedRom, onROM }: LayerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    revealInstruction(listRef.current, true);
  }, [address]);
  const cursor = executionCursor(demo, address);
  const rom = inspectedRom ?? cursor.romAddress;
  const instruction = demo.machine[rom];
  const fields = instruction.fields;
  const parts = fields.kind === "C" ? [
    { bits: fields.prefix, name: "TYPE", meaning: "C-instruction" },
    { bits: fields.comp, name: "COMP", meaning: `${fields.compName} · ALU computation` },
    { bits: fields.dest, name: "DEST", meaning: `Write to ${fields.destName}` },
    { bits: fields.jump, name: "JUMP", meaning: fields.jumpName === "none" ? "Continue to next instruction" : fields.jumpName },
  ] : [{ bits: fields.prefix, name: "TYPE", meaning: "A-instruction" }, { bits: fields.address, name: "VALUE", meaning: `Load ${fields.value} into A` }];
  return <div className="machine-scene"><div className="encoding-origin"><span className="eyebrow">ROM ADDRESS {String(rom).padStart(2, "0")}</span><code>{instruction.symbolicText !== instruction.text ? `${instruction.symbolicText} → ${instruction.text}` : instruction.text}</code><span className="down-arrow">↓</span></div>
    <div data-visual-anchor="machine-fields" className={`bit-fields ${fields.kind === "A" ? "a-instruction" : ""}`}>{parts.map((part, index) => <div className={`bit-field field-${part.name.toLowerCase()}`} key={part.name}><code data-visual-anchor={`machine-field-${index}`}>{part.bits}</code><span>{part.name}</span><p>{part.meaning}</p></div>)}</div>
    {fields.kind === "C" && <div className="control-strip"><span>COMP BIT 12</span><code>a = {fields.comp[0]}</code><span>{fields.comp[0] === "1" ? "Read M = RAM[A]" : "Read the A register"}</span></div>}
    <div className="machine-table"><div className="table-heading"><span>ASSEMBLY</span><span>16-BIT INSTRUCTION</span></div><div className="machine-rows" ref={listRef}>{demo.machine.map(line => <button key={line.id} className={`${related.has(line.id) ? "traced-line" : ""} ${!demo.romCycles[line.address] ? "skipped-code" : ""} ${line.address === rom ? "current" : ""}`} onClick={() => onROM(line.address)} aria-pressed={line.address === rom}><span><small>{String(line.address).padStart(2, "0")}</small><code>{line.text}</code></span><code data-visual-anchor={line.address === rom ? "machine-word" : undefined}>{line.bits}</code></button>)}</div></div>
    <p className="scene-note">Every bit above is assembled from the selected instruction. These are the words loaded into ROM.</p>
  </div>;
}


