/** 最近的整数，恰在两数正中时取偶数（四舍六入五成双）；不出现 −0。 */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  if (x - floor !== 0.5) {
    return Math.round(x) + 0;
  }
  return (floor % 2 === 0 ? floor : floor + 1) + 0;
}
