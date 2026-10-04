import { describe, expect, it } from "vitest";
import { createDemo } from "../../core/trace/demo";
import { DEFAULT_SOURCE } from "../../core/vm";
import { arithmeticAvailable, relationship, sourceAnchor, vmAnchor } from "./anchors";
import type { Transition } from "./state";

describe("P4 microscope focus", () => {
  const demo = createDemo(DEFAULT_SOURCE);
  it("hands a variable read to its real VM command and reverses the same mapping", () => {
    const focus = demo.focuses.find(focus => focus.role === "read" && focus.label === "y")!;
    const command = demo.vm.find(command => command.sourceId === focus.id)!;
    const down: Transition = { id: 1, from: "source", to: "vm", direction: "deeper", phase: "preparing", reducedMotion: false, inspection: { operationId: focus.id, address: 48, bit: 1, primitive: "xor" } };
    const mapping = relationship(demo, down);
    expect(mapping).toMatchObject({ source: sourceAnchor(focus.id), destination: `${vmAnchor(command.id)}-label` });
    const reverse = relationship(demo, { ...down, from: "vm", to: "source", direction: "shallower" });
    expect(reverse.source).toBe(mapping.destination); expect(reverse.destination).toBe(mapping.source);
  });
  it("unfolds the selected store's actual assembly group", () => {
    const focus = demo.focuses.find(focus => focus.role === "write" && focus.label === "result")!;
    const command = demo.vm.find(command => command.sourceId === focus.id)!;
    const transition: Transition = { id: 1, from: "vm", to: "assembly", direction: "deeper", phase: "preparing", reducedMotion: false, inspection: { operationId: focus.id, address: 63, bit: 1, primitive: "xor" } };
    expect(relationship(demo, transition)).toMatchObject({ group: command.id, kind: "unfold" });
  });
  it("offers hardware only at the selected addition, including later additions", () => {
    const multiple = createDemo("let x = 2 + 3; let y = x + 1;");
    const second = multiple.additions[1];
    const inspection = { operationId: second.operationId, address: second.address, bit: 1, primitive: "xor" as const };
    expect(arithmeticAvailable(multiple, inspection)).toBe(true);
    expect(arithmeticAvailable(multiple, { ...inspection, address: multiple.additions[0].address })).toBe(false);
    expect(arithmeticAvailable(multiple, { ...inspection, operationId: multiple.focuses[0].id })).toBe(false);
  });
  it("handles no-addition programs without inventing hardware operands", () => {
    const simple = createDemo("let x = 7;");
    const transition: Transition = { id: 1, from: "cpu", to: "alu", direction: "deeper", phase: "preparing", reducedMotion: false, inspection: { operationId: simple.focuses[0].id, address: 0, bit: 1, primitive: "xor" } };
    expect(relationship(simple, transition)).toMatchObject({ kind: "context", destination: "arithmetic-context" });
  });
});
