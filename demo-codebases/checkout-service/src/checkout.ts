export function validateTotal(total: number): boolean {
  return Number.isFinite(total) && total >= 0;
}
