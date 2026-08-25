// One place that knows how the checked-in browser libraries reach a served tree.
//
// vendor/ at the repository root is the single authoritative copy. The studio page references
// ./vendor/... and the gallery pages reference ../vendor/..., so every root a page can be served
// from - the repository root, examples/, docs/ - needs its own vendor directory. Those are build
// products; vendor/ is the original. See vendor/README.md.
import { readdir, mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VENDOR_DIR = path.join(ROOT, 'vendor');

/**
 * Copies the browser libraries into `<target>/vendor/`, creating it if needed.
 *
 * Subdirectories are skipped: vendor/ also holds the emsdk and openscad submodules, which build
 * openscad.wasm and are never served. Files are enumerated rather than listed literally so adding
 * a library to vendor/ needs no edit here.
 *
 * @param {string} target directory that will hold the `vendor/` subdirectory
 * @returns {Promise<string[]>} the file names copied, sorted
 */
export async function copyVendorTo(target) {
  const dest = path.join(target, 'vendor');
  await mkdir(dest, { recursive: true });
  const copied = [];
  for (const name of await readdir(VENDOR_DIR)) {
    const src = path.join(VENDOR_DIR, name);
    if (!(await stat(src)).isFile()) continue;
    await copyFile(src, path.join(dest, name));
    copied.push(name);
  }
  copied.sort();
  return copied;
}
