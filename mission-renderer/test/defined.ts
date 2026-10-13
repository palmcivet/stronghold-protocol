/** 测试里取一定存在的值：缺了就抛错，让用例在这里失败。 */
export function defined<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) {
    throw new Error(`${what} is missing`);
  }
  return value;
}
