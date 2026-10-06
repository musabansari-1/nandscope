# NANDscope

Write code. Zoom down to NAND.

NANDscope is a small educational programming system. A typed source AST is compiled to a stack VM, symbolic Hack assembly, resolved machine words and real CPU execution. Explore names, arithmetic, pointers, bitwise operations, decisions, loops, stack frames, arrays and memory-mapped devices. Play recorded CPU cycles or follow an executed operation through the ALU, gates and NAND.

NANDscope now also answers **what changed**, **why this value**, and **how much machine work**. Guided remains the first visit. Explorer provides Compare, Share this view, Showcase, a collapsed Machine cost section, and a contextual “Why is …?” action on initialized named memory and written array cells.

## Release review test note

This documentation-only section exists to provide a harmless pull request for validating automated release-risk analysis. It does not change runtime behavior, dependencies, infrastructure, APIs, database state, or deployment configuration.

## Source-to-silicon debugging

- **Compare:** both sources independently pass through `createDemo`. Three presets cover addition vs AND, false vs true branches, and an inserted indirect write. Source blocks align by kind and target within their enclosing IF/ELSE/loop/function region. VM visits align by expression position, command family, call-name path and chronological occurrence. Missing visits remain explicit; cycles are never assumed equal. Six focused views connect source, VM, assembly, decoded machine fields, CPU and hardware. The first different recorded edge is separate from the first different conditional PC decision. The latter exposes real jump outcomes and subsequent executed source blocks.
- **Why is this value?** a cached forward dataflow index follows the CPU's actual A/D dependencies, RAM reads and accepted writes. The query chooses the last write at or before the selected cycle. Named reads, constants, source arithmetic/bitwise operations, executed comparisons, address-taking, pointer reads/writes, return values and branch decisions form a causal DAG. Pointer writes retain the actual pointer storage and target; function results retain the return's frame/call cycle and the caller's destination write separately. Loop writes carry their real iteration and link to earlier writes. The UI initially folds earlier loop causes, deduplicates repeated dependencies, bounds depth to seven and displays at most 48 expanded events. Inspect write / ALU / call frame and Go to previous value reuse the existing runtime cursor and microscope.
- **Machine cost:** ROM words come from generated machine data; cycles, unique executed ROM, ALU edges, RAM accesses, taken/backward jumps and maximum stack/call depth come from recorded frames. RAM reads include read-modify-write instructions that actually use M; RAM writes count accepted destinations, excluding ignored KBD writes. Stack words above RAM[256] include operands, arguments, local slots and saved calling state. Source hardware counts use tagged hardware occurrences. A selected occurrence measures its VM visit, rather than all loop repetitions. Partial executions are labeled.
- **Logical hardware cost:** primitive gate counts and depth come from `buildNandNetwork`. Arithmetic expands the same two half adders plus OR used by `fullAdder` into one connected NAND graph and propagates dependency depth through all sixteen carries. The displayed model has 240 NAND-equivalent gates for sixteen full-adder slices; AND has 32, OR 48 and NOT 16 across sixteen independent bits. These are logical structures, not transistor counts, physical area or latency. Subtraction's count describes the displayed equivalent ripple adder; preprocessing of the inverted operand is outside that selected circuit.
- **Share:** a version-1 `#ns=` fragment carries mode, a known example key or custom source, source focus, layer, cycle, bit, primitive, keyboard input, Guided concept/step, Compare sources/preset/semantic pair and optional exact paired cycles. UTF-8 JSON uses a small LZSS codec and URL-safe base64; links are capped at 8,000 token characters and decoded data at 30,000 bytes. No runtime snapshots are embedded or uploaded. Reload recompiles deterministically and validates the state. Malformed or uncompilable input falls back to Guided home. Web Share is used when available, otherwise the URL is copied; the native share flow also exposes a temporary copy action. Hash changes from navigation restore a view; creating a link does not reset the active session.
- **Showcase:** twelve three-second scenes use actual Demo instances and the existing layer renderers, pointer paths and jump frames. Play, Pause, Restart and a scene selector are available. The automatic sequence lasts 36 seconds: addition through NAND, addresses/dereferencing, a real conditional PC decision, then the end card. Presentation CSS removes editors and diagnostic lists and keeps all scenes and controls within a 1280×720 recording frame. Reduced motion disables entrance motion.

Pure utilities live in `src/core/trace/{compare,causes,cost,share,showcase}.ts`; presentation lives in `src/components/compare.tsx`, `showcase.tsx` and the small shared panels. No simulator, compiler or language feature was replaced. No dependency was added. The final verification server uses `http://127.0.0.1:3008`.

Alignment is deliberately structural, not a proof of semantic equivalence: renamed targets, reordered blocks, differently shaped expressions and repeated recursive calls can create unmatched visits. Within an aligned VM visit, first-divergence inspection pairs relative executable offsets, including legitimate differences caused by changed encodings and relocated labels. Causal folding is a bounded teaching view of the recorded dataflow; it does not explain physical timing. Share links contain the source and input word in the fragment, and very large custom programs may exceed the link budget. Existing execution and language bounds still apply.

## Run and verify

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm start
```

The current verification uses `http://127.0.0.1:3008` (`npm run start -- --port 3008`). Next.js 16.3.8 is installed; follow AGENTS.md and the bundled Next documentation before changing framework code. No dependency was added.

## Teaching language

```text
function max(a, b) {
    let result = b;
    if (a > b) { let result = a; }
    return result;
}
let values = array(4);
let values[0] = 7;
let values[1] = 9;
let answer = max(values[0], values[1]);
let key = keyboard();
screen(10, key);
```

- `let name = expression;` declares a slot on first assignment and reuses it on subsequent assignments. `let values[index] = expression;` writes an array element.
- Expressions support signed integer literals -32768..32767, names, parentheses, nested `+` and `-`, bitwise `&`, `|` and unary `~`, signed `<` and `>`, equality `==`, calls and array reads. From tightest to loosest: prefix operators, `+/-`, `</>`, `==`, `&`, `|`. Binary operators at the same precedence associate left to right. Unary minus applies to literals; write `0 - x` to negate an expression. `&&`, `||` and `^` are unsupported.
- `&identifier` takes a variable's actual RAM address; `*identifier` reads through a pointer. `let *p = expression;` writes through it. Example: `let x = 7; let p = &x; let y = *p + 1;` stores x=7, p=300 and y=8 with the ordinary main LCL=300. p itself occupies RAM[301]. Changing x through p changes that same real RAM cell.
- `if (expression) { ... }` has an optional `else`. `while (expression) { ... }` compiles to a repeated condition and backward jump. Zero is false; any nonzero condition is true. Comparisons produce exactly 0xFFFF (-1) or 0.
- Top-level `function name(parameters) { ... }` supports arguments, locals, nested calls, multiple calls, mutual calls and recursion. `return expression;` restores the caller and supplies one result. Falling through a function returns zero. Standalone calls discard their result.
- `array(n)` allocates 1..64 zero-initialized RAM words. Its size must be a literal. Array variables hold base addresses, so arrays can be passed to and returned from functions. Indexing performs real bounds checks, effective-address arithmetic and CPU loads/stores.
- `keyboard()` reads KBD at RAM[24576]. `screen(offset, word)` writes RAM[16384 + offset] and returns zero; offset must be 0..8191. Set the simulated keyboard word in the editor before compiling. The screen panel renders selected sixteen-pixel words, least significant bit first.
- `//` comments and line-aware errors are supported. Identifiers contain letters/underscore followed by letters, underscores or digits.

Blocks share their enclosing main/function scope. A first self-reference or a top-level read before definition is an error. A name declared on a conditional path has an allocated slot even if that path is skipped; untouched main slots and initialized function locals contain zero. Parameters may be reassigned using `let`. Functions resolve declared main variables through static storage; their runtime value is the RAM value at call time, including zero if the call precedes the assignment. There are no closures or block-local declarations.

The first visit opens Guided mode. Addition → NAND remains the one-click demo; addition, decisions and pointers are the three featured journeys. Six extra concepts include bitwise AND and functions. Explorer also provides Pointer, Pointer write, Bitwise AND, Bitwise OR and Bitwise NOT examples alongside the ten existing examples. The editor remains a textarea. A successful compile starts a fresh paused run; an invalid source pauses playback and retains the previous trace.

Pointers use a lightweight two-kind model: ordinary value or explicit address value. A slot keeps its kind; pointers may copy another definitely initialized pointer or receive a new `&name`. The validator rejects non-pointer dereferences, pointer arithmetic/bitwise operations, pointer-to-pointer addresses, pointer indexing and pointer arguments/returns. Definite address assignment is merged across both branches; a loop alone does not guarantee initialization. Pointers can target real main static slots, current function locals and arguments. They do not escape through function arguments/returns, avoiding a dangling-local lifetime model. A real conditional jump traps a still-zero global pointer if a function accesses it before its main assignment.

## Execution and exploration

The canonical UI cursor is a **cycle index**, separate from the instruction's **ROM address**. Previous/Next and the slider move through actual recorded clock edges. A ROM address has zero, one or many visits. Reversing restores the selected historical memory, registers, PC and call stack without rerunning the source.

Explorer **Play/Pause** advances that same cursor one real recorded frame at a time. Speeds are 0.5× (900 ms), 1× (450 ms) and 2× (225 ms). Playback stops on the final recorded edge; Replay starts again at cycle 0. One cancellable timeout schedules each edge. Manual steps, seeks, source/VM/ROM focus, compilation, layer changes and mode changes stop playback. Space toggles playback outside interactive controls; arrow navigation is preserved. Guided autoplay remains a separate lesson timer.

During playback, source focus follows compiler provenance, instruction lists reveal only rows that leave their container, PC transfers expose actual taken/backward jumps, and RAM writes show before → after. Loop condition/body counts and call-stack entry/removal come from recorded visits and machine transfers. Memory and registers are read from the selected CPU snapshots; there is no second runtime memory store.

Assembly and machine rows remain visible when skipped. Selecting a skipped row opens inspection and explains the bypass while leaving the actual CPU cursor intact. Labels are shown as pseudo-commands and consume no ROM word or CPU cycle. Current instructions are revealed inside their lists; VM groups identify function regions and report executed occurrence counts.

CPU shows PC before/after, jump condition, flags, taken status and relevant memory buses. Control panels show completed condition visits with their own cycle and PC transfer; pending conditions remain explicitly pending. Call setup exposes changing SP/LCL/ARG, and the call stack exposes arguments, locals, saved registers and return addresses. Array panels show the base/index chain and current R13 value. Relevant memory and device regions use progressive disclosure instead of a 32K-cell dump.

Select a source arithmetic operator to follow its **executed occurrence** through the existing microscope. A loop or recursive call can revisit the same operator with different operands. Each occurrence gets its own circuit record from the actual CPU edge. Subtraction uses the equivalent `x + NOT(y) + 1` adder identity, while the ALU panel also shows the actual M-D controls. Signed arithmetic wraps to sixteen bits; no clamping occurs.

Select bitwise `&`, `|` or `~` to follow AND, OR or NOT into its own sixteen independent bit slices. Hack emits `M=D&M`, `M=D|M` or `M=!M`; the actual machine edge supplies the operands/output. AND uses two NANDs, OR three, and NOT one with tied inputs. These views show no carry signals or full-adder circuit. Arithmetic records and historical fixture IDs remain compatible.

## Architecture

| Module | Responsibility |
| --- | --- |
| `src/core/parser` | Tokens, spans and stable semantic IDs; Program, statements, expressions and assignment targets; scoped symbols and occurrence bindings. |
| `src/core/compiler` | Recursive AST lowering. Explicit push/pop, arithmetic/comparison, labels/jumps, function/call/return and array/device commands retain source/function provenance. |
| `src/core/vm` | Real Hack sequences. Signed comparisons separate opposite-sign operands before subtraction. Calls save return/LCL/ARG/THIS/THAT; returns restore them using R13/R14. VM visit boundaries are derived from machine history. |
| `src/core/assembler` | Two-pass label resolution, non-consuming pseudo-labels, strict unknown/duplicate checks, real Hack encoding and symbolic-to-numeric context. |
| `src/core/cpu` | Existing Hack ALU, old-A write/jump and clock-edge semantics. `cycleIndex`, `romAddress`, actual jumps and bounded execution. Copy-on-write RAM pages retain independent history. |
| `src/core/trace` | Program construction, explicit pointer/hardware instruction effects, discriminated arithmetic/bitwise records, per-cycle provenance, visit indexes, frame/heap records, snapshots, pointer paths, graph relationships and pure playback state/timer logic. |
| `src/components` | One cycle cursor, source/ROM inspection, source editor/examples, runtime controls, contextual systems/memory panels and eight connected layers. |
| `src/components/transitions` | Existing presentation reducer, measured anchors and Web Animations. Cycles map to ROM before anchoring; repeated arithmetic uses its selected occurrence. Skipped ROM cannot morph into an invented CPU event. |

Memory starts with SP=256, LCL=300, ARG/THIS/THAT=0 and heap pointer RAM[16]=2048. Programs without function declarations preserve LCL-relative main storage at RAM[300+i]. Function programs use main static slots RAM[1536+i], with actual ARG/LCL-relative callee storage in RAM[256..1535]. Each allocation stores its length at base-1 and advances the heap pointer; data occupies RAM[2049..8191]. This keeps stack, globals, arrays and devices separate.

Trace edges include compilation/translation/encoding/execution/hardware, allocation/storage/address resolution, controls, loops-to, invokes, stored-as, resumes-at and array resolves-to. CPU nodes are keyed by cycle; machine nodes by ROM. Adjacency indexes keep exploration linear in connected graph size. Call-frame addresses and saved values come from actual RAM at executed call transfers, rather than UI addresses.

`createDemo()` without source retains the historical 2+3 fixture's IDs, 31 ROM words and exact encodings through the same compiler pipeline. Straight-line callers may use the compatibility cursor spelling `address`; it now denotes a cycle. New UI state explicitly carries `cycleIndex`; ROM selection uses a distinct action.

## Bounds and limitations

| Resource | Bound |
| --- | --- |
| Source | 12,000 characters, 128 statements including nested statements, 24 nesting levels |
| Functions | 12 declarations |
| Array | 1..64 words per allocation; bounded heap RAM[2048..8191] |
| VM / ROM | 2,048 commands / 16,000 executable instructions |
| Runtime | 12,000 cycles; stack stops before RAM[1536] |

Cycle exhaustion retains the partial execution history and explains possible infinite looping/excessive recursion. Heap, array-index, screen-offset and stack failures also stop safely. Persistent 256-word pages avoid full-RAM copies per cycle. The UI still records synchronously within these bounds.

The language intentionally omits multiplication/division/remainder, extra comparisons, classes, objects, closures, imports and a general OS. Arrays use a monotonic allocator with no deallocation. RAM contents are words, not a typed object model. KBD is a fixed simulated word per run; there are no live device events. Screen is a selected-word illustration rather than a complete graphics API. Hack has no HALT; a normal run exits the generated ROM.

VM diagrams show executed command-visit boundaries; CPU, PC, named memory, array contents and stack/frame slots show the selected edge. Addition, subtraction and AND/OR/NOT have full NAND expansion. Comparisons teach ALU sign/zero results, overflow-safe lowering and jump/PC behavior. Dense material scrolls in the desktop stage and vertically on mobile; small hardware text remains easiest to inspect on desktop. The UI exposes the first 100 jump events and 16 touched screen words; the slider still reaches every recorded cycle. Bitwise XOR, arbitrary address literals, pointer arithmetic, pointer-to-pointer and memory allocation/free syntax are outside this pass.

See VERIFICATION.md for the completed systems and focused-expansion acceptance reports, changed-file inventories and saved browser evidence. This is an independent visual companion inspired by the official [Hack machine specification](https://www.nand2tetris.org/project04), [VM specification](https://www.nand2tetris.org/project07) and [calling convention](https://www.nand2tetris.org/project08).
