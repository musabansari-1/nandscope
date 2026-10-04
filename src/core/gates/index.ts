export type Bit = 0 | 1;
export const nand = (a: Bit, b: Bit): Bit => a && b ? 0 : 1;
export const not = (a: Bit): Bit => nand(a, a);
export const and = (a: Bit, b: Bit): Bit => not(nand(a, b));
export const or = (a: Bit, b: Bit): Bit => nand(not(a), not(b));
export function xor(a: Bit, b: Bit): Bit {
  const n = nand(a, b);
  return nand(nand(a, n), nand(b, n));
}
export const halfAdder = (a: Bit, b: Bit) => ({ sum: xor(a, b), carry: and(a, b) });
export function fullAdder(a: Bit, b: Bit, cin: Bit) {
  const first = halfAdder(a, b);
  const second = halfAdder(first.sum, cin);
  return { a, b, cin, p: first.sum, c1: first.carry, c2: second.carry, sum: second.sum, carry: or(first.carry, second.carry) };
}

export interface BitSlice extends ReturnType<typeof fullAdder> { index: number }
export function rippleAdd(a: number, b: number, carryIn: Bit = 0) {
  let carry: Bit = carryIn;
  let output = 0;
  const slices: BitSlice[] = [];
  for (let index = 0; index < 16; index++) {
    const slice: BitSlice = { index, ...fullAdder(((a >>> index) & 1) as Bit, ((b >>> index) & 1) as Bit, carry) };
    output |= slice.sum << index;
    carry = slice.carry;
    slices.push(slice);
  }
  return { output, carry, slices };
}

export type Primitive = "xor" | "and" | "or" | "not";
export interface NandGate { id: string; inputs: [string, string]; x: number; y: number }
export interface NandNetwork { gates: NandGate[]; output: string; depths: Record<string, number>; stages: number }
// Feed-forward networks; coordinates are presentation hints, not evaluation order.
export function buildNandNetwork(kind: Primitive): NandNetwork {
  const gates: NandGate[] = kind === "not" ? [{ id: "n1", inputs: ["a", "a"], x: 420, y: 160 }] : kind === "xor" ? [
    { id: "n1", inputs: ["a", "b"], x: 230, y: 160 },
    { id: "n2", inputs: ["a", "n1"], x: 420, y: 85 },
    { id: "n3", inputs: ["n1", "b"], x: 420, y: 235 },
    { id: "n4", inputs: ["n2", "n3"], x: 610, y: 160 },
  ] : kind === "and" ? [
    { id: "n1", inputs: ["a", "b"], x: 280, y: 160 },
    { id: "n2", inputs: ["n1", "n1"], x: 520, y: 160 },
  ] : [
    { id: "n1", inputs: ["a", "a"], x: 280, y: 85 },
    { id: "n2", inputs: ["b", "b"], x: 280, y: 235 },
    { id: "n3", inputs: ["n1", "n2"], x: 520, y: 160 },
  ];
  const depths: Record<string, number> = { a: 0, b: 0 };
  for (const gate of gates) depths[gate.id] = 1 + Math.max(...gate.inputs.map(input => depths[input]));
  const output = gates.at(-1)!.id;
  return { gates, output, depths, stages: depths[output] };
}

export function evaluateNandNetwork(network: NandNetwork, a: Bit, b: Bit) {
  const signals: Record<string, Bit> = { a, b };
  for (const gate of network.gates) signals[gate.id] = nand(signals[gate.inputs[0]], signals[gate.inputs[1]]);
  return signals;
}

