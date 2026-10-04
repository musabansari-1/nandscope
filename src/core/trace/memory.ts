import type { Demo } from "./demo";
import type { StorageSymbol } from "../parser";
export function memorySnapshot(demo: Demo, cycleIndex: number) {
  const frame = demo.frames[cycleIndex], ram = frame.after.ram, base = ram[1];
  const active = frame.callStack.at(-1);
  const symbols = [...Object.values(demo.symbols), ...(active ? Object.values(demo.functions[active.name].symbols) : [])];
  function cell(symbol: StorageSymbol) {
    const location = (symbol.segment === "static" ? 1536 : symbol.scope === "main" ? (demo.functions && Object.keys(demo.functions).length ? 300 : base) : symbol.segment === "argument" ? active!.arg : active!.lcl) + symbol.index;
    const beforeValue = frame.before.ram[location], value = ram[location];
    return { symbol, address: location, beforeValue, value, written: frame.memory.write && frame.memory.address === location, changed: beforeValue !== value, read: !frame.memory.write && frame.usesY && frame.ySource === "M" && frame.memory.address === location };
  }
  const cells = symbols.map(cell);
  const arrays = cells.filter(c => demo.allocations.some(a => a.base === c.value && a.cycleIndex <= cycleIndex)).map(c => ({ name: c.symbol.name, base: c.value, size: ram[c.value - 1], cells: Array.from({ length: ram[c.value - 1] }, (_, i) => ({ address: c.value + i, index: i, value: ram[c.value + i], beforeValue: frame.before.ram[c.value + i], active: frame.memory.address === c.value + i && (frame.memory.write || frame.usesY && frame.ySource === "M") })) }));
  const screenAddresses = [...new Set(demo.frames.slice(0, cycleIndex + 1).filter(f => f.memory.address >= 16384 && f.memory.address < 24576 && (f.memory.write || f.usesY && f.ySource === "M")).map(f => f.memory.address))].slice(0, 16);
  return { base, cells, arrays, stack: Array.from(ram.slice(Math.max(256, ram[0] - 12), Math.min(ram[0], 1536))), stackStart: Math.max(256, ram[0] - 12), sp: ram[0], arg: ram[2], keyboard: ram[24576], screen: screenAddresses.map(address => ({ address, value: ram[address] })) };
}

