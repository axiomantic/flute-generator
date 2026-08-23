"""Deep tests for CLI argument parsing, interactive wizard simulation, and batch workflows."""

from pathlib import Path
import tempfile
from unittest.mock import patch
import pytest

from flute_generator.cli import generate_flute, interactive_wizard, main, parse_arguments


class TestCliParsing:
    def test_all_custom_arguments(self):
        args = parse_arguments([
            "--root", "G4",
            "--scale", "dorian",
            "--melody", "morning_mood",
            "--drone1", "0",
            "--drone2", "7",
            "--bore-melody", "18.0",
            "--bore-drone1", "20.0",
            "--bore-drone2", "15.0",
            "--wall", "3.5",
            "--spacing", "24.0",
            "--hole-d", "6.5",
            "--soundfont", "/path/to/font.sf2",
            "--output-dir", "/tmp/out",
            "--name", "my_custom_flute",
            "--non-interactive",
        ])
        assert args.root == "G4"
        assert args.scale == "dorian"
        assert args.melody == "morning_mood"
        assert args.bore_melody == 18.0
        assert args.bore_drone1 == 20.0
        assert args.bore_drone2 == 15.0
        assert args.wall == 3.5
        assert args.spacing == 24.0
        assert args.hole_d == 6.5
        assert args.soundfont == "/path/to/font.sf2"
        assert args.output_dir == "/tmp/out"
        assert args.name == "my_custom_flute"
        assert args.non_interactive is True


class TestInteractiveWizardSimulation:
    def test_interactive_wizard_with_default_answers(self):
        """Simulate user pressing Enter (accepting defaults) on all prompts."""
        # Simulated responses for: root, scale, melody, drone1, drone2, adv_choice, out_dir, out_name, sf2
        inputs = ["", "", "", "", "", "N", "", "", ""]
        with patch("builtins.input", side_effect=inputs):
            params = interactive_wizard()

        assert params["root_midi"] == 69  # A4
        assert params["scale"] == "minor_pentatonic"
        assert params["melody"] == "condor_pasa"
        assert params["drone1_offset"] == 0
        assert params["drone2_offset"] == 7
        assert params["output_dir"] == "./output"
        assert params["soundfont"] is None

    def test_interactive_wizard_with_custom_answers_and_advanced_geometry(self):
        """Simulate user providing specific custom inputs including advanced physical bore options."""
        inputs = [
            "C5",       # Root note
            "2",        # Scale 2 = major_pentatonic
            "4",        # Melody 4 = greensleeves
            "-12",      # Drone 1
            "7",        # Drone 2
            "y",        # Advanced geometry?
            "20.0",     # bore_melody
            "23.0",     # bore_drone1
            "17.0",     # bore_drone2
            "4.5",      # wall
            "26.0",     # spacing
            "8.0",      # hole_d
            "/tmp/flute_out",  # output_dir
            "custom_c5_flute", # base name
            "custom.sf2",      # soundfont
        ]
        with patch("builtins.input", side_effect=inputs):
            params = interactive_wizard()

        assert params["root_midi"] == 72  # C5
        assert params["scale"] == "major_pentatonic"
        assert params["melody"] == "greensleeves"
        assert params["drone1_offset"] == -12
        assert params["drone2_offset"] == 7
        assert params["bore_melody"] == 20.0
        assert params["bore_drone1"] == 23.0
        assert params["bore_drone2"] == 17.0
        assert params["wall"] == 4.5
        assert params["spacing"] == 26.0
        assert params["hole_d"] == 8.0
        assert params["output_dir"] == "/tmp/flute_out"
        assert params["name"] == "custom_c5_flute"
        assert params["soundfont"] == "custom.sf2"


class TestEndToEndExecution:
    def test_main_cli_batch_mode_generates_all_files(self):
        """Verify full end-to-end execution generates SCAD, MIDI, and WAV files with non-zero size."""
        with tempfile.TemporaryDirectory() as tmpdir:
            exit_code = main([
                "--root", "D4",
                "--scale", "minor_pentatonic",
                "--melody", "amazing_grace",
                "--output-dir", tmpdir,
                "--name", "d4_grace_flute",
                "--non-interactive",
            ])
            assert exit_code == 0

            out_dir = Path(tmpdir)
            scad = out_dir / "d4_grace_flute.scad"
            mid = out_dir / "d4_grace_flute.mid"
            wav = out_dir / "d4_grace_flute.wav"

            assert scad.is_file() and scad.stat().st_size > 500
            assert mid.is_file() and mid.stat().st_size > 100
            assert wav.is_file() and wav.stat().st_size > 1000
