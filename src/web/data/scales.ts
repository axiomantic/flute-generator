export const SCALES: Record<string, number[]> = {
  native_american: [0, 3, 5, 7, 10, 12],
  hijaz: [0, 1, 4, 5, 7, 8, 10, 12],
  minor_pentatonic: [0, 3, 5, 7, 10, 12],
  major_pentatonic: [0, 2, 4, 7, 9, 12],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  natural_minor: [0, 2, 3, 5, 7, 8, 10, 12],
};

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function getMidiName(m: number): string {
  const name = NOTE_NAMES[m % 12];
  const oct = Math.floor(m / 12) - 1;
  return `${name}${oct}`;
}

export function midiToFreq(m: number): number {
  return 440.0 * Math.pow(2.0, (m - 69.0) / 12.0);
}
