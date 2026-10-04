// Copy-on-write pages retain independent clock-edge snapshots without copying
// all 32K cells per cycle. The CPU and views still use numeric indexing and slice.
export class RAM {
  [address: number]: number;
  readonly length = 32768;
  private pages: Uint16Array[];
  private owned = new Set<number>();
  constructor(pages?: Uint16Array[]) {
    this.pages = pages ? pages.slice() : Array.from({ length: 128 }, () => new Uint16Array(256));
    return new Proxy(this, {
      get: (target, property, receiver) => typeof property === "string" && /^\d+$/.test(property) ? target.read(Number(property)) : Reflect.get(target, property, receiver),
      set: (target, property, value, receiver) => {
        if (typeof property === "string" && /^\d+$/.test(property)) { target.write(Number(property), Number(value)); return true; }
        return Reflect.set(target, property, value, receiver);
      },
    });
  }
  read(address: number) { return address >= 0 && address < this.length ? this.pages[address >>> 8][address & 255] : 0; }
  write(address: number, value: number) {
    if (address < 0 || address >= this.length) throw new Error(`RAM address out of range: ${address}`);
    const page = address >>> 8;
    if (!this.owned.has(page)) { this.pages[page] = this.pages[page].slice(); this.owned.add(page); }
    this.pages[page][address & 255] = value & 65535;
  }
  fork(): RAM { this.owned.clear(); return new RAM(this.pages); }
  slice(start = 0, end = this.length): Uint16Array {
    const from = Math.max(0, start < 0 ? this.length + start : start), to = Math.min(this.length, end < 0 ? this.length + end : end);
    return Uint16Array.from({ length: Math.max(0, to - from) }, (_, i) => this.read(from + i));
  }
}
