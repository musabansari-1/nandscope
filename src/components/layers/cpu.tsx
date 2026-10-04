import { binary } from "@/core/alu";
import { Block, Diagram, Wire } from "../shared/diagram";
import type { LayerProps } from "../shared/types";

export function CPULayer({ demo, address }: LayerProps) {
  const frame = demo.frames[address];
  const instruction = demo.machine[frame.romAddress];
  const isC = !!frame.alu;
  const usesMemory = isC && frame.ySource === "M" && frame.usesY;
  return <div className="cpu-scene"><div className="cycle-selector"><span>ROM {String(frame.romAddress).padStart(2, "0")} <code>{instruction.text}</code></span></div>
    <Diagram label={`Hack CPU executing ${instruction.text}. ${frame.explanation}`} viewBox="0 0 800 470">
      <Wire d="M165 66 H255" label={String(frame.before.pc)} x={205} y={54} />
      <Wire d="M420 66 H535" label={binary(frame.instruction)} x={490} y={20} anchorId="cpu-instruction" />
      <Wire d="M615 102 V134 H165 V160" active={!isC} label={!isC ? String(frame.after.a) : "instruction"} x={388} y={126} />
      <Wire d="M615 102 V215 H585 V273" active={isC} label="control" x={650} y={190} />
      <Wire d="M200 196 H320" active={usesMemory || frame.memory.write} label={`addressM = ${frame.memory.address}`} x={255} y={149} />
      <Wire d="M470 196 H510 V245 H500 V273" active={usesMemory} label={`inM = ${frame.memory.input}`} x={503} y={227} />
      <Wire d="M130 232 V298 H390" active={isC && frame.ySource === "A" && frame.usesY} label={`A = ${frame.before.a}`} x={225} y={285} />
      <Wire d="M640 357 V323 H590" active={frame.usesD} label={`D = ${frame.before.d}`} x={640} y={302} />
      <Wire d="M490 347 V420 H395 V232" active={frame.memory.write} label={`outM = ${frame.alu?.output ?? "—"}`} x={365} y={402} />
      <Wire d="M490 347 V450 H165 V232" active={frame.destinations.includes("A") && isC} />
      <Wire d="M590 337 H640 V357" active={frame.destinations.includes("D")} label="loadD" x={682} y={345} />
      <Block x={45} y={30} width={120} title="PC" value={`${frame.before.pc} → ${frame.after.pc}`} />
      <Block x={255} y={30} width={165} title="Instruction ROM" value={`ROM[${frame.romAddress}]`} />
      <Block x={535} y={30} width={165} title="Decode / control" value={isC ? "C-instruction" : "A-instruction"} />
      <Block x={60} y={160} title="A register" value={`${frame.before.a} → ${frame.after.a}`} active={frame.destinations.includes("A") || (isC && frame.usesY)} />
      <Block x={320} y={160} width={150} title="Memory interface" value={`RAM[${frame.memory.address}] = ${frame.memory.input}`} active={usesMemory || frame.memory.write} />
      <Block anchorId="cpu-alu" x={390} y={273} width={200} height={74} title={`ALU · ${isC ? instruction.fields.kind === "C" ? instruction.fields.compName : "" : "idle"}`} value={frame.alu ? `${frame.alu.x}, ${frame.alu.y} → ${frame.alu.output}` : "not used"} active={isC} />
      <Block x={570} y={357} title="D register" value={`${frame.before.d} → ${frame.after.d}`} active={frame.usesD || frame.destinations.includes("D")} />
      <text x={420} y={395} className={`signal-label ${frame.memory.write ? "on" : ""}`}>writeM = {Number(frame.memory.write)}</text>
      <text x={49} y={394} className="signal-label">16-bit data · 15-bit address</text>
    </Diagram>
    <div className="pc-story"><span>PC BEFORE {frame.before.pc}</span><code>{instruction.fields.kind === "C" ? instruction.fields.jumpName : "no jump"}</code><span>{frame.jump.bits ? frame.jump.taken ? "TAKEN" : "NOT TAKEN" : "PC + 1"}</span><span>PC AFTER {frame.after.pc}{frame.jump.backward ? " · backward" : ""}</span><code>zr {frame.alu ? Number(frame.alu.zr) : "—"} · ng {frame.alu ? Number(frame.alu.ng) : "—"}</code></div><div className="cpu-story"><span className="eyebrow">ONE CLOCK EDGE</span><p>{frame.explanation}</p></div>
    <p className="scene-note">{demo.additions.some(addition => addition.address === address) ? `Here D holds ${frame.before.d} and M holds ${frame.memory.input}: the source operands meet at the ALU. The sum ${frame.alu?.output} returns to RAM[${frame.memory.address}].` : "Bright paths are used by this instruction; muted components are idle."}<br />The decoder is combinational. Hack has no separate instruction register.</p>
  </div>;
}



