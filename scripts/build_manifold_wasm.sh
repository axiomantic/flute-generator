#!/usr/bin/env bash
# ==============================================================================
# build_manifold_wasm.sh - Build OpenSCAD with Fast Manifold Engine for WASM
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build_wasm"
DIST_DIR="${ROOT_DIR}"

echo "======================================================================"
echo "🏗️  Building OpenSCAD WebAssembly Binary with Manifold CSG Engine"
echo "======================================================================"

# 1. Verify Emscripten SDK
if ! command -v emcmake &> /dev/null; then
    echo "❌ Error: Emscripten SDK (emcmake) is not in PATH."
    echo "👉 Please install/activate emsdk:"
    echo "   git clone https://github.com/emscripten-core/emsdk.git"
    echo "   cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    echo "   source ./emsdk_env.sh"
    exit 1
fi

# 2. Check for OpenSCAD submodule / clone
OPENSCAD_SRC="${ROOT_DIR}/vendor/openscad"
if [ ! -d "${OPENSCAD_SRC}/.git" ] && [ ! -f "${OPENSCAD_SRC}/CMakeLists.txt" ]; then
    echo "📦 Cloning upstream OpenSCAD source with Manifold into vendor/openscad..."
    mkdir -p "${ROOT_DIR}/vendor"
    git clone --depth 1 --recurse-submodules -b master https://github.com/openscad/openscad.git "${OPENSCAD_SRC}"
fi

# 3. Create build directory
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

# 4. Configure with CMake via Emscripten
echo "⚙️  Configuring CMake with ENABLE_MANIFOLD=ON..."
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
echo "🔨 Compiling with ${NCPU} threads..."
emmake make -j"${NCPU}" openscad

# 6. Copy output binaries to project root
echo "📦 Copying generated WASM artifacts to project root..."
if [ -f "${BUILD_DIR}/openscad.js" ]; then
    cp "${BUILD_DIR}/openscad.js" "${DIST_DIR}/openscad.js"
    [ -f "${BUILD_DIR}/openscad.wasm" ] && cp "${BUILD_DIR}/openscad.wasm" "${DIST_DIR}/openscad.wasm"
    echo "✅ Success! Generated ${DIST_DIR}/openscad.js and openscad.wasm"
else
    echo "❌ Build completed but openscad.js was not found in ${BUILD_DIR}"
    exit 1
fi
