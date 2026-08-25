# Vendored browser libraries

Third-party browser files, checked in verbatim. This directory is the single authoritative copy;
everything else is a build-time mirror of it.

| File | Version | Source | License | Used by |
|---|---|---|---|---|
| `three.min.js` | three.js r128 | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` | MIT | studio, gallery |
| `OrbitControls.js` | three.js r128 (`examples/js/controls`) | `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js` | MIT | studio, gallery |
| `STLLoader.js` | three.js r128 (`examples/js/loaders`) | `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js` | MIT | gallery |
| `jszip.min.js` | JSZip 3.10.1 | `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js` | MIT or GPLv3 | studio |

SHA-256, as fetched:

```
9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2  three.min.js
02bb4ade710f3e607329e37a21f098bc3ac70eb6e33daf8a65e79f4db785e7b2  OrbitControls.js
c392b93d1331e64082cbd76deb850fe5de11385472a3f4c5b7fe82ba216cb49e  STLLoader.js
acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e  jszip.min.js
```

`jszip.min.js` was fetched from cdnjs and from `https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js`;
the two are byte-identical.

They are checked in rather than fetched during the build for three reasons: the build has to work
with no network and produce the same bytes every time; a published page that reaches a CDN is dead
offline and blocked under a strict `script-src 'self'` policy; and a pinned URL is not a pinned
artifact - the bytes behind it can change without the page changing.

`three.min.js`, `OrbitControls.js` and `STLLoader.js` belong together: the latter two are r128
example scripts that attach to the `THREE` global and will not run against a different major
version. All four are classic scripts, not ES modules, and load order matters - `three.min.js`
first, then the scripts that extend `THREE`. Replace the three three.js files at once, update the
version, URL and hash rows above, and rebuild.

## Where the copies go

The studio page (`index.html`) sits at the repository root and is copied verbatim to `docs/`, so it
must reference a path that resolves from both roots: `./vendor/...`. The gallery pages sit one
directory down (`examples/NN_*/`, published as `docs/NN_*/`) and reference `../vendor/...`, which is
that page's own root. One directory therefore has to exist at three places:

| Path | Origin | Serves |
|---|---|---|
| `vendor/` | checked in, edited by hand | the studio served from the repository root |
| `docs/vendor/` | written by `scripts/build.mjs` and `scripts/build_examples.mjs` | the published studio and gallery |
| `examples/vendor/` | written by `scripts/build_examples.mjs` | the gallery served from the repository root |

The two generated copies are committed for the same reason `docs/index.html` is: GitHub Pages serves
the tree as it is checked in. Do not edit them; edit this directory and rebuild.

Each mirror gets the whole directory rather than only the files its own pages load. `docs/vendor/`
is shared by the studio and the gallery and is written by both build scripts, the second of which
clears it first; a per-page file list would let one script delete a file the other put there. The
cost is `jszip.min.js` under `examples/vendor/`, where nothing loads it.

## Submodules

`emsdk/` and `openscad/` are git submodules used only by `scripts/build_manifold_wasm.sh` to build
`openscad.wasm`. They are not shipped to the browser and are unrelated to the files above.
