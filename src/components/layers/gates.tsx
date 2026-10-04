import type { Primitive } from "@/core/gates";
import { BitPicker, Block, Diagram, Wire } from "../shared/diagram";
import type { LayerProps } from "../shared/types";
import { focusedAddition, focusedHardware } from "@/core/trace/demo";
import { BitwiseGates } from "./bitwise";

export function GatesLayer(props: LayerProps) {
  const { demo, operationId, address, bit, primitive, onBit, onPrimitive } = props;
  const hardware = focusedHardware(demo, operationId, address)!;
  if (hardware.class === "bitwise") return <BitwiseGates {...props} operation={hardware} />;
  const addition = focusedAddition(demo, operationId, address)!;
  const slice = addition.addition.slices[bit];
  const windowStart = Math.min(Math.max(bit - 1, 0), 12);
  const neighbors = addition.addition.slices.slice(windowStart, windowStart + 4).reverse();
  return <div className="gates-scene"><BitPicker bit={bit} onBit={onBit} />
    <div className="slice-values"><span>A<sub>{bit}</sub> = <b>{slice.a}</b></span><span>B<sub>{bit}</sub> = <b>{slice.b}</b></span><span>Carry in = <b>{slice.cin}</b></span><span className="slice-result">Sum = <b>{slice.sum}</b> · Carry out = <b>{slice.carry}</b></span></div>
    <Diagram label={`Full adder bit ${bit}: A ${slice.a}, B ${slice.b}, carry in ${slice.cin}, sum ${slice.sum}, carry out ${slice.carry}`} viewBox="0 0 800 370">
      <g data-visual-anchor="gate-full-adder">
      <rect x={145} y={35} width={205} height={265} rx={14} className="half-adder" /><text x={162} y={22} className="signal-label">HALF ADDER 1</text>
      <rect x={410} y={35} width={180} height={265} rx={14} className="half-adder" /><text x={423} y={22} className="signal-label">HALF ADDER 2</text>
      <Wire d="M55 85 H170" label={`A = ${slice.a}`} x={75} y={68} />
      <Wire d="M55 160 H125 V110 H170" label={`B = ${slice.b}`} x={75} y={143} />
      <Wire d="M100 85 V238 H170" /> <Wire d="M125 160 V263 H170" />
      <Wire d="M290 96 H430" label={`p = ${slice.p}`} x={368} y={81} />
      <Wire d="M368 96 V238 H430" />
      <Wire d="M55 335 H390 V112 H430" label={`Cin = ${slice.cin}`} x={90} y={320} />
      <Wire d="M390 263 H430" />
      <Wire d="M550 96 H740" label={`SUM = ${slice.sum}`} x={673} y={80} />
      <Wire d="M290 250 H368 V305 H615 V238 H635" label={`c1 = ${slice.c1}`} x={353} y={287} />
      <Wire d="M550 250 H635" label={`c2 = ${slice.c2}`} x={600} y={274} />
      <Wire d="M735 250 H775" label={`CARRY = ${slice.carry}`} x={707} y={330} />
      <Block anchorId="gate-xor" x={170} y={60} width={120} title="XOR" value={String(slice.p)} />
      <Block anchorId="gate-and" x={170} y={214} width={120} title="AND" value={String(slice.c1)} />
      <Block x={430} y={60} width={120} title="XOR" value={String(slice.sum)} />
      <Block x={430} y={214} width={120} title="AND" value={String(slice.c2)} />
      <Block anchorId="gate-or" x={635} y={214} width={100} title="OR" value={String(slice.carry)} />
      </g>
    </Diagram>
    <div className="gate-formulas"><code>sum = (A XOR B) XOR Cin</code><code>carry = (A AND B) OR ((A XOR B) AND Cin)</code></div>
    <div className="carry-chain"><div className="carry-chain-label"><span>REPEAT THE SLICE × 16</span><span>← CARRY FLOWS TO THE NEXT BIT</span></div><div className="carry-slices">{neighbors.map((neighbor, index) => <div className="carry-fragment" key={neighbor.index}><button className={neighbor.index === bit ? "selected" : ""} onClick={() => onBit(neighbor.index)} aria-label={`Inspect bit ${neighbor.index}, sum ${neighbor.sum}`}><span>BIT {neighbor.index}</span><code>{neighbor.sum}</code></button>{index < neighbors.length - 1 && <div className="carry-link"><code>{neighbor.cin}</code><span>←</span></div>}</div>)}</div><span className="carry-chain-note">Four neighboring slices shown · the same circuit repeats across the word</span></div>
    <div className="primitive-picker"><span>INSPECT A PRIMITIVE</span>{(["xor", "and", "or"] as Primitive[]).map(kind => <button key={kind} aria-pressed={primitive === kind} onClick={() => onPrimitive(kind)}>{kind.toUpperCase()} <span>↓ NAND</span></button>)}</div>
    <p className="scene-note">Sixteen slices form the wider adder: each carry out becomes the next bit’s carry in.<br />Bits are numbered from the right, starting at 0. The final carry is discarded in 16-bit Hack arithmetic.</p>
  </div>;
}

