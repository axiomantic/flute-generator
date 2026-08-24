# 🛠️ Contributing & Developer Guide

Thank you for your interest in contributing to **Flute Generator & Studio**! This document provides instructions for setting up your development environment, running tests, and compiling the client-side WebAssembly components.

---

## 📦 Local Development Setup

### 1. Python Environment Setup

Clone the repository and set up a Python 3.10+ virtual environment:

```bash
git clone --recurse-submodules https://github.com/axiomantic/flute-generator.git
cd flute-generator

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

### 2. Running Tests

Run the full pytest suite across acoustics, CAD generation, physical audio modeling, and scales:

```bash
pytest -v
```

---

## ⚡ WebAssembly & Fast Manifold Engine Build

The web interface compiles parametric CAD models client-side into 3D polygon meshes via OpenSCAD WebAssembly.

### Building OpenSCAD WASM with the Fast Manifold Engine

The project includes git submodules for `emsdk` and `openscad` under `vendor/`. The build script handles toolchain installation, recursive dependency checking (including `manifold`, `Clipper2`, `mimalloc`, and `sanitizers-cmake`), CMake configuration, and compilation automatically:

```bash
# 1. Initialize git submodules (if not already cloned recursively):
git submodule update --init --recursive

# 2. Run the self-contained Manifold WASM build script:
./scripts/build_manifold_wasm.sh
```

### Build Architecture:
- **Containerized Build (Recommended)**: If Docker is running, the script automatically uses the verified `openscad/wasm-base:latest` container containing pre-compiled WASM dependencies (`Eigen3`, `Boost`, `CGAL`, `DoubleConversion`, `HarfBuzz`, `FontConfig`).
- **Native Fallback**: If Docker is not available, it uses the local Emscripten toolchain in `vendor/emsdk/`.
- **Output Artifacts**: The build compiles OpenSCAD with `-DENABLE_MANIFOLD=ON` and deploys `openscad.js` and `openscad.wasm` to the project root for sub-50ms in-browser CSG boolean rendering.

---

## 🌐 Local Web Studio Development

To run and test the web application locally:

```bash
python3 -m http.server 8000
```

Open your browser at `http://localhost:8000`.

---

## 📋 Code Quality & Architecture Guidelines

- **Acoustic Physics**: All physical dimensions and hole calculations live in `src/flute_generator/acoustics.py`.
- **CAD Representation**: OpenSCAD generation in `src/flute_generator/cad.py` and `index.html` (`generateScadJs`) must produce 100% 2-manifold CSG solid models.
- **Physical Modeling**: Waveguide algorithms and vocal tract formant filters live in `src/flute_generator/audio.py` and `index.html` (`WebPhysicalPipe`).
