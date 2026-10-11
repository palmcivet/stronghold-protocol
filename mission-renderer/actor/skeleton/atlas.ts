/** One page of a Spine 3.8 atlas. */
export interface MissionAtlasPage {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Whether the page's colours are premultiplied by alpha. */
  readonly premultipliedAlpha: boolean;
}

/** One region of an atlas page, in the fields the skeleton attachments read. */
export interface MissionAtlasRegion {
  readonly name: string;
  readonly page: MissionAtlasPage;
  readonly x: number;
  readonly y: number;
  readonly u: number;
  readonly v: number;
  readonly u2: number;
  readonly v2: number;
  readonly rotate: boolean;
  readonly degrees: number;
  /** Packed size, before rotation. */
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly index: number;
}

export interface MissionSkeletonAtlas {
  readonly pages: readonly MissionAtlasPage[];
  readonly regions: readonly MissionAtlasRegion[];
  findRegion(name: string): MissionAtlasRegion | null;
}

function numbers(value: string): number[] {
  return value.split(',').map((part) => Number(part.trim()));
}

function pair(
  fields: ReadonlyMap<string, string>,
  key: string,
  fallback: readonly [number, number],
): readonly [number, number] {
  const value = fields.get(key);
  if (value === undefined) {
    return fallback;
  }
  const [a = fallback[0], b = fallback[1]] = numbers(value);
  return [a, b];
}

/** Reads the text of a Spine 3.8 `.atlas` file. */
export function parseMissionAtlas(text: string): MissionSkeletonAtlas {
  const pages: MissionAtlasPage[] = [];
  const regions: MissionAtlasRegion[] = [];
  const lines = text.split(/\r?\n/);
  let page: MissionAtlasPage | null = null;
  let index = 0;
  const fieldsAt = (
    start: number,
  ): { readonly fields: Map<string, string>; readonly next: number } => {
    const fields = new Map<string, string>();
    let cursor = start;
    while (cursor < lines.length) {
      const line = lines[cursor] ?? '';
      const colon = line.indexOf(':');
      if (line.trim() === '' || colon < 0) {
        break;
      }
      fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
      cursor += 1;
    }
    return { fields, next: cursor };
  };
  while (index < lines.length) {
    const line = (lines[index] ?? '').trim();
    if (line === '') {
      page = null;
      index += 1;
      continue;
    }
    const { fields, next } = fieldsAt(index + 1);
    if (page === null) {
      const [width, height] = pair(fields, 'size', [0, 0]);
      page = {
        name: line,
        width,
        height,
        premultipliedAlpha: fields.get('pma') === 'true',
      };
      pages.push(page);
    } else {
      const rotateField = fields.get('rotate') ?? 'false';
      const degrees =
        rotateField === 'true'
          ? 90
          : rotateField === 'false'
            ? 0
            : Number(rotateField);
      const [x, y] = pair(fields, 'xy', [0, 0]);
      const [width, height] = pair(fields, 'size', [0, 0]);
      const [originalWidth, originalHeight] = pair(fields, 'orig', [
        width,
        height,
      ]);
      const [offsetX, offsetY] = pair(fields, 'offset', [0, 0]);
      const rotate = degrees === 90;
      const packedWidth = rotate ? height : width;
      const packedHeight = rotate ? width : height;
      regions.push({
        name: line,
        page,
        x,
        y,
        u: x / page.width,
        v: y / page.height,
        u2: (x + packedWidth) / page.width,
        v2: (y + packedHeight) / page.height,
        rotate,
        degrees,
        width,
        height,
        offsetX,
        offsetY,
        originalWidth,
        originalHeight,
        index: Number(fields.get('index') ?? -1),
      });
    }
    index = next;
  }
  const byName = new Map<string, MissionAtlasRegion>();
  for (const region of regions) {
    if (!byName.has(region.name)) {
      byName.set(region.name, region);
    }
  }
  return { pages, regions, findRegion: (name) => byName.get(name) ?? null };
}
