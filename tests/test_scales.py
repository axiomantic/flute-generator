"""Deep tests for note parsing, enharmonics, octaves, and musical scales."""

import pytest
from flute_generator.scales import (
    NOTE_NAMES,
    SCALES,
    get_scale_notes,
    midi_to_note_name,
    note_name_to_midi,
)


class TestNoteParsing:
    def test_all_12_chromatic_pitches_octave_4(self):
        """Verify all 12 chromatic pitches in octave 4 map to 60-71."""
        notes = ["C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"]
        for expected_midi, name in enumerate(notes, start=60):
            assert note_name_to_midi(name) == expected_midi

    def test_enharmonic_flats_and_sharps_equivalence(self):
        """Flats and sharps for identical pitches must yield the exact same MIDI note."""
        enharmonic_pairs = [
            ("C#4", "Db4"),
            ("D#4", "Eb4"),
            ("F#4", "Gb4"),
            ("G#4", "Ab4"),
            ("A#4", "Bb4"),
            ("E#4", "F4"),
            ("B#3", "C4"),
            ("Cb4", "B3"),
        ]
        for sharp, flat in enharmonic_pairs:
            assert note_name_to_midi(sharp) == note_name_to_midi(flat), f"{sharp} and {flat} should have same MIDI"

    def test_case_insensitivity_and_whitespace(self):
        """Note parser should handle lowercase and leading/trailing whitespace."""
        assert note_name_to_midi("  a4  ") == 69
        assert note_name_to_midi("c#5") == 73
        assert note_name_to_midi("eb3") == 51
        assert note_name_to_midi("f4") == 65

    def test_full_midi_note_space_roundtrip(self):
        """Every MIDI note from 0 to 127 should correctly roundtrip midi_to_note_name -> note_name_to_midi."""
        for midi_val in range(128):
            name = midi_to_note_name(midi_val)
            parsed = note_name_to_midi(name)
            assert parsed == midi_val, f"Failed roundtrip for MIDI {midi_val} -> {name} -> {parsed}"

    def test_direct_numeric_string_parsing(self):
        """Passing raw numeric strings like '69' or '60' should parse as direct MIDI integers."""
        assert note_name_to_midi("69") == 69
        assert note_name_to_midi("0") == 0
        assert note_name_to_midi("127") == 127

    def test_invalid_note_strings_raise_value_error(self):
        """Malformed or out-of-range strings must fail cleanly with ValueError."""
        invalid_inputs = ["", "   ", "H4", "X#2", "C", "#4", "A-5", "128", "-1", "C999", "foobar"]
        for inp in invalid_inputs:
            with pytest.raises(ValueError):
                note_name_to_midi(inp)


class TestScalesConsistency:
    def test_scale_intervals_mathematical_properties(self):
        """All scale intervals must start with 0, be strictly increasing, and span up to the octave (12)."""
        for scale_name, intervals in SCALES.items():
            assert intervals[0] == 0, f"{scale_name} must start with interval 0"
            assert intervals[-1] == 12, f"{scale_name} must end on the octave (12)"
            for i in range(len(intervals) - 1):
                assert intervals[i] < intervals[i + 1], f"{scale_name} intervals must be strictly increasing"

    def test_scale_note_generation_transposition(self):
        """Generating scale notes for different roots must transpose intervals faithfully."""
        # A4 minor pentatonic: A4 (69), C5 (72), D5 (74), E5 (76), G5 (79), A5 (81)
        a_pent = get_scale_notes(69, "minor_pentatonic")
        assert a_pent == [69, 72, 74, 76, 79, 81]

        # Transposed to D4 (62): D4 (62), F4 (65), G4 (67), A4 (69), C5 (72), D5 (74)
        d_pent = get_scale_notes(62, "minor_pentatonic")
        assert d_pent == [62, 65, 67, 69, 72, 74]

        # Difference between corresponding scale degrees must always equal the root shift (69 - 62 = 7)
        for an, dn in zip(a_pent, d_pent):
            assert an - dn == 7

    def test_hijaz_and_native_american_scales(self):
        """Verify Hijaz (Phrygian Dominant) and Native American flute scale intervals."""
        # Hijaz on A4: A4(69), Bb4(70), C#5(73), D5(74), E5(76), F5(77), G5(79), A5(81)
        a_hijaz = get_scale_notes(69, "hijaz")
        assert a_hijaz == [69, 70, 73, 74, 76, 77, 79, 81]

        # Native American Flute scale on A4: A4(69), C5(72), D5(74), E5(76), G5(79), A5(81)
        a_naf = get_scale_notes(69, "native_american")
        assert a_naf == [69, 72, 74, 76, 79, 81]

    def test_unknown_scale_raises_value_error(self):
        with pytest.raises(ValueError, match="Unknown scale"):
            get_scale_notes(60, "super_locrian_flat_5")
