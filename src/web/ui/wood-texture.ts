// High-resolution procedural wood grain canvas texture generator
export function createWoodGrainTexture(baseColorHex: number, darkColorHex: number, grainScale = 1.0, isBamboo = false): import('three').CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  const base = new THREE.Color(baseColorHex);
  const dark = new THREE.Color(darkColorHex);

  // Background base tone
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (isBamboo) {
    // Bamboo longitudinal fibrous grain & horizontal nodes
    for (let x = 0; x < canvas.width; x += 2) {
      const alpha = 0.04 + Math.sin(x * 0.4) * 0.03;
      ctx.fillStyle = `rgba(${Math.floor(dark.r*255)}, ${Math.floor(dark.g*255)}, ${Math.floor(dark.b*255)}, ${alpha})`;
      ctx.fillRect(x, 0, 1.5, canvas.height);
    }
    // Nodes / segments
    for (let y = 180; y < canvas.height; y += 220) {
      ctx.fillStyle = `rgba(${Math.floor(dark.r*255)}, ${Math.floor(dark.g*255)}, ${Math.floor(dark.b*255)}, 0.35)`;
      ctx.fillRect(0, y - 2, canvas.width, 4);
      ctx.fillStyle = `rgba(255, 255, 255, 0.15)`;
      ctx.fillRect(0, y + 2, canvas.width, 3);
    }
  } else {
    // Natural wood growth rings, longitudinal annular grain & ray flecks
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        
        // Annular grain rings with subtle wavy distortion
        const wave = Math.sin(y * 0.02 * grainScale + Math.sin(x * 0.04) * 1.5);
        const finePores = Math.sin(x * 0.8 + y * 0.05) * 0.1;
        const grainPattern = Math.pow(Math.abs(Math.sin((x * 0.05 + wave * 4.0) * grainScale)), 4.0);

        const mix = Math.min(1, Math.max(0, grainPattern * 0.45 + finePores));
        
        const r = base.r * (1 - mix) + dark.r * mix;
        const g = base.g * (1 - mix) + dark.g * mix;
        const b = base.b * (1 - mix) + dark.b * mix;

        data[idx]     = Math.floor(r * 255);
        data[idx + 1] = Math.floor(g * 255);
        data[idx + 2] = Math.floor(b * 255);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 3.0);
  return texture;
}
