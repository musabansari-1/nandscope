export const LAYERS = ["source", "vm", "assembly", "machine", "cpu", "alu", "gate", "nand"] as const;
export type Layer = typeof LAYERS[number];
export interface TraceNode { id: string; layer: Layer; label: string; metadata: Record<string, unknown> }
export interface TraceEdge { from: string; to: string; relation: "compiled-to" | "translated-to" | "encoded-as" | "executed-by" | "implemented-by" | "allocated-as" | "resolved-to" | "accesses" | "contains" | "controls" | "loops-to" | "invokes" | "stored-as" | "resumes-at" | "resolves-to" }
export interface TraceGraph { nodes: TraceNode[]; edges: TraceEdge[] }
const indexes = new WeakMap<TraceGraph, { size: number; forward: Map<string, string[]>; reverse: Map<string, string[]> }>();
function adjacency(graph: TraceGraph, reverse: boolean) {
  let index = indexes.get(graph);
  if (!index || index.size !== graph.edges.length) {
    index = { size: graph.edges.length, forward: new Map(), reverse: new Map() };
    for (const edge of graph.edges) {
      const forward = index.forward.get(edge.from) ?? []; forward.push(edge.to); index.forward.set(edge.from, forward);
      const backward = index.reverse.get(edge.to) ?? []; backward.push(edge.from); index.reverse.set(edge.to, backward);
    }
    indexes.set(graph, index);
  }
  return reverse ? index.reverse : index.forward;
}
export function descendants(graph: TraceGraph, id: string): Set<string> {
  const found = new Set<string>([id]);
  const pending = [id];
  const links = adjacency(graph, false);
  while (pending.length) {
    const current = pending.pop()!;
    for (const target of links.get(current) ?? []) if (!found.has(target)) { found.add(target); pending.push(target); }
  }
  return found;
}
export function ancestors(graph: TraceGraph, id: string): Set<string> {
  const found = new Set<string>([id]);
  const pending = [id];
  const links = adjacency(graph, true);
  while (pending.length) {
    const current = pending.pop()!;
    for (const target of links.get(current) ?? []) if (!found.has(target)) { found.add(target); pending.push(target); }
  }
  return found;
}
// Highlight descendants plus ancestors, without spilling into siblings of an instruction.
export function relatedNodes(graph: TraceGraph, id: string): Set<string> {
  return new Set([...descendants(graph, id), ...ancestors(graph, id)]);
}

