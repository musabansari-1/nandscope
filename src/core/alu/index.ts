import { rippleAdd } from "../gates";

export const word = (value: number) => value & 0xffff;
export const binary = (value: number, width = 16) => word(value).toString(2).padStart(width, "0");
export interface ALUControls { zx: boolean; nx: boolean; zy: boolean; ny: boolean; f: boolean; no: boolean }
export function evaluateALU(x: number, y: number, controls: ALUControls) {
  let left = controls.zx ? 0 : word(x);
  let right = controls.zy ? 0 : word(y);
  if (controls.nx) left = word(~left);
  if (controls.ny) right = word(~right);
  let output = controls.f ? rippleAdd(left, right).output : left & right;
  if (controls.no) output = word(~output);
  return { x, y, output, zr: output === 0, ng: (output & 0x8000) !== 0, controls };
}
export function decodeControls(instruction: number): ALUControls {
  return { zx: !!(instruction & 0x800), nx: !!(instruction & 0x400), zy: !!(instruction & 0x200), ny: !!(instruction & 0x100), f: !!(instruction & 0x80), no: !!(instruction & 0x40) };
}
