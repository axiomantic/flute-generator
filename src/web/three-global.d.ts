// three.js r128 is loaded from a CDN as a plain <script>, so it reaches the page as a global
// rather than as a module. @types/three describes the module; this binds the global to it.
interface OrbitControlsLike {
  target: import('three').Vector3;
  enableDamping: boolean;
  dampingFactor: number;
  rotateSpeed: number;
  panSpeed: number;
  zoomSpeed: number;
  update(): void;
}

// OrbitControls ships as an examples/js side-script that hangs itself off the THREE global,
// so it is not part of @types/three's module surface.
declare const THREE: typeof import('three') & {
  OrbitControls: new (camera: import('three').Camera, domElement?: HTMLElement) => OrbitControlsLike;
};
declare const JSZip: {
  new (): {
    file(name: string, data: string | Blob): void;
    generateAsync(options: { type: 'blob' }): Promise<Blob>;
  };
};
