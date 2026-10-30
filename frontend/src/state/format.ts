// The API returns raw float64s (0.1 + 0.2 = 0.30000000000000004). The UI shows
// 12 significant digits and drops trailing zeros.
export function formatResult(value: number): string {
  return String(Number(value.toPrecision(12)));
}
