import { useState } from "react";
import { buildNandNetwork, evaluateNandNetwork, type Primitive } from "@/core/gates";
import { BitPicker, Diagram } from "../shared/diagram";
import type { LayerProps } from "../shared/types";
import { focusedHardware } from "@/core/trace/demo";

export function NANDLayer(props: LayerProps) {
  return <NANDSlice key={`${props.operationId}:${props.address}:${props.bit}:${props.primitive}`} {...props} />;
}
function NANDSlice({ demo, operationId, address, bit, primitive: selectedPrimitive, onBit, onPrimitive, entrySignalStage }: LayerProps) {
  const [manualStage, setStage] = useState<number | null>(null);
  const stage = manualStage ?? entrySignalStage ?? 0;
  const hardware = focusedHardware(demo, operationId, address)!;
  const bitwise = hardware.class === "bitwise";
  const primitive = bitwise ? hardware.primitive : selectedPrimitive;
  const slice = hardware.class === "arithmetic" ? hardware.addition.slices[bit] : undefined;
  // Inspect the FIRST XOR/AND in the displayed full adder; OR combines its two carries.
  const a = hardware.class === "bitwise" ? hardware.slices[bit].a : primitive === "or" ? slice!.c1 : slice!.a;
  const b = hardware.class === "bitwise" ? hardware.slices[bit].b : primitive === "or" ? slice!.c2 : slice!.b;
  const network = buildNandNetwork(primitive);
  const signals = evaluateNandNetwork(network, a, b);
  const positions = Object.fromEntries(network.gates.map(gate => [gate.id, { x: gate.x + 59, y: gate.y }]));
  positions.a = { x: 95, y: 85 }; positions.b = { x: 95, y: 235 };
  return <div className="nand-scene"><BitPicker bit={bit} onBit={onBit} /><div className="primitive-tabs" aria-label="Primitive NAND construction">{(bitwise ? [primitive] : ["xor", "and", "or"] as Primitive[]).map(kind => <button key={kind} onClick={() => onPrimitive(kind)} aria-pressed={primitive === kind}>{kind.toUpperCase()}<small>{kind === "not" ? "1 NAND" : kind === "xor" ? "4 NANDs" : kind === "and" ? "2 NANDs" : "3 NANDs"}</small></button>)}</div>
    <div className="nand-context"><code>{primitive.toUpperCase()}({a}{primitive !== "not" ? `, ${b}` : ""})</code><span>{bitwise ? primitive === "not" ? "NOT A = NAND(A, A)" : "Independent corresponding bits" : primitive === "or" ? "Combine c1 and c2 into carry out" : `First half adder · ${primitive === "xor" ? "partial sum" : "carry c1"}`} · bit {bit}</span></div>
    <Diagram label={`${primitive.toUpperCase()} made from ${network.gates.length} NAND gates. Propagation stage ${stage} of ${network.stages}.`} viewBox="0 0 800 330">
      <g data-visual-anchor="nand-network">
      {network.gates.flatMap(gate => gate.inputs.map((input, index) => {
        const start = positions[input];
        const end = { x: gate.x - 50, y: gate.y + (index === 0 ? -12 : 12) };
        const ready = network.depths[input] <= stage;
        const middle = (start.x + end.x) / 2 + (index ? 8 : -8);
        return <g key={`${gate.id}:${index}`} className={`nand-wire ${ready ? "resolved" : ""}`}><path d={`M${start.x} ${start.y} H${middle} V${end.y} H${end.x}`} /><text x={middle + 5} y={(start.y + end.y) / 2 - 5}>{ready ? signals[input] : "·"}</text></g>;
      }))}
      {network.gates.map(gate => {
        const ready = network.depths[gate.id] <= stage;
        return <g key={gate.id} className={`nand-gate ${ready ? "resolved" : ""}`}><rect x={gate.x - 50} y={gate.y - 32} width={100} height={64} rx={12} /><circle cx={gate.x + 54} cy={gate.y} r={5} /><text x={gate.x} y={gate.y - 5} textAnchor="middle">NAND</text><text x={gate.x} y={gate.y + 17} textAnchor="middle" className="gate-output">{ready ? signals[gate.id] : "?"}</text><text x={gate.x} y={gate.y + 53} textAnchor="middle" className="gate-id">{gate.id.toUpperCase()}</text></g>;
      })}
      <text x={36} y={64} className="signal-label">{!bitwise && primitive === "or" ? "c1" : "A"} = {a}</text>{primitive !== "not" && <text x={36} y={214} className="signal-label">{!bitwise && primitive === "or" ? "c2" : "B"} = {b}</text>}
      <g className={`nand-wire ${stage === network.stages ? "resolved" : ""}`}><path d={`M${positions[network.output].x} ${positions[network.output].y} H740`} /></g>
      <text x={751} y={170} className={`nand-final ${stage === network.stages ? "resolved" : ""}`}>{stage === network.stages ? signals[network.output] : "?"}</text>
      </g>
    </Diagram>
    <div className="propagation-controls"><button className="quiet-button" onClick={() => setStage(0)} disabled={stage === 0}>Reset signals</button><span>{stage === network.stages ? "OUTPUT RESOLVED" : `PROPAGATION ${stage} / ${network.stages}`}</span><button className="primary-button" disabled={stage === network.stages} onClick={() => setStage(stage + 1)}>Step signals <span>→</span></button></div>
    <div className="nand-law"><code>NAND(A, B) = NOT(A AND B)</code><span>Only two 1s produce a 0.</span></div>
    <p className="scene-note">Each step resolves one dependency depth. This is a logical teaching sequence, not a physical timing simulation.<br />{bitwise ? `The source ${hardware.operator} uses this ${primitive.toUpperCase()} construction at each bit independently.` : "Both XORs and ANDs use these same constructions. Together with OR, the entire adder can use only NAND."}</p>
  </div>;
}

