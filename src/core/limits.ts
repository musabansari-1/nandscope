export const LIMITS = { sourceCharacters: 12000, statements: 128, functions: 12, syntaxDepth: 24, arraySize: 64, vmCommands: 2048, romInstructions: 16000, cycles: 12000, stackEnd: 1536, heapStart: 2048, heapEnd: 8192 } as const;
export const signed = (value: number) => value >= 32768 ? value - 65536 : value;
