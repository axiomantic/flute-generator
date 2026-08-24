#!/usr/bin/env bash
# ==============================================================================
# build_manifold_wasm.sh - Automated OpenSCAD Manifold WASM Compiler
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build_wasm"
DIST_DIR="${ROOT_DIR}"
OPENSCAD_SRC="${ROOT_DIR}/vendor/openscad"

echo "======================================================================"
echo "🏗️  OpenSCAD WebAssembly Build (Fast Manifold CSG Engine)"
echo "======================================================================"

# 1. Initialize git submodules if needed
if [ ! -f "${OPENSCAD_SRC}/CMakeLists.txt" ]; then
    echo "📦 Initializing vendor/openscad git submodule..."
    cd "${ROOT_DIR}"
    git submodule update --init --recursive vendor/openscad
fi

# 2. Check for Docker
if command -v docker &> /dev/null; then
    echo "🐳 Using OpenSCAD official wasm-base container for reproducible build..."
    # Clean any stale host CMakeCache to prevent path mismatch
    rm -rf "${BUILD_DIR}/CMakeCache.txt" "${BUILD_DIR}/CMakeFiles"
    mkdir -p "${BUILD_DIR}"
    
    # Configure via official OpenSCAD docker environment
    echo "⚙️  Configuring CMake with ENABLE_MANIFOLD=ON..."
    cd "${ROOT_DIR}"
    "${OPENSCAD_SRC}/scripts/wasm-base-docker-run.sh" emcmake cmake -B /src/build_wasm -S /src/vendor/openscad \
        -DWASM_BUILD_TYPE=web \
        -DCMAKE_BUILD_TYPE=Release \
        -DHEADLESS=ON \
        -DEXPERIMENTAL=1 \
        -DENABLE_MANIFOLD=ON \
        -DUSE_BUILTIN_MANIFOLD=ON \
        -DENABLE_GUI=OFF \
        -DENABLE_TESTS=OFF \
        -DENABLE_PYTHON=OFF

    # Compile
    NCPU=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)
    echo "🔨 Building with ${NCPU} threads..."
    "${OPENSCAD_SRC}/scripts/wasm-base-docker-run.sh" cmake --build /src/build_wasm -j"${NCPU}"
else
    echo "⚙️  Docker not detected. Attempting native Emscripten build..."
    EMSDK_DIR="${ROOT_DIR}/vendor/emsdk"
    if [ ! -f "${EMSDK_DIR}/emsdk.py" ]; then
        cd "${ROOT_DIR}"
        git submodule update --init --recursive vendor/emsdk
    fi
    cd "${EMSDK_DIR}"
    if [ ! -d "${EMSDK_DIR}/upstream/emscripten" ]; then
        ./emsdk install latest && ./emsdk activate latest
    fi
    source "${EMSDK_DIR}/emsdk_env.sh"

    mkdir -p "${BUILD_DIR}"
    cd "${BUILD_DIR}"
    emcmake cmake "${OPENSCAD_SRC}" \
        -DWASM_BUILD_TYPE=web \
        -DCMAKE_BUILD_TYPE=Release \
        -DHEADLESS=ON \
        -DEXPERIMENTAL=1 \
        -DENABLE_MANIFOLD=ON \
        -DUSE_BUILTIN_MANIFOLD=ON \
        -DENABLE_GUI=OFF \
        -DENABLE_TESTS=OFF \
        -DENABLE_PYTHON=OFF
    NCPU=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)
    emmake make -j"${NCPU}"
fi

# 3. Deploy generated WASM output
echo "📦 Deploying generated WASM artifacts..."
if [ -f "${BUILD_DIR}/openscad.js" ]; then
    cp "${BUILD_DIR}/openscad.js" "${DIST_DIR}/openscad.js"
    [ -f "${BUILD_DIR}/openscad.wasm" ] && cp "${BUILD_DIR}/openscad.wasm" "${DIST_DIR}/openscad.wasm"
    echo "🎉 Successfully built and deployed openscad.js & openscad.wasm!"
else
    echo "❌ Build finished but openscad.js was not found in ${BUILD_DIR}"
    exit 1
fi
