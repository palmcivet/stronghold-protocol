'use client';

import { TOKENS } from './index.js';

interface Row {
  readonly path: string;
  readonly type: string;
  readonly value: string;
}

type Node = Record<string, unknown>;

function isToken(
  node: unknown,
): node is Node & { $type: string; $value: unknown } {
  return (
    typeof node === 'object' &&
    node !== null &&
    '$type' in node &&
    '$value' in node
  );
}

function describe(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => describe(item)).join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if ('hex' in record && typeof record.hex === 'string') {
      const alpha =
        typeof record.alpha === 'number' ? ` / ${record.alpha}` : '';
      return `${record.hex}${alpha}`;
    }
    if ('value' in record && 'unit' in record) {
      return `${String(record.value)} ${String(record.unit)}`;
    }
  }
  return JSON.stringify(value);
}

function flatten(node: Node, prefix: string[], rows: Row[]): void {
  for (const [key, child] of Object.entries(node)) {
    const path = [...prefix, key];
    if (isToken(child)) {
      rows.push({
        path: path.join('.'),
        type: child.$type,
        value: describe(child.$value),
      });
    } else if (typeof child === 'object' && child !== null) {
      flatten(child as Node, path, rows);
    }
  }
}

/** Every token of `TOKENS`, as a table. */
export function TokenList() {
  const rows: Row[] = [];
  flatten(TOKENS as unknown as Node, [], rows);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>令牌</th>
            <th>类型</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path}>
              <td>
                <code>{row.path}</code>
              </td>
              <td>{row.type}</td>
              <td>
                <code>{row.value}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
