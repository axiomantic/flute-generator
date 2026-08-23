"""Deep physical and acoustic invariant tests for flute calculations."""

import math
import pytest
from flute_generator.acoustics import (
    SPEED_OF_SOUND_MM_S,
    FluteDimensions,
    calculate_flute_geometry,
    calculate_tube_length,
    freq_to_midi,
    midi_to_freq,
)
from flute_generator.scales import SCALES


class TestAcousticPhysics:
    def test_frequency_octave_doubling_invariant(self):
        """Every 12 semitones must exactly double the frequency across all octaves."""
        for midi_note in range(12, 116):
            f1 = midi_to_freq(midi_note)
            f2 = midi_to_freq(midi_note + 12)
            assert pytest.approx(f2 / f1, rel=1e-6) == 2.0

    def test_midi_freq_exact_roundtrip(self):
        """Converting MIDI -> Hz -> MIDI must be identity for all 128 MIDI notes."""
        for note in range(128):
            hz = midi_to_freq(note)
            recalculated_midi = freq_to_midi(hz)
            assert pytest.approx(recalculated_midi, abs=1e-5) == float(note)

    def test_bore_diameter_end_correction_invariant(self):
        """A wider bore creates a larger end correction, shortening physical tube length for same pitch."""
        f = 440.0
        narrow_bore_length = calculate_tube_length(f, bore_diameter=15.0)
        wide_bore_length = calculate_tube_length(f, bore_diameter=25.0)
        assert wide_bore_length < narrow_bore_length
        # Difference in physical length must equal difference in end corrections (1.6 * delta_d)
        expected_diff = 1.6 * (25.0 - 15.0)
        assert pytest.approx(narrow_bore_length - wide_bore_length, rel=1e-5) == expected_diff

    def test_pitch_to_tube_length_inverse_relationship(self):
        """Higher frequency must strictly produce shorter tube lengths."""
        freqs = [220.0, 330.0, 440.0, 550.0, 660.0, 880.0]
        bore = 19.0
        lengths = [calculate_tube_length(f, bore) for f in freqs]
        for i in range(len(lengths) - 1):
            assert lengths[i] > lengths[i + 1], f"Lower pitch {freqs[i]}Hz must have longer tube than {freqs[i+1]}Hz"

    def test_speed_of_sound_scaling(self):
        """Tube length must scale linearly with speed of sound."""
        f = 440.0
        bore = 19.0
        l_standard = calculate_tube_length(f, bore, speed_of_sound=SPEED_OF_SOUND_MM_S)
        l_hot_air = calculate_tube_length(f, bore, speed_of_sound=350000.0)  # ~35°C
        assert l_hot_air > l_standard


class TestFluteGeometryCalculations:
    def test_tone_holes_monotonic_ordering(self):
        """Tone holes must be strictly ordered from bottom (lowest hole note) to top (highest hole note)."""
        dims = calculate_flute_geometry(
            root_midi=69,
            scale_intervals=SCALES["minor_pentatonic"],
            bore_melody=19.0,
        )
        # 5 tone holes for the 5 upper notes of the 6-note pentatonic scale
        assert len(dims.hole_positions) == 5
        for i in range(len(dims.hole_positions) - 1):
            assert dims.hole_positions[i] > dims.hole_positions[i + 1], (
                f"Hole {i} at {dims.hole_positions[i]}mm must be further from fipple "
                f"than higher-pitch hole {i+1} at {dims.hole_positions[i+1]}mm"
            )

    def test_tone_holes_within_melody_tube_bounds(self):
        """All tone holes must sit between fipple (0mm) and open end of melody tube."""
        dims = calculate_flute_geometry(root_midi=69, scale_intervals=SCALES["major"])
        for pos in dims.hole_positions:
            assert 0 < pos < dims.length_melody, f"Hole at {pos}mm must be within melody length {dims.length_melody}mm"

    def test_drone_tube_lengths_match_pitch_offsets(self):
        """Drone 1 (root) and Drone 2 (5th) lengths must reflect their acoustic frequencies."""
        dims = calculate_flute_geometry(
            root_midi=69,  # A4 (440 Hz)
            drone1_offset=0,  # A4 (440 Hz)
            drone2_offset=7,  # E5 (659.25 Hz)
            bore_melody=19.0,
            bore_drone1=19.0,
            bore_drone2=19.0,
        )
        # Same bore, so root melody and root drone1 have identical lengths
        assert pytest.approx(dims.length_drone1, rel=1e-4) == dims.length_melody
        # 5th drone (higher pitch) must be significantly shorter
        assert dims.length_drone2 < dims.length_drone1
        # Perfect 5th frequency ratio is 2^(7/12) ~ 1.4983
        assert pytest.approx(dims.drone2_frequency / dims.drone1_frequency, rel=1e-3) == (2.0 ** (7 / 12))

    def test_total_body_length_encloses_longest_pipe_with_head_margin(self):
        """Total flute body must enclose the longest bore plus extra head space."""
        margin = 30.0
        dims = calculate_flute_geometry(
            root_midi=60,  # C4 (low pitch -> long tube)
            drone1_offset=-12,  # C3 (sub-octave drone -> longest tube)
            drone2_offset=7,
            extra_head_length=margin,
        )
        longest_bore = max(dims.length_melody, dims.length_drone1, dims.length_drone2)
        assert dims.length_drone1 == longest_bore
        assert pytest.approx(dims.total_length, rel=1e-5) == longest_bore + margin

    def test_invalid_parameters_raise_meaningful_errors(self):
        """Acoustics must reject impossible or zero physical parameters."""
        with pytest.raises(ValueError, match="Frequency must be greater than zero"):
            calculate_tube_length(0.0, 19.0)

        with pytest.raises(ValueError, match="Bore diameter must be greater than zero"):
            calculate_tube_length(440.0, -5.0)

        # Bore diameter so large that end correction exceeds acoustic length
        with pytest.raises(ValueError, match="non-positive"):
            calculate_tube_length(440.0, 1000.0)
