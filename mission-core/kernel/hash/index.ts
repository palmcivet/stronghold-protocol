/**
 * 键排序后的 JSON 文本。值为 undefined 的属性像 JSON 一样略去；−0、NaN、±Infinity 写成各自的字面量，
 * 数字按最短往返形式写出。只接受纯数据，遇到函数等值报出路径。
 */
export function canonicalJson(value: unknown, path = 'value'): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'number':
      if (Object.is(value, -0)) {
        return '-0';
      }
      return Number.isFinite(value) ? JSON.stringify(value) : String(value);
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new Error(`not plain data at ${path}: ${typeof value}`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalJson(item, `${path}[${index}]`)).join(',')}]`;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`not plain data at ${path}: object`);
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item, `${path}.${key}`)}`).join(',')}}`;
}

const FNV_PRIME = 0x01000193;
const SEEDS = [0x811c9dc5, 0x050c5d1f] as const;

/** 两路 32 位 FNV-1a 拼成的 16 位十六进制摘要。逐个 UTF-16 码元计入，各引擎结果一致。 */
export function hashText(text: string): string {
  let out = '';
  for (const seed of SEEDS) {
    let hash: number = seed;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, FNV_PRIME);
    }
    out += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}
