export function aabbOverlap(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
         Math.abs(a.z - b.z) < (a.d + b.d) / 2
}
