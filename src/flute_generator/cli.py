"""Command-Line Interface for the Flute Generator."""

import argparse
from pathlib import Path
import shutil
import sys
from typing import Optional

from .acoustics import calculate_flute_geometry
from .audio import (
    create_flute_midi,
    find_soundfont,
    get_soundfont_instructions,
    render_soundfont_wav,
    synthesize_fallback_wav,
)
from .cad import save_scad_file
from .melodies import MELODY_PRESETS, build_quantized_melody
from .scales import SCALES, midi_to_note_name, note_name_to_midi


def prompt_user_input(prompt: str, default: str) -> str:
    """Prompt user for input with a default fallback."""
    user_val = input(f"{prompt} [{default}]: ").strip()
    return user_val if user_val else default


def interactive_wizard() -> dict:
    """Prompt the user step-by-step for flute parameters."""
    print("==========================================================")
    print("           🪈  PARAMETRIC FLUTE GENERATOR  🪈           ")
    print("==========================================================")
    print("Configure your multi-drone flute, CAD model, and audio preview.\n")

    # 1. Root note
    root_input = prompt_user_input("Root note (e.g. A4, C4, D5, or MIDI 69)", "A4")
    try:
        root_midi = note_name_to_midi(root_input)
    except ValueError as e:
        print(f"Invalid note '{root_input}', falling back to A4 (69). ({e})")
        root_midi = 69

    # 2. Scale
    print("\nAvailable Scales:")
    scale_keys = list(SCALES.keys())
    for idx, s in enumerate(scale_keys, 1):
        intervals = SCALES[s]
        print(f"  {idx}) {s.replace('_', ' ').title()} (intervals: {intervals})")
    scale_choice = prompt_user_input(f"Choose scale (1-{len(scale_keys)} or name)", "1")
    if scale_choice.isdigit() and 1 <= int(scale_choice) <= len(scale_keys):
        scale_name = scale_keys[int(scale_choice) - 1]
    elif scale_choice.lower().replace(" ", "_") in SCALES:
        scale_name = scale_choice.lower().replace(" ", "_")
    else:
        scale_name = "minor_pentatonic"
    print(f"  -> Selected Scale: {scale_name}")

    # 3. Melody Preset
    print("\nAvailable Melody Presets (automatically quantized to your flute):")
    melody_keys = list(MELODY_PRESETS.keys())
    for idx, m in enumerate(melody_keys, 1):
        print(f"  {idx}) {m.replace('_', ' ').title()}")
    mel_choice = prompt_user_input(f"Choose melody (1-{len(melody_keys)} or name)", "1")
    if mel_choice.isdigit() and 1 <= int(mel_choice) <= len(melody_keys):
        melody_name = melody_keys[int(mel_choice) - 1]
    elif mel_choice.lower().replace(" ", "_") in MELODY_PRESETS:
        melody_name = mel_choice.lower().replace(" ", "_")
    else:
        melody_name = "condor_pasa"
    print(f"  -> Selected Melody: {melody_name}")

    # 4. Drones
    print("\nDrone Offsets (in semitones relative to root):")
    d1_str = prompt_user_input("Drone 1 offset (semitones, 0 = Root)", "0")
    d2_str = prompt_user_input("Drone 2 offset (semitones, 7 = Perfect 5th)", "7")
    try:
        drone1_offset = int(d1_str)
    except ValueError:
        drone1_offset = 0
    try:
        drone2_offset = int(d2_str)
    except ValueError:
        drone2_offset = 7

    # 5. Advanced physical dimensions
    adv = prompt_user_input("\nCustomize physical dimensions / bore sizes? (y/N)", "N")
    bore_melody = 19.0
    bore_drone1 = 22.0
    bore_drone2 = 16.0
    wall = 4.0
    spacing = 25.0
    hole_d = 7.0

    if adv.lower().startswith('y'):
        try:
            bore_melody = float(prompt_user_input("Melody bore diameter (mm)", "19.0"))
            bore_drone1 = float(prompt_user_input("Drone 1 bore diameter (mm)", "22.0"))
            bore_drone2 = float(prompt_user_input("Drone 2 bore diameter (mm)", "16.0"))
            wall = float(prompt_user_input("Wall thickness (mm)", "4.0"))
            spacing = float(prompt_user_input("Bore center spacing (mm)", "25.0"))
            hole_d = float(prompt_user_input("Finger hole diameter (mm)", "7.0"))
        except ValueError:
            print("Invalid numeric input, using defaults.")

    # 6. Output settings
    out_dir = prompt_user_input("\nOutput directory", "./output")
    out_name = prompt_user_input("Base file name", f"flute_{midi_to_note_name(root_midi)}_{scale_name}")
    sf2_path = prompt_user_input("Custom SoundFont .sf2 path (press Enter to auto-detect)", "")

    return {
        "root_midi": root_midi,
        "scale": scale_name,
        "melody": melody_name,
        "drone1_offset": drone1_offset,
        "drone2_offset": drone2_offset,
        "bore_melody": bore_melody,
        "bore_drone1": bore_drone1,
        "bore_drone2": bore_drone2,
        "wall": wall,
        "spacing": spacing,
        "hole_d": hole_d,
        "output_dir": out_dir,
        "name": out_name,
        "soundfont": sf2_path if sf2_path else None,
    }


def parse_arguments(args: Optional[list] = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Parametric Multi-Drone Flute OpenSCAD & Audio Preview Generator",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--root", "-r",
        default="A4",
        help="Root note name (e.g. A4, C5, F#4) or MIDI number (69)",
    )
    parser.add_argument(
        "--scale",
        default="minor_pentatonic",
        choices=list(SCALES.keys()),
        help="Musical scale for melody bore tone holes",
    )
    parser.add_argument(
        "--melody", "-m",
        default="condor_pasa",
        choices=list(MELODY_PRESETS.keys()),
        help="Common flute melody preset quantized to the flute's scale",
    )
    parser.add_argument(
        "--drone1",
        type=int,
        default=0,
        help="Drone 1 semitone offset from root (0 = root)",
    )
    parser.add_argument(
        "--drone2",
        type=int,
        default=7,
        help="Drone 2 semitone offset from root (7 = 5th)",
    )
    parser.add_argument(
        "--bore-melody",
        type=float,
        default=19.0,
        help="Melody bore diameter (mm)",
    )
    parser.add_argument(
        "--bore-drone1",
        type=float,
        default=22.0,
        help="Drone 1 bore diameter (mm)",
    )
    parser.add_argument(
        "--bore-drone2",
        type=float,
        default=16.0,
        help="Drone 2 bore diameter (mm)",
    )
    parser.add_argument(
        "--wall",
        type=float,
        default=4.0,
        help="Tube wall thickness (mm)",
    )
    parser.add_argument(
        "--spacing",
        type=float,
        default=25.0,
        help="Spacing between bore centers (mm)",
    )
    parser.add_argument(
        "--hole-d",
        type=float,
        default=7.0,
        help="Tone hole diameter (mm)",
    )
    parser.add_argument(
        "--windway-profile",
        choices=["flat", "arched", "sac", "venturi"],
        default="flat",
        help="Mouthpiece windway acoustic profile (flat, arched, sac [Slow Air Chamber], venturi)",
    )
    parser.add_argument(
        "--drone-air-ratio",
        type=float,
        default=0.78,
        help="Ratio of drone windway height to melody windway height (0.5 to 1.0)",
    )
    parser.add_argument(
        "--windway-texture",
        choices=["smooth", "ribbed"],
        default="smooth",
        help="Aeroacoustic windway surface texture (smooth, ribbed)",
    )
    parser.add_argument(
        "--soundfont", "-s",
        default=None,
        help="Path to .sf2 SoundFont file",
    )
    parser.add_argument(
        "--output-dir", "-o",
        default="./output",
        help="Output directory for generated files",
    )
    parser.add_argument(
        "--name", "-n",
        default=None,
        help="Base file name for generated files (defaults to flute_<note>_<scale>)",
    )
    parser.add_argument(
        "--interactive", "-i",
        action="store_true",
        help="Run in interactive wizard mode",
    )
    parser.add_argument(
        "--non-interactive", "--batch",
        action="store_true",
        help="Run non-interactively using CLI arguments/defaults",
    )

    return parser.parse_args(args)


def generate_flute(
    root_midi: int,
    scale_name: str,
    melody_name: str,
    drone1_offset: int = 0,
    drone2_offset: int = 7,
    bore_melody: float = 19.0,
    bore_drone1: float = 22.0,
    bore_drone2: float = 16.0,
    wall: float = 4.0,
    spacing: float = 25.0,
    hole_d: float = 7.0,
    windway_profile: str = "flat",
    drone_air_ratio: float = 0.78,
    windway_texture: str = "smooth",
    output_dir: str = "./output",
    base_name: Optional[str] = None,
    soundfont_path: Optional[str] = None,
) -> dict:
    """Execute complete geometry calculations, CAD script generation, and audio synthesis."""
    scale_intervals = SCALES.get(scale_name, SCALES["minor_pentatonic"])
    root_name = midi_to_note_name(root_midi)

    if not base_name:
        base_name = f"flute_{root_name}_{scale_name}"

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    scad_file = out_path / f"{base_name}.scad"
    midi_file = out_path / f"{base_name}.mid"
    wav_file = out_path / f"{base_name}.wav"

    # 1. Acoustic and Geometric Calculations
    print(f"\n[1/3] Calculating flute acoustics for {root_name} ({root_midi}) {scale_name}...")
    dims = calculate_flute_geometry(
        root_midi=root_midi,
        scale_intervals=scale_intervals,
        drone1_offset=drone1_offset,
        drone2_offset=drone2_offset,
        bore_melody=bore_melody,
        bore_drone1=bore_drone1,
        bore_drone2=bore_drone2,
        wall=wall,
        spacing=spacing,
        hole_diameter=hole_d,
        windway_profile=windway_profile,
        drone_air_ratio=drone_air_ratio,
        windway_texture=windway_texture,
    )

    print(f"      - Melody Tube Length : {dims.length_melody:.1f} mm (Fundamental: {dims.melody_frequencies[0]:.1f} Hz)")
    print(f"      - Drone 1 Tube Length: {dims.length_drone1:.1f} mm ({dims.drone1_frequency:.1f} Hz)")
    print(f"      - Drone 2 Tube Length: {dims.length_drone2:.1f} mm ({dims.drone2_frequency:.1f} Hz)")
    print(f"      - Tone Holes ({len(dims.hole_positions)} holes): " + ", ".join(f"{p:.1f}mm" for p in dims.hole_positions))
    print(f"      - Mouthpiece Profile : {dims.windway_profile.upper()} (drone air ratio: {dims.drone_air_ratio:.2f}, texture: {dims.windway_texture})")
    print(f"      - Total Body Length  : {dims.total_length:.1f} mm")

    # 2. OpenSCAD 3D Model Generation
    print(f"\n[2/3] Generating OpenSCAD model...")
    save_scad_file(dims, scad_file)
    print(f"      ✓ OpenSCAD file saved: {scad_file.resolve()}")

    # 3. Melody Quantization and Audio Synthesis
    print(f"\n[3/3] Quantizing melody '{melody_name}' & synthesizing audio...")
    melody_events = build_quantized_melody(
        melody_name=melody_name,
        root_midi=root_midi,
        scale_intervals=scale_intervals,
    )

    create_flute_midi(dims, melody_events, midi_file)
    print(f"      ✓ MIDI file saved: {midi_file.resolve()}")

    # SoundFont & WAV rendering
    sf2 = find_soundfont(soundfont_path)
    fluidsynth_installed = bool(shutil.which("fluidsynth"))

    wav_rendered = False
    if sf2 and fluidsynth_installed:
        wav_rendered = render_soundfont_wav(midi_file, sf2, wav_file)
        if wav_rendered:
            print(f"      ✓ SoundFont audio rendered: {wav_file.resolve()} (using {sf2.name})")

    if not wav_rendered:
        if not sf2:
            print("\n" + "=" * 60)
            print(get_soundfont_instructions())
            print("=" * 60 + "\n")
        elif not fluidsynth_installed:
            print("\n[!] FluidSynth binary not found in system PATH.")
            print("    To render with SoundFont, install FluidSynth (e.g. 'brew install fluidsynth' or 'apt install fluidsynth').")

        # Fallback synthesis
        print("      * Generating pure-Python harmonic audio preview...")
        synthesize_fallback_wav(dims, melody_events, wav_file)
        print(f"      ✓ Fallback audio preview saved: {wav_file.resolve()}")

    print("\n✨ Flute generation complete!")
    print(f"   • OpenSCAD: {scad_file}")
    print(f"   • MIDI:     {midi_file}")
    print(f"   • Audio:    {wav_file}\n")

    return {
        "dims": dims,
        "scad_file": scad_file,
        "midi_file": midi_file,
        "wav_file": wav_file,
    }


def main(cli_args: Optional[list] = None) -> int:
    """CLI entrypoint."""
    parsed = parse_arguments(cli_args)

    # Determine if interactive mode should be triggered:
    # If explicitly requested with --interactive, or if running in a terminal with no arguments passed
    has_custom_args = any(
        arg in (sys.argv[1:] if cli_args is None else cli_args)
        for arg in ["--root", "-r", "--scale", "--melody", "-m", "--soundfont", "-s", "--drone1", "--drone2"]
    )
    should_run_interactive = parsed.interactive or (not parsed.non_interactive and not has_custom_args and sys.stdin.isatty())

    if should_run_interactive:
        params = interactive_wizard()
        generate_flute(
            root_midi=params["root_midi"],
            scale_name=params["scale"],
            melody_name=params["melody"],
            drone1_offset=params["drone1_offset"],
            drone2_offset=params["drone2_offset"],
            bore_melody=params["bore_melody"],
            bore_drone1=params["bore_drone1"],
            bore_drone2=params["bore_drone2"],
            wall=params["wall"],
            spacing=params["spacing"],
            hole_d=params["hole_d"],
            output_dir=params["output_dir"],
            base_name=params["name"],
            soundfont_path=params["soundfont"],
        )
    else:
        root_midi = note_name_to_midi(parsed.root)
        generate_flute(
            root_midi=root_midi,
            scale_name=parsed.scale,
            melody_name=parsed.melody,
            drone1_offset=parsed.drone1,
            drone2_offset=parsed.drone2,
            bore_melody=parsed.bore_melody,
            bore_drone1=parsed.bore_drone1,
            bore_drone2=parsed.bore_drone2,
            wall=parsed.wall,
            spacing=parsed.spacing,
            hole_d=parsed.hole_d,
            windway_profile=parsed.windway_profile,
            drone_air_ratio=parsed.drone_air_ratio,
            windway_texture=parsed.windway_texture,
            output_dir=parsed.output_dir,
            base_name=parsed.name,
            soundfont_path=parsed.soundfont,
        )
    return 0
