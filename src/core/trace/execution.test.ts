import { describe, expect, it } from "vitest";
import { createDemo, originatingVM } from "./demo";
import { executionCursor, updateExecution, type ExecutionFocus } from "./execution";
import { ancestors } from "./graph";

const demo = createDemo();
const guided: ExecutionFocus = { operationId: "source:plus", address: demo.additionIndex };

describe("Shared execution cursor for the curated trace", () => {
  it("maps every ROM address to exactly one VM command and its graph provenance", () => {
    for (const line of demo.assembly) {
      const cursor = executionCursor(demo, line.address);
      expect(demo.vm.filter(vm => vm.id === line.vmId)).toHaveLength(1);
      expect(cursor.vm.id).toBe(line.vmId);
      expect(originatingVM(demo, line.id)?.id).toBe(cursor.vm.id);
      expect(cursor.instructionInVM).toBeGreaterThan(0);
      expect(cursor.instructionInVM).toBeLessThanOrEqual(cursor.instructionsInVM);
    }
  });
  it("synchronizes assembly, machine encoding, and deterministic CPU frame at every step", () => {
    for (let address = 0; address < demo.frames.length; address++) {
      const focus = updateExecution(demo, guided, { type: "seek", address });
      const cursor = executionCursor(demo, focus.address);
      expect(cursor.assembly.address).toBe(address);
      expect(cursor.machine.address).toBe(address);
      expect(cursor.machine.text).toBe(cursor.assembly.text);
      expect(cursor.machine.vmId).toBe(cursor.vm.id);
      expect(cursor.frame.index).toBe(address);
      expect(cursor.frame.before.pc).toBe(address);
      expect(cursor.frame.instruction).toBe(cursor.machine.value);
      expect(ancestors(demo.graph, `cpu:${address}`)).toContain(cursor.vm.id);
    }
  });
  it("keeps add active across all five instructions, with arithmetic only at ROM 18", () => {
    expect(demo.additionIndex).toBe(18);
    for (let address = 14; address <= 18; address++) {
      const cursor = executionCursor(demo, address);
      expect(cursor.vm.id).toBe("vm:add");
      expect(cursor.instructionsInVM).toBe(5);
      expect(cursor.instructionInVM).toBe(address - 13);
    }
    expect(executionCursor(demo, 13).vm.id).toBe("vm:push3");
    expect(executionCursor(demo, 19).vm.id).toBe("vm:pop");
    expect(executionCursor(demo, 18).assembly.text).toBe("M=D+M");
    expect(executionCursor(demo, 18).frame.alu?.output).toBe(5);
  });
  it("safely clamps previous, next and seeks at both bounds", () => {
    expect(updateExecution(demo, { ...guided, address: 0 }, { type: "step", delta: -1 }).address).toBe(0);
    expect(updateExecution(demo, { ...guided, address: 30 }, { type: "step", delta: 1 }).address).toBe(30);
    expect(updateExecution(demo, guided, { type: "seek", address: -99 }).address).toBe(0);
    expect(updateExecution(demo, guided, { type: "seek", address: 99 }).address).toBe(30);
  });
  it("preserves source:plus while seeking, stepping and selecting every VM group", () => {
    let focus = { ...guided, address: 0 };
    for (let address = 0; address < 31; address++) {
      expect(focus.operationId).toBe("source:plus");
      focus = updateExecution(demo, focus, { type: "step", delta: 1 });
      expect(updateExecution(demo, focus, { type: "seek", address }).operationId).toBe("source:plus");
    }
    for (const vm of demo.vm) {
      focus = updateExecution(demo, focus, { type: "vm", id: vm.id });
      expect(focus.operationId).toBe("source:plus");
      expect(executionCursor(demo, focus.address).vm.id).toBe(vm.id);
    }
  });
  it("selects the start of a new VM group and preserves an existing position within it", () => {
    expect(updateExecution(demo, guided, { type: "vm", id: "vm:add" })).toEqual(guided);
    const focus = updateExecution(demo, { ...guided, address: 0 }, { type: "vm", id: "vm:add" });
    expect(focus.address).toBe(14);
    expect(updateExecution(demo, focus, { type: "vm", id: "vm:pop" }).address).toBe(19);
  });
  it("reverses without changing precomputed machine snapshots", () => {
    const frame = executionCursor(demo, 18).frame;
    const beforeRAM = frame.before.ram.slice();
    const afterRAM = frame.after.ram.slice();
    let focus = guided;
    for (const delta of [-1, 1, -1, 1]) focus = updateExecution(demo, focus, { type: "step", delta });
    expect(focus).toEqual(guided);
    expect(executionCursor(demo, focus.address).frame).toBe(frame);
    expect(frame.before.ram.slice()).toEqual(beforeRAM);
    expect(frame.after.ram.slice()).toEqual(afterRAM);
  });
  it("changes operation identity only explicitly and returns to the addition frame", () => {
    const push = updateExecution(demo, guided, { type: "operation", id: "source:two" });
    expect(push).toEqual({ operationId: "source:two", address: 0 });
    expect(updateExecution(demo, push, { type: "step", delta: 1 }).operationId).toBe("source:two");
    expect(updateExecution(demo, push, { type: "operation", id: "source:plus" })).toEqual(guided);
  });
});

