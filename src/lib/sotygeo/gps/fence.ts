export function detectFenceTransition(wasInside: boolean, isInside: boolean): "ENTER" | "EXIT" | null {
  if (!wasInside && isInside) return "ENTER";
  if (wasInside && !isInside) return "EXIT";
  return null;
}
