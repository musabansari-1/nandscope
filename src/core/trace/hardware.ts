import { and, or, not, type Bit, type Primitive, type rippleAdd } from "../gates";

interface HardwareOccurrence {
  operationId: string; vmId: string; address: number; cycleIndex: number;
  romAddress: number; left: number; right: number; aluId: string; gateId: string;
}
export interface ArithmeticTrace extends HardwareOccurrence {
  class: "arithmetic"; operator: "+" | "-"; hardwareRight: number; carryIn: number;
  addition: ReturnType<typeof rippleAdd>;
}
export interface BitwiseTrace extends HardwareOccurrence {
  class: "bitwise"; operator: "&" | "|" | "~"; primitive: Exclude<Primitive, "xor">;
  output: number; slices: { index: number; a: Bit; b: Bit; output: Bit }[];
}
export type HardwareTrace = ArithmeticTrace | BitwiseTrace;

// These circuits describe operands sampled from a real CPU edge. They do not
// evaluate source expressions or replace machine execution.
export function bitwiseSlices(primitive: BitwiseTrace["primitive"], left: number, right: number) {
  return Array.from({ length: 16 }, (_, index) => {
    const a = ((left >>> index) & 1) as Bit, b = ((right >>> index) & 1) as Bit;
    return { index, a, b, output: primitive === "and" ? and(a, b) : primitive === "or" ? or(a, b) : not(a) };
  });
}
