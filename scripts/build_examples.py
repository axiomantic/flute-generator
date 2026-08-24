"""Script to generate all showcase examples with 3D renderings, audio, STL, and interactive HTML5 viewers."""

import os
from pathlib import Path
import subprocess
import sys

from flute_generator.cli import generate_flute

EXAMPLES = [
    {
        "dir": "examples/01_native_american_a4_sac",
        "title": "Native American Triple Flute (A4) with Slow Air Chamber (SAC)",
        "root": 69,
        "scale": "native_american",
        "melody": "native_motif",
        "windway_profile": "sac",
        "windway_texture": "smooth",
        "drone_air_ratio": 0.78,
        "desc": "Traditional Native American minor pentatonic triple flute in A4 featuring an internal Slow Air Chamber (SAC) expansion reservoir that smooths breath pressure and produces a warm, velvety acoustic tone with rich drone resonance."
    },
    {
        "dir": "examples/02_desert_caravan_hijaz_ribbed",
        "title": "Desert Caravan Middle Eastern Flute (A4) with Micro-Ribbed Airways",
        "root": 69,
        "scale": "hijaz",
        "melody": "desert_caravan",
        "windway_profile": "venturi",
        "windway_texture": "ribbed",
        "drone_air_ratio": 0.75,
        "desc": "Middle Eastern Hijaz scale flute in A4 with Venturi accelerating windways and micro-ribbed drone channels that introduce organic aeroacoustic harmonic rasp to the drone backdrop."
    },
    {
        "dir": "examples/03_baroque_condor_pasa_arched",
        "title": "Andean Condor Pasa Triple Flute (A4) with Arched Baroque Windway",
        "root": 69,
        "scale": "minor_pentatonic",
        "melody": "condor_pasa",
        "windway_profile": "arched",
        "windway_texture": "smooth",
        "drone_air_ratio": 0.80,
        "desc": "Minor pentatonic triple flute in A4 with crowned arched windways inspired by Baroque recorders, focusing laminar airflow onto the center of the labium for singing upper harmonics."
    },
    {
        "dir": "examples/04_greensleeves_dorian_c5",
        "title": "Renaissance Greensleeves Triple Flute (C5) in Dorian Scale",
        "root": 72,
        "scale": "dorian",
        "melody": "greensleeves",
        "windway_profile": "flat",
        "windway_texture": "smooth",
        "drone_air_ratio": 0.78,
        "desc": "High-register C5 triple flute in Dorian modal scale playing Greensleeves with crisp planar windway voicing and calibrated harmonic fifth drone accompaniment."
    }
]

OPENSCAD_BIN = "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD"


def build_examples():
    for ex in EXAMPLES:
        p = Path(ex["dir"])
        p.mkdir(parents=True, exist_ok=True)
        print(f"Generating {ex['title']}...")

        res = generate_flute(
            root_midi=ex["root"],
            scale_name=ex["scale"],
            melody_name=ex["melody"],
            windway_profile=ex["windway_profile"],
            windway_texture=ex["windway_texture"],
            drone_air_ratio=ex["drone_air_ratio"],
            output_dir=str(p),
            base_name="flute",
        )

        scad_file = p / "flute.scad"
        img_iso = p / "flute_iso.png"
        img_head = p / "flute_head.png"
        stl_file = p / "flute.stl"

        # Render 3D Images
        subprocess.run([OPENSCAD_BIN, "-o", str(img_iso), "--camera=0,-120,200,60,0,30,550", "--imgsize=1024,1024", str(scad_file)], capture_output=True)
        subprocess.run([OPENSCAD_BIN, "-o", str(img_head), "--camera=0,-80,380,65,0,25,120", "--imgsize=1024,1024", str(scad_file)], capture_output=True)
        
        # Export STL
        subprocess.run([OPENSCAD_BIN, "-o", str(stl_file), "-D", "$fn=30", str(scad_file)], capture_output=True)

        # Write README.md
        holes_str = ", ".join(f"{h:.1f}mm" for h in res["dims"].hole_positions)
        readme = (
            f"# 🪈 {ex['title']}\n\n"
            f"{ex['desc']}\n\n"
            f"---\n\n"
            f"## 📸 3D Renderings\n\n"
            f"| Full Assembly View | Mouthpiece & Beak Detail |\n"
            f"|:---:|:---:|\n"
            f"| ![Full Flute](flute_iso.png) | ![Mouthpiece Detail](flute_head.png) |\n\n"
            f"---\n\n"
            f"## 🎧 Audio & MIDI Preview\n\n"
            f"- 🔊 **Audio Recording (WAV)**: [flute.wav](flute.wav)\n"
            f"- 🎼 **MIDI Sequence**: [flute.mid](flute.mid)\n"
            f"- 📐 **Parametric OpenSCAD Model**: [flute.scad](flute.scad)\n"
            f"- 🖨️ **3D Printable STL**: [flute.stl](flute.stl)\n\n"
            f"> [!TIP]\n"
            f"> Open [`index.html`](index.html) in your web browser for an interactive 3D rotating model viewer with embedded audio playback!\n\n"
            f"---\n\n"
            f"## 📐 Acoustic & CAD Specifications\n\n"
            f"- **Root Note**: MIDI {ex['root']}\n"
            f"- **Musical Scale**: `{ex['scale']}`\n"
            f"- **Melody Preset**: `{ex['melody']}`\n"
            f"- **Mouthpiece Profile**: `{ex['windway_profile']}`\n"
            f"- **Windway Texture**: `{ex['windway_texture']}`\n"
            f"- **Drone Air Balancing Ratio**: `{ex['drone_air_ratio']}`\n"
            f"- **Total Height**: {res['dims'].total_length:.1f} mm\n"
            f"- **Melody Tube Length**: {res['dims'].length_melody:.1f} mm ({res['dims'].melody_frequencies[0]:.1f} Hz)\n"
            f"- **Drone 1 Tube Length**: {res['dims'].length_drone1:.1f} mm ({res['dims'].drone1_frequency:.1f} Hz)\n"
            f"- **Drone 2 Tube Length**: {res['dims'].length_drone2:.1f} mm ({res['dims'].drone2_frequency:.1f} Hz)\n"
            f"- **Tone Holes**: {len(res['dims'].hole_positions)} holes ({holes_str})\n"
        )
        with open(p / "README.md", "w") as f:
            f.write(readme)

        # Write index.html
        html = (
            "<!DOCTYPE html>\n"
            "<html lang=\"en\">\n"
            "<head>\n"
            "  <meta charset=\"UTF-8\">\n"
            f"  <title>{ex['title']}</title>\n"
            "  <style>\n"
            "    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #121214; color: #f0f0f5; margin: 0; padding: 24px; display: flex; flex-direction: column; align-items: center; }\n"
            "    .container { max-width: 960px; width: 100%; background: #1e1e24; border-radius: 16px; padding: 28px; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }\n"
            "    h1 { margin-top: 0; font-size: 1.6rem; color: #e2e8f0; }\n"
            "    p { color: #94a3b8; line-height: 1.6; }\n"
            "    .player-card { background: #282832; padding: 18px 24px; border-radius: 12px; margin: 20px 0; display: flex; align-items: center; gap: 20px; border: 1px solid #3e3e4f; }\n"
            "    audio { width: 100%; filter: invert(0.9) hue-rotate(180deg); }\n"
            "    #viewport { width: 100%; height: 500px; background: radial-gradient(circle, #2d3748 0%, #1a202c 100%); border-radius: 12px; overflow: hidden; position: relative; }\n"
            "    .badge { display: inline-block; padding: 4px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 0.8rem; font-weight: 600; margin-right: 8px; }\n"
            "    .specs { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-top: 20px; }\n"
            "    .spec-box { background: #282832; padding: 14px; border-radius: 10px; border-left: 4px solid #3b82f6; }\n"
            "    .spec-box span { display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }\n"
            "    .spec-box strong { font-size: 1.1rem; color: #f8fafc; }\n"
            "  </style>\n"
            "  <script src=\"https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js\"></script>\n"
            "  <script src=\"https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js\"></script>\n"
            "  <script src=\"https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js\"></script>\n"
            "</head>\n"
            "<body>\n"
            "  <div class=\"container\">\n"
            f"    <h1>🪈 {ex['title']}</h1>\n"
            f"    <p>{ex['desc']}</p>\n\n"
            "    <div class=\"player-card\">\n"
            "      <span class=\"badge\">AUDIO PREVIEW</span>\n"
            "      <audio controls autoplay loop src=\"flute.wav\"></audio>\n"
            "    </div>\n\n"
            "    <h3>Interactive 3D Model (Click & Drag to Rotate / Scroll to Zoom)</h3>\n"
            "    <div id=\"viewport\"></div>\n\n"
            "    <div class=\"specs\">\n"
            f"      <div class=\"spec-box\"><span>Root Pitch</span><strong>MIDI {ex['root']} ({res['dims'].melody_frequencies[0]:.1f} Hz)</strong></div>\n"
            f"      <div class=\"spec-box\"><span>Musical Scale</span><strong>{ex['scale']}</strong></div>\n"
            f"      <div class=\"spec-box\"><span>Mouthpiece Profile</span><strong>{ex['windway_profile'].upper()}</strong></div>\n"
            f"      <div class=\"spec-box\"><span>Total Length</span><strong>{res['dims'].total_length:.1f} mm</strong></div>\n"
            "    </div>\n"
            "  </div>\n\n"
            "  <script>\n"
            "    const container = document.getElementById('viewport');\n"
            "    const scene = new THREE.Scene();\n"
            "    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);\n"
            "    camera.position.set(0, -350, 200);\n\n"
            "    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });\n"
            "    renderer.setSize(container.clientWidth, container.clientHeight);\n"
            "    renderer.setPixelRatio(window.devicePixelRatio);\n"
            "    container.appendChild(renderer.domElement);\n\n"
            "    const controls = new THREE.OrbitControls(camera, renderer.domElement);\n"
            "    controls.enableDamping = true;\n"
            "    controls.dampingFactor = 0.05;\n\n"
            "    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);\n"
            "    scene.add(ambientLight);\n\n"
            "    const dirLight1 = new THREE.DirectionalLight(0xfff5ea, 0.9);\n"
            "    dirLight1.position.set(150, -200, 300);\n"
            "    scene.add(dirLight1);\n\n"
            "    const dirLight2 = new THREE.DirectionalLight(0xdbeafe, 0.5);\n"
            "    dirLight2.position.set(-150, 200, -100);\n"
            "    scene.add(dirLight2);\n\n"
            "    const loader = new THREE.STLLoader();\n"
            "    loader.load('flute.stl', function (geometry) {\n"
            "      geometry.computeVertexNormals();\n"
            "      geometry.center();\n"
            "      const material = new THREE.MeshStandardMaterial({\n"
            "        color: 0xdeb887,\n"
            "        roughness: 0.35,\n"
            "        metalness: 0.15,\n"
            "      });\n"
            "      const mesh = new THREE.Mesh(geometry, material);\n"
            "      mesh.rotation.x = -Math.PI / 2;\n"
            "      scene.add(mesh);\n"
            "    });\n\n"
            "    function animate() {\n"
            "      requestAnimationFrame(animate);\n"
            "      controls.update();\n"
            "      renderer.render(scene, camera);\n"
            "    }\n"
            "    animate();\n\n"
            "    window.addEventListener('resize', () => {\n"
            "      camera.aspect = container.clientWidth / container.clientHeight;\n"
            "      camera.updateProjectionMatrix();\n"
            "      renderer.setSize(container.clientWidth, container.clientHeight);\n"
            "    });\n"
            "  </script>\n"
            "</body>\n"
            "</html>\n"
        )
        with open(p / "index.html", "w") as f:
            f.write(html)

    print("All showcase examples generated successfully!")


if __name__ == "__main__":
    build_examples()
