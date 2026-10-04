import type { Demo } from "./demo";
import { memorySnapshot } from "./memory";
import { signed } from "../limits";

export function pointerPath(demo: Demo, operationId: string, cycleIndex: number) {
  const focus = demo.focuses.find(f => f.id === operationId)!;
  const snapshot = memorySnapshot(demo, cycleIndex), ram = demo.frames[cycleIndex].after.ram;
  const symbol = focus.pointerSymbol ?? focus.symbol;
  const cell = snapshot.cells.find(c => c.symbol.id === symbol?.id);
  if (!cell) return { kind: "inactive", items: [focus.label, "storage belongs to an inactive frame"], address: undefined };
  const slot = `${symbol!.segment} ${symbol!.index}`;
  if (focus.role === "address-of") return { kind: "address-of", items: [focus.label, `${symbol!.name} → ${slot}`, `effective address ${cell.address}`, `${cell.address} (numeric address value)`], address: cell.address };
  if (focus.role === "dereference" || focus.role === "indirect-write") {
    if (cell.value === 0) return { kind: "pending", items: [focus.label, `RAM[${cell.address}] = 0`, "the pointer has not received its address yet"], address: undefined };
    return { kind: focus.role, items: [focus.label, `${symbol!.name} in RAM[${cell.address}] = ${cell.value}`, `effective address ${cell.value}`, `RAM[${cell.value}]`, `${signed(ram[cell.value])} (target value)`], address: cell.value };
  }
  if (symbol?.valueKind === "pointer") return { kind: "pointer", items: [symbol.name, `its own storage: ${slot}`, `RAM[${cell.address}] = ${cell.value}`, cell.value === 0 ? "address assignment pending" : `${cell.value} (stored address)`], address: cell.address };
  return { kind: "value", items: [symbol!.name, slot, `RAM[${cell.address}]`, `${signed(cell.value)} (stored value)`], address: cell.address };
}
