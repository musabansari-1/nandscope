import { decodeControls, evaluateALU } from "../alu";
import { LIMITS } from "../limits";
import { RAM } from "./ram";

export interface MachineState { pc: number; a: number; d: number; ram: RAM }
export interface ExecutionFrame {
  index: number; cycleIndex: number; romAddress: number; jump: { bits: number; taken: boolean; target: number; backward: boolean }; instruction: number; before: MachineState; after: MachineState;
  alu: ReturnType<typeof evaluateALU> | null;
  memory: { address: number; input: number; output: number | null; write: boolean };
  destinations: string[]; usesD: boolean; usesY: boolean; ySource: "A" | "M";
  explanation: string;
}
export function initialState(keyboard = 0): MachineState {
  const ram = new RAM();
  ram[0] = 256;
  ram[1] = 300; ram[16] = LIMITS.heapStart; ram[24576] = keyboard;
  return { pc: 0, a: 0, d: 0, ram };
}
export function executeMachineInstruction(state: MachineState, instruction: number): ExecutionFrame {
  const before = { ...state, ram: state.ram.fork() };
  const after = { ...state, pc: (state.pc + 1) & 0x7fff, ram: state.ram.fork() };
  // Memory writes and jumps use A BEFORE the clock edge, including AM destinations.
  const address = state.a & 0x7fff;
  const input = state.ram[address];
  if ((instruction & 0x8000) === 0) {
    after.a = instruction & 0x7fff;
    return { index: state.pc, cycleIndex: 0, romAddress: state.pc, jump: { bits: 0, taken: false, target: address, backward: false }, instruction, before, after, alu: null, memory: { address, input, output: null, write: false }, destinations: ["A"], usesD: false, usesY: false, ySource: "A", explanation: `Load ${after.a} into A. Advance PC to ${after.pc}.` };
  }
  const controls = decodeControls(instruction);
  const ySource = instruction & 0x1000 ? "M" : "A";
  const alu = evaluateALU(state.d, ySource === "M" ? input : state.a, controls);
  const destinations: string[] = [];
  if (instruction & 0x20) { after.a = alu.output; destinations.push("A"); }
  if (instruction & 0x10) { after.d = alu.output; destinations.push("D"); }
  const write = !!(instruction & 8);
  if (write && address !== 24576) { after.ram[address] = alu.output; destinations.push("M"); }
  const jump = instruction & 7;
  const takeJump = (!!(jump & 4) && alu.ng) || (!!(jump & 2) && alu.zr) || (!!(jump & 1) && !alu.ng && !alu.zr);
  if (takeJump) after.pc = address;
  const target = destinations.map(dest => dest === "M" ? `RAM[${address}]` : dest).join(" and ") || "no destination";
  return { index: state.pc, cycleIndex: 0, romAddress: state.pc, jump: { bits: jump, taken: takeJump, target: address, backward: takeJump && address <= state.pc }, instruction, before, after, alu, memory: { address, input, output: write ? alu.output : null, write }, destinations, usesD: !controls.zx, usesY: !controls.zy, ySource,
    explanation: `The ALU produces ${alu.output}. Write to ${target}. ${takeJump ? "Jump" : "Advance"} PC to ${after.pc}.` };
}

export function executeRun(rom: number[], options: { keyboard?: number; maxCycles?: number; state?: MachineState; trapAddress?: number; trapJumps?: number[] } = {}) {
  let state = options.state ?? initialState(options.keyboard);
  const frames: ExecutionFrame[] = [];
  let stopReason: string | null = null;
  const maxCycles = Math.min(options.maxCycles ?? LIMITS.cycles, LIMITS.cycles);
  while (state.pc < rom.length) {
    if (frames.length >= maxCycles) { stopReason = `Execution stopped after ${maxCycles} cycles. The program may contain an infinite loop or excessive recursion.`; break; }
    if (state.ram[0] >= LIMITS.heapStart || state.ram[0] < 256) { stopReason = `Execution stopped: stack exceeded RAM[256..${LIMITS.heapStart - 1}].`; break; }
    const frame = executeMachineInstruction(state, rom[state.pc]);
    frame.index = frames.length; frame.cycleIndex = frames.length;
    frames.push(frame); state = frame.after;
    if (options.trapAddress !== undefined && frame.jump.taken && frame.after.pc === options.trapAddress && (options.trapJumps ?? []).includes(frame.romAddress)) { stopReason = "Execution stopped: uninitialized pointer, array bounds, heap capacity, or screen offset exceeded."; break; }
  }
  return { frames, stopReason };
}
export function executeProgram(rom: number[], options: Parameters<typeof executeRun>[1] = {}): ExecutionFrame[] { return executeRun(rom, options).frames; }

