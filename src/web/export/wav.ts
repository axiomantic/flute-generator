// Container-only: 16-bit PCM RIFF/WAVE. It carries whatever the audio engine produced and
// makes no acoustic decision of its own.

/** Interleaves and clips two channels into a complete .wav file image. */
export function encodeWav16(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array {
  const frames = Math.min(left.length, right.length);
  const channels = 2;
  const bytesPerSample = 2;
  const dataBytes = frames * channels * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);

  const ascii = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);            // PCM fmt chunk size
  view.setUint16(20, 1, true);             // format 1 = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let p = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of [left, right]) {
      // Asymmetric clip: 16-bit two's complement reaches -32768 but only +32767.
      const s = Math.max(-1, Math.min(1, ch[i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }
  return new Uint8Array(buf);
}
