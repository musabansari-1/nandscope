import { describe, expect, it } from "vitest";
import { assembleInstruction, COMP } from "./assembler";
import { binary, decodeControls, evaluateALU, word } from "./alu";
import { executeMachineInstruction, initialState } from "./cpu";
import { and, buildNandNetwork, evaluateNandNetwork, fullAdder, halfAdder, nand, or, rippleAdd, xor, type Bit, type Primitive } from "./gates";
import { createDemo, originatingVM } from "./trace/demo";
import { ancestors, descendants, LAYERS, relatedNodes } from "./trace/graph";
import { executeVM, PROGRAM } from "./vm";

describe("Boolean primitives and adders", () => {
  for (const a of [0, 1] as Bit[]) for (const b of [0, 1] as Bit[]) {
    it(`evaluates every two-input truth table at ${a}, ${b}`, () => {
      expect(nand(a, b)).toBe(1 - a * b);
      expect(and(a, b)).toBe(a * b);
      expect(or(a, b)).toBe(a || b);
      expect(xor(a, b)).toBe((a + b) % 2);
      expect(halfAdder(a, b)).toEqual({ sum: (a + b) % 2, carry: Math.floor((a + b) / 2) });
      for (const kind of ["xor", "and", "or"] as Primitive[]) {
        const network = buildNandNetwork(kind);
        const signals = evaluateNandNetwork(network, a, b);
        const expected = { xor: (a + b) % 2, and: a * b, or: a || b, not: 1 - a };
        expect(signals[network.output]).toBe(expected[kind]);
        expect(network.stages).toBe(Math.max(...Object.values(network.depths)));
        for (const gate of network.gates) for (const input of gate.inputs) expect(network.depths[input]).toBeLessThan(network.depths[gate.id]);
      }
    });
    for (const cin of [0, 1] as Bit[]) it(`full adder handles ${a} + ${b} + carry ${cin}`, () => {
      const result = fullAdder(a, b, cin);
      expect(result.sum + 2 * result.carry).toBe(a + b + cin);
    });
  }
  it("propagates carries across all sixteen bits, including overflow", () => {
    for (const a of [0, 1, 2, 3, 255, 32767, 32768, 65535]) for (const b of [0, 1, 3, 257, 32768, 65535]) {
      const result = rippleAdd(a, b);
      expect(result.output).toBe((a + b) & 0xffff);
      expect(result.carry).toBe(a + b > 65535 ? 1 : 0);
      result.slices.forEach((slice, index) => expect(slice.cin).toBe(index === 0 ? 0 : result.slices[index - 1].carry));
    }
    expect(rippleAdd(2, 3).slices.slice(0, 3).map(slice => [slice.sum, slice.carry])).toEqual([[1, 0], [0, 1], [1, 0]]);
  });
});

describe("Hack assembly encoding", () => {
  it.each([
    ["@2", "0000000000000010"], ["@SP", "0000000000000000"], ["@R13", "0000000000001101"], ["@32767", "0111111111111111"],
    ["D=A", "1110110000010000"], ["AM=M-1", "1111110010101000"], ["M=D+M", "1111000010001000"], ["0;JMP", "1110101010000111"],
  ])("encodes %s as %s", (source, bits) => {
    const encoded = assembleInstruction(source);
    expect(encoded.bits).toBe(bits);
    expect(binary(encoded.value)).toBe(bits);
  });
  it("splits the real ADD instruction into documented fields", () => {
    expect(assembleInstruction("M=D+M").fields).toEqual({ kind: "C", prefix: "111", comp: "1000010", dest: "001", jump: "000", compName: "D+M", destName: "M", jumpName: "none" });
  });
  it.each(["@-1", "@32768", "@unknown", "M=A+M", "DD=D", "D;MAYBE", "@", "(label)"])("rejects invalid or unsupported P0 syntax: %s", source => expect(() => assembleInstruction(source)).toThrow());
  it("encodes the complete fixture against a fixed binary reference", () => {
    const demo = createDemo();
    expect(demo.machine.map(line => line.bits)).toEqual([
      "0000000000000010", "1110110000010000", "0000000000000000", "1111110000100000", "1110001100001000", "0000000000000000", "1111110111001000",
      "0000000000000011", "1110110000010000", "0000000000000000", "1111110000100000", "1110001100001000", "0000000000000000", "1111110111001000",
      "0000000000000000", "1111110010101000", "1111110000010000", "1110110010100000", "1111000010001000",
      "0000000000000001", "1111110000010000", "0000000000000000", "1110000010010000", "0000000000001101", "1110001100001000", "0000000000000000", "1111110010101000", "1111110000010000", "0000000000001101", "1111110000100000", "1110001100001000",
    ]);
  });
});

describe("ALU and CPU behavior", () => {
  it("every documented comp encoding computes the expected result", () => {
    for (const [d, a, m] of [[2, 3, 7], [0, 65535, 32768], [65535, 1, 255]]) {
      const expected: Record<string, number> = { "0": 0, "1": 1, "-1": -1, D: d, A: a, M: m,
        "!D": ~d, "!A": ~a, "!M": ~m, "-D": -d, "-A": -a, "-M": -m, "D+1": d + 1, "A+1": a + 1, "M+1": m + 1,
        "D-1": d - 1, "A-1": a - 1, "M-1": m - 1, "D+A": d + a, "D+M": d + m, "D-A": d - a, "D-M": d - m,
        "A-D": a - d, "M-D": m - d, "D&A": d & a, "D&M": d & m, "D|A": d | a, "D|M": d | m };
      for (const comp of Object.keys(COMP)) {
        const instruction = assembleInstruction(`D=${comp}`).value;
        const result = evaluateALU(d, instruction & 0x1000 ? m : a, decodeControls(instruction));
        expect(result.output, comp).toBe(word(expected[comp]));
        expect(result.zr).toBe(result.output === 0);
        expect(result.ng).toBe(result.output >= 32768);
      }
    }
  });
  it("AM destinations write memory using the old A, without mutating the input state", () => {
    const state = initialState();
    state.a = 0; state.ram[0] = 258;
    const frame = executeMachineInstruction(state, assembleInstruction("AM=M-1").value);
    expect(frame.after.a).toBe(257);
    expect(frame.after.ram[0]).toBe(257);
    expect(frame.after.ram[257]).toBe(0);
    expect(state.ram[0]).toBe(258);
    expect(frame.before.ram[0]).toBe(258);
  });
  it("simultaneous A destination and jump use the previous A as the jump target", () => {
    const state = initialState(); state.a = 100; state.d = 7;
    const frame = executeMachineInstruction(state, assembleInstruction("A=D;JMP").value);
    expect(frame.after.a).toBe(7); expect(frame.after.pc).toBe(100);
  });
  it("jump conditions use signed ALU flags", () => {
    const conditions: Record<string, (value: number) => boolean> = { JGT: v => v > 0, JEQ: v => v === 0, JGE: v => v >= 0, JLT: v => v < 0, JNE: v => v !== 0, JLE: v => v <= 0, JMP: () => true };
    for (const [jump, condition] of Object.entries(conditions)) for (const signed of [-1, 0, 1]) {
      const state = initialState(); state.a = 100; state.d = word(signed);
      expect(executeMachineInstruction(state, assembleInstruction(`D;${jump}`).value).after.pc).toBe(condition(signed) ? 100 : 1);
    }
  });
  it("executes the entire P0 program and matches the VM stack at every boundary", () => {
    const demo = createDemo();
    for (const vmFrame of demo.vmFrames) {
      const group = demo.assembly.filter(line => line.vmId === vmFrame.id);
      const before = demo.frames[group[0].address].before;
      const after = demo.frames[group.at(-1)!.address].after;
      expect([...before.ram.slice(256, before.ram[0])]).toEqual(vmFrame.before);
      expect([...after.ram.slice(256, after.ram[0])]).toEqual(vmFrame.after);
      if (vmFrame.local !== null) expect(after.ram[300]).toBe(vmFrame.local);
    }
    const add = demo.frames[demo.additionIndex];
    expect(add.before.d).toBe(3); expect(add.before.a).toBe(256); expect(add.before.ram[256]).toBe(2);
    expect(add.alu!.output).toBe(5); expect(add.after.ram[256]).toBe(5);
    expect(demo.frames.at(-1)!.after.ram[300]).toBe(5);
    expect(demo.frames.at(-1)!.after.ram[0]).toBe(256);
    expect(demo.frames).toHaveLength(31);
  });
  it("rejects VM stack underflow", () => expect(() => executeVM([PROGRAM[2]])).toThrow("Stack underflow"));
});

describe("trace identity", () => {
  const demo = createDemo();
  it("connects the source + to all eight layers with explicit edges", () => {
    const connected = descendants(demo.graph, "source:plus");
    expect(new Set(demo.graph.nodes.filter(node => connected.has(node.id)).map(node => node.layer))).toEqual(new Set(LAYERS));
    for (const line of demo.assembly.filter(line => line.vmId === "vm:add")) {
      expect(connected.has(line.id)).toBe(true);
      expect(connected.has(`machine:${line.address}`)).toBe(true);
      expect(connected.has(`cpu:${line.address}`)).toBe(true);
    }
    for (let bit = 0; bit < 16; bit++) for (const primitive of ["xor", "and", "or"]) expect(connected.has(`nand:bit${bit}:${primitive}`)).toBe(true);
    expect(connected.has("vm:push2")).toBe(false);
  });
  it("can trace a selected NAND network back to the source +", () => {
    const parents = ancestors(demo.graph, "nand:bit1:xor");
    for (const id of ["source:plus", "vm:add", `assembly:${demo.additionIndex}`, `machine:${demo.additionIndex}`, `cpu:${demo.additionIndex}`, "alu:add", "gate:add16", "gate:bit1", "gate:bit1:xor"]) expect(parents.has(id)).toBe(true);
    expect(originatingVM(demo, "nand:bit1:xor")!.id).toBe("vm:add");
  });
  it("does not mistake operand movement for source arithmetic", () => {
    expect(relatedNodes(demo.graph, "machine:0").has("source:plus")).toBe(false);
    expect(originatingVM(demo, "machine:0")!.id).toBe("vm:push2");
    expect(descendants(demo.graph, "cpu:14").has("alu:add")).toBe(false);
  });
  it("has unique IDs, valid edge endpoints and deterministic generation", () => {
    const ids = new Set(demo.graph.nodes.map(node => node.id));
    expect(ids.size).toBe(demo.graph.nodes.length);
    for (const edge of demo.graph.edges) { expect(ids.has(edge.from)).toBe(true); expect(ids.has(edge.to)).toBe(true); }
    const repeat = createDemo();
    expect(repeat.graph).toEqual(demo.graph);
    expect(repeat.machine).toEqual(demo.machine);
    expect(repeat.frames.map(frame => [frame.after.pc, frame.after.a, frame.after.d, frame.after.ram[0], frame.after.ram[300]])).toEqual(demo.frames.map(frame => [frame.after.pc, frame.after.a, frame.after.d, frame.after.ram[0], frame.after.ram[300]]));
  });
});
