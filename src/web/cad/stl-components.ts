// Splits one ASCII STL into its connected solids.
//
// A single OpenSCAD program that unions disjoint parts exports them as one file with several
// closed shells. The keywork's rods, sleeves, stanchions, spindle and touch keys are all
// separated by running clearances, so one render yields one shell per part, and the viewer can
// colour and animate them individually without paying for a render each.
//
// Vertices are quantized before matching for the same reason meshParity() does it: OpenSCAD
// prints the same corner with different rounding in different facets, and an exact string match
// would split one solid into many.

export interface StlComponent {
  positions: Float32Array;
  triangles: number;
  min: [number, number, number];
  max: [number, number, number];
  centre: [number, number, number];
}

export function splitStlComponents(stl: string): StlComponent[] {
  const coords: number[] = [];
  for (const line of stl.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('vertex ')) continue;
    const p = t.split(/\s+/);
    coords.push(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]));
  }
  const nVert = coords.length / 3;
  const nTri = Math.floor(nVert / 3);
  if (nTri === 0) return [];

  const idOf = new Map<string, number>();
  const vertId = new Int32Array(nVert);
  for (let v = 0; v < nVert; v++) {
    const key = `${coords[v * 3].toFixed(3)},${coords[v * 3 + 1].toFixed(3)},${coords[v * 3 + 2].toFixed(3)}`;
    let id = idOf.get(key);
    if (id === undefined) { id = idOf.size; idOf.set(key, id); }
    vertId[v] = id;
  }

  const parent = new Int32Array(idOf.size);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (a: number): number => {
    let r = a;
    while (parent[r] !== r) r = parent[r];
    while (parent[a] !== r) { const next = parent[a]; parent[a] = r; a = next; }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let t = 0; t < nTri; t++) {
    union(vertId[t * 3], vertId[t * 3 + 1]);
    union(vertId[t * 3 + 1], vertId[t * 3 + 2]);
  }

  const byRoot = new Map<number, number[]>();
  for (let t = 0; t < nTri; t++) {
    const root = find(vertId[t * 3]);
    let list = byRoot.get(root);
    if (!list) { list = []; byRoot.set(root, list); }
    list.push(t);
  }

  const out: StlComponent[] = [];
  for (const tris of byRoot.values()) {
    const positions = new Float32Array(tris.length * 9);
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    tris.forEach((t, i) => {
      for (let v = 0; v < 3; v++) {
        for (let c = 0; c < 3; c++) {
          const value = coords[(t * 3 + v) * 3 + c];
          positions[i * 9 + v * 3 + c] = value;
          if (value < min[c]) min[c] = value;
          if (value > max[c]) max[c] = value;
        }
      }
    });
    out.push({
      positions,
      triangles: tris.length,
      min, max,
      centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
    });
  }
  return out;
}
