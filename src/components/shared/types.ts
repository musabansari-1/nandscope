import type { Demo } from "@/core/trace/demo";
import type { Primitive } from "@/core/gates";

export interface LayerProps {
  demo: Demo;
  related: Set<string>;
  address: number;
  bit: number;
  primitive: Primitive;
  operationId: string;
  onCompile?: (source: string, keyboard?: number) => string | null;
  playing?: boolean;
  entrySignalStage?: number; inspectedRom?: number; inspectedVM?: string; onROM: (romAddress: number) => void;
  onSelect: (id: string) => void;
  onInstruction: (address: number) => void;
  onBit: (bit: number) => void;
  onPrimitive: (primitive: Primitive) => void;
  onExplain?: (address: number) => void;
}

