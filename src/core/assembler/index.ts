import { binary } from "../alu";
import { LIMITS } from "../limits";
import type { AssemblyLine } from "../vm";

// Hack's documented comp encodings (a + six ALU control bits).
export const COMP: Record<string, string> = {
  "0": "0101010", "1": "0111111", "-1": "0111010", "D": "0001100", "A": "0110000", "M": "1110000",
  "!D": "0001101", "!A": "0110001", "!M": "1110001", "-D": "0001111", "-A": "0110011", "-M": "1110011",
  "D+1": "0011111", "A+1": "0110111", "M+1": "1110111", "D-1": "0001110", "A-1": "0110010", "M-1": "1110010",
  "D+A": "0000010", "D+M": "1000010", "D-A": "0010011", "D-M": "1010011", "A-D": "0000111", "M-D": "1000111",
  "D&A": "0000000", "D&M": "1000000", "D|A": "0010101", "D|M": "1010101",
};
const JUMP: Record<string, number> = { "": 0, JGT: 1, JEQ: 2, JGE: 3, JLT: 4, JNE: 5, JLE: 6, JMP: 7 };
const SYMBOLS: Record<string, number> = { SP: 0, LCL: 1, ARG: 2, THIS: 3, THAT: 4, SCREEN: 16384, KBD: 24576,
  ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`R${i}`, i])) };
export type InstructionFields =
  | { kind: "A"; prefix: string; value: number; address: string }
  | { kind: "C"; prefix: string; comp: string; dest: string; jump: string; compName: string; destName: string; jumpName: string };
export interface EncodedInstruction { text: string; value: number; bits: string; fields: InstructionFields }

// Individual instruction encoding is also used after program label resolution.
export function assembleInstruction(source: string): EncodedInstruction {
  const text = source.replace(/\s/g, "");
  if (text.startsWith("@")) {
    const symbol = text.slice(1);
    const value = /^\d+$/.test(symbol) ? Number(symbol) : SYMBOLS[symbol];
    if (!Number.isInteger(value) || value < 0 || value > 32767) throw new Error(`Invalid A-instruction: ${source}`);
    return { text, value, bits: binary(value), fields: { kind: "A", prefix: "0", value, address: binary(value, 15) } };
  }
  const match = /^(?:([ADM]+)=)?([^=;]+)(?:;([A-Z]+))?$/.exec(text);
  if (!match) throw new Error(`Invalid C-instruction: ${source}`);
  const [, destName = "", compName, jumpName = ""] = match;
  if (new Set(destName).size !== destName.length || !COMP[compName] || !(jumpName in JUMP)) throw new Error(`Unsupported C-instruction: ${source}`);
  const destValue = (destName.includes("A") ? 4 : 0) | (destName.includes("D") ? 2 : 0) | (destName.includes("M") ? 1 : 0);
  const dest = destValue.toString(2).padStart(3, "0");
  const jump = JUMP[jumpName].toString(2).padStart(3, "0");
  const bits = `111${COMP[compName]}${dest}${jump}`;
  return { text, value: parseInt(bits, 2), bits, fields: { kind: "C", prefix: "111", comp: COMP[compName], dest, jump, compName, destName: destName || "none", jumpName: jumpName || "none" } };
}
export function assembleProgram(symbolic: AssemblyLine[]) {
  const labels: Record<string, number> = Object.create(null);
  let address = 0;
  for (const line of symbolic) {
    const text = line.text.replace(/\s/g, "");
    if (text.startsWith("(")) {
      const match = /^\(([A-Za-z_$.:][A-Za-z0-9_$.:]*)\)$/.exec(text);
      if (!match || Object.hasOwn(labels, match[1]) || Object.hasOwn(SYMBOLS, match[1])) throw new Error(`Invalid or duplicate label: ${text}`);
      labels[match[1]] = address;
    } else address++;
  }
  if (address > LIMITS.romInstructions) throw new Error(`Use at most ${LIMITS.romInstructions} ROM instructions.`);
  const assembly = symbolic.filter(line => !line.text.startsWith("(")).map((line, romAddress) => ({ ...line, id: `assembly:${romAddress}`, address: romAddress }));
  const machine = assembly.map(line => {
    const symbol = line.text.startsWith("@") ? line.text.slice(1) : "";
    const resolvedText = Object.hasOwn(labels, symbol) ? `@${labels[symbol]}` : line.text;
    return { ...line, ...assembleInstruction(resolvedText), symbolicText: line.text, id: `machine:${line.address}`, assemblyId: line.id };
  });
  return { symbolic, labels, assembly, machine };
}
