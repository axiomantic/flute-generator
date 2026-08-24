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
CCACHE_DIR="${HOME}/.ccache"
mkdir -p "${CCACHE_DIR}"

echo "======================================================================"
echo "🏗️  OpenSCAD WebAssembly Build (Fast Manifold CSG Engine)"
echo "======================================================================"

# 1. Initialize git submodules recursively (including Clipper2, manifold, mimalloc)
echo "📦 Verifying recursive git submodules..."
cd "${ROOT_DIR}"
git submodule update --init --recursive

# 2. Check for Docker
if command -v docker &> /dev/null; then
    echo "🐳 Using OpenSCAD official wasm-base container for reproducible build..."
    rm -rf "${BUILD_DIR}"
    mkdir -p "${BUILD_DIR}"

    # Build local ccache image if not already present
    echo "FROM openscad/wasm-base:latest
    RUN apt update && apt install -y ccache && apt clean
    " | docker build --platform=linux/amd64 -t openscad-wasm-ccache:local -f - . > /dev/null 2>&1 || true

    # Helper function to run commands inside docker container without -it
    run_docker() {
        docker run --rm \
            --platform=linux/amd64 \
            -w /src \
            -v "${ROOT_DIR}:/src:rw" \
            -v "${CCACHE_DIR}:/root/.ccache:rw" \
            openscad-wasm-ccache:local \
            "$@"
    }

    echo "⚙️  Configuring CMake with ENABLE_MANIFOLD=ON in container..."
    run_docker emcmake cmake -B /src/build_wasm -S /src/vendor/openscad \
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
    run_docker cmake --build /src/build_wasm -j"${NCPU}"
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

    rm -rf "${BUILD_DIR}"
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
