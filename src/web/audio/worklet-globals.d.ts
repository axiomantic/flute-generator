// AudioWorkletGlobalScope. lib.dom.d.ts describes the page side of AudioWorklet but not the
// scope the processor itself runs in, so the three globals it uses are declared here.
declare const sampleRate: number;
declare const currentTime: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown });
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: { processorOptions?: unknown }) => AudioWorkletProcessor
): void;
