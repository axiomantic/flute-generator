"""Deep tests for melody presets, quantization algorithms, rhythmic conservation, and transposition."""

import pytest
from flute_generator.melodies import (
    MELODY_PRESETS,
    build_quantized_melody,
    get_available_flute_notes,
    quantize_note_to_scale,
)
from flute_generator.scales import SCALES


class TestQuantizationAlgorithm:
    def test_exact_scale_tones_remain_unchanged(self):
        """Notes that already belong to the scale must never be altered by quantization."""
        scale = [60, 62, 64, 65, 67, 69, 71, 72]  # C major
        for note in scale:
            assert quantize_note_to_scale(note, scale) == note

    def test_chromatic_passing_tones_snap_to_closest_pitch(self):
        """Accidentals/passing notes outside the flute scale snap to nearest available scale tone."""
        # Minor pentatonic in C: C4(60), Eb4(63), F4(66), G4(67), Bb4(70), C5(72)
        c_pent = [60, 63, 65, 67, 70, 72]

        # Db4 (61) -> snaps to C4 (60)
        assert quantize_note_to_scale(61, c_pent) == 60
        # D4 (62) -> distance to 60 is 2, distance to 63 is 1 -> snaps to Eb4 (63)
        assert quantize_note_to_scale(62, c_pent) == 63
        # E4 (64) -> distance to 63 is 1, distance to 65 is 1 -> snaps to lowest on tie (63)
        assert quantize_note_to_scale(64, c_pent) == 63
        # F#4 (66) -> distance to 65 is 1, distance to 67 is 1 -> snaps to 65
        assert quantize_note_to_scale(66, c_pent) == 65

    def test_out_of_bounds_target_clamps_to_nearest_edge(self):
        """Notes below the lowest scale tone snap to root, and notes above max snap to highest note."""
        scale = [60, 63, 65, 67, 70, 72]
        assert quantize_note_to_scale(48, scale) == 60  # Far below
        assert quantize_note_to_scale(88, scale) == 72  # Far above


class TestMelodyPresetsAndQuantizationIntegration:
    @pytest.mark.parametrize("preset_name", list(MELODY_PRESETS.keys()))
    def test_all_presets_quantize_without_error(self, preset_name):
        """All melody presets must successfully quantize against various flute tunings."""
        for root in [57, 60, 69, 74]:  # A3, C4, A4, D5
            for scale_name in SCALES.keys():
                events = build_quantized_melody(
                    melody_name=preset_name,
                    root_midi=root,
                    scale_intervals=SCALES[scale_name],
                    octaves=2,
                )
                assert len(events) > 0

    def test_rhythm_and_duration_conservation(self):
        """Total melody duration in beats must strictly equal the sum of durations in the raw preset."""
        for preset_name, raw_events in MELODY_PRESETS.items():
            expected_total_beats = sum(item[1] for item in raw_events)
            quantized_events = build_quantized_melody(
                melody_name=preset_name,
                root_midi=69,
                scale_intervals=SCALES["minor_pentatonic"],
            )
            actual_total_beats = sum(e.duration_beats for e in quantized_events)
            assert pytest.approx(actual_total_beats, rel=1e-5) == expected_total_beats

    def test_rest_preservation(self):
        """Rests (None) in the raw preset must be preserved at the exact same beat position."""
        raw_condor = MELODY_PRESETS["condor_pasa"]
        quantized_condor = build_quantized_melody(
            melody_name="condor_pasa",
            root_midi=69,
            scale_intervals=SCALES["minor_pentatonic"],
        )
        assert len(raw_condor) == len(quantized_condor)
        for raw_item, q_event in zip(raw_condor, quantized_condor):
            raw_pitch = raw_item[0]
            raw_dur = raw_item[1]
            assert q_event.duration_beats == raw_dur
            if raw_pitch is None:
                assert q_event.midi_note is None
            else:
                assert q_event.midi_note is not None
                assert 0 <= q_event.midi_note <= 127

    def test_transposition_invariance(self):
        """When root is transposed by +N semitones, all non-rest notes shift upwards consistently."""
        events_a4 = build_quantized_melody("condor_pasa", root_midi=69, scale_intervals=SCALES["minor_pentatonic"])
        events_c5 = build_quantized_melody("condor_pasa", root_midi=72, scale_intervals=SCALES["minor_pentatonic"])

        for e_a, e_c in zip(events_a4, events_c5):
            if e_a.midi_note is not None:
                assert e_c.midi_note is not None
                assert e_c.midi_note - e_a.midi_note == 3  # Transposed up by minor 3rd (3 semitones)
