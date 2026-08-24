#!/usr/bin/env bash
# ==============================================================================
# build_manifold_wasm.sh - Self-Contained Manifold WASM Builder for OpenSCAD
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENDOR_DIR="${ROOT_DIR}/vendor"
EMSDK_DIR="${VENDOR_DIR}/emsdk"
OPENSCAD_SRC="${VENDOR_DIR}/openscad"
BUILD_DIR="${ROOT_DIR}/build_wasm"
DIST_DIR="${ROOT_DIR}"

echo "======================================================================"
echo "🏗️  Self-Contained OpenSCAD WASM Builder (with Manifold CSG Engine)"
echo "======================================================================"

# 1. Initialize git submodules if not present
if [ ! -f "${EMSDK_DIR}/emsdk.py" ] || [ ! -f "${OPENSCAD_SRC}/CMakeLists.txt" ]; then
    echo "📦 Initializing and updating git submodules in vendor/..."
    cd "${ROOT_DIR}"
    git submodule update --init --recursive
fi

# 2. Setup & Activate Emscripten SDK from submodule
echo "⚙️  Setting up Emscripten SDK in ${EMSDK_DIR}..."
cd "${EMSDK_DIR}"

if [ ! -d "${EMSDK_DIR}/upstream/emscripten" ]; then
    echo "⬇️  Installing latest Emscripten toolchain..."
    ./emsdk install latest
    ./emsdk activate latest
fi

# Source Emscripten environment into the current shell
echo "🔌 Activating Emscripten environment..."
# shellcheck source=/dev/null
source "${EMSDK_DIR}/emsdk_env.sh"

# Verify emcmake is available
if ! command -v emcmake &> /dev/null; then
    echo "❌ Error: emcmake could not be found after activating emsdk_env.sh"
    exit 1
fi
echo "✅ Emscripten toolchain ready: $(emcc -v 2>&1 | head -n 1)"

# 3. Create build directory
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

# 4. Configure OpenSCAD with CMake & Emscripten
echo "⚙️  Configuring CMake for OpenSCAD with ENABLE_MANIFOLD=ON..."
emcmake cmake "${OPENSCAD_SRC}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DHEADLESS=ON \
    -DENABLE_MANIFOLD=ON \
    -DEXPERIMENTAL=ON \
    -DENABLE_GUI=OFF \
    -DENABLE_TESTS=OFF \
    -DENABLE_PYTHON=OFF \
    -DCMAKE_CXX_FLAGS="-O3 -flto" \
    -DCMAKE_EXE_LINKER_FLAGS="-s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB -s MODULARIZE=1 -s EXPORT_NAME='OpenSCAD' -s EXPORTED_RUNTIME_METHODS='[\"FS\",\"callMain\"]' -s FORCE_FILESYSTEM=1"

# 5. Compile OpenSCAD WASM
NCPU=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)
echo "🔨 Compiling OpenSCAD WASM with ${NCPU} threads..."
emmake make -j"${NCPU}" openscad

# 6. Copy output artifacts to project root
echo "📦 Copying generated WASM artifacts to ${DIST_DIR}..."
if [ -f "${BUILD_DIR}/openscad.js" ]; then
    cp "${BUILD_DIR}/openscad.js" "${DIST_DIR}/openscad.js"
    [ -f "${BUILD_DIR}/openscad.wasm" ] && cp "${BUILD_DIR}/openscad.wasm" "${DIST_DIR}/openscad.wasm"
    echo "🎉 Build Success! Deployed openscad.js & openscad.wasm"
else
    echo "❌ Build completed but openscad.js was not found in ${BUILD_DIR}"
    exit 1
fi
