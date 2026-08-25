export function stlStringToGeometry(stl: string): import('three').BufferGeometry {
  const lines = stl.split(/\r?\n/);
  const verts = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('vertex')) {
      const p = t.split(/\s+/);
      if (p.length >= 4) {
        verts.push(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  return g;
}
