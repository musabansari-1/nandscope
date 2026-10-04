// Scroll only the instruction list, never the surrounding page.
export function revealInstruction(list: HTMLElement | null, instant = false) {
  const row = list?.querySelector<HTMLElement>(".current");
  if (!list || !row) return;
  const bounds = list.getBoundingClientRect();
  const target = row.getBoundingClientRect();
  if (target.top >= bounds.top && target.bottom <= bounds.bottom) return;
  list.scrollTo({
    top: list.scrollTop + (target.top < bounds.top ? target.top - bounds.top : target.bottom - bounds.bottom),
    behavior: instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
}
