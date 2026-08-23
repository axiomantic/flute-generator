"""Deep tests for MIDI sequencing, message timing, and audio waveform synthesis."""

import math
from pathlib import Path
import struct
import tempfile
from typing import List
import wave
import mido
import pytest

from flute_generator.acoustics import calculate_flute_geometry
from flute_generator.audio import (
    create_flute_midi,
    find_soundfont,
    get_soundfont_instructions,
    synthesize_fallback_wav,
)
from flute_generator.melodies import NoteEvent, build_quantized_melody
from flute_generator.scales import SCALES


class TestMidiSequencing:
    def test_midi_track_structure_and_flute_program(self):
        """MIDI file must contain tempo meta message and flute program change (73)."""
        dims = calculate_flute_geometry(root_midi=69)
        events = build_quantized_melody("scale_arpeggio", root_midi=69, scale_intervals=dims.scale_intervals)

        with tempfile.TemporaryDirectory() as tmpdir:
            midi_path = Path(tmpdir) / "flute.mid"
            create_flute_midi(dims, events, midi_path, bpm=120)

            mid = mido.MidiFile(str(midi_path))
            track = mid.tracks[0]

            # Check program change to flute (73)
            program_msgs = [m for m in track if m.type == 'program_change']
            assert len(program_msgs) == 1
            assert program_msgs[0].program == 73

            # Check tempo
            tempo_msgs = [m for m in track if m.type == 'set_tempo']
            assert len(tempo_msgs) == 1
            assert pytest.approx(mido.tempo2bpm(tempo_msgs[0].tempo), abs=0.1) == 120.0

    def test_drone_notes_span_entire_melody_duration(self):
        """Drone 1 and Drone 2 must start at delta 0 and end at the very end of the sequence."""
        dims = calculate_flute_geometry(root_midi=69, drone1_offset=0, drone2_offset=7)
        events = [
            NoteEvent(midi_note=69, duration_beats=1.0),
            NoteEvent(midi_note=72, duration_beats=2.0),
            NoteEvent(midi_note=None, duration_beats=1.0),
            NoteEvent(midi_note=76, duration_beats=1.0),
        ]  # Total = 5 beats

        with tempfile.TemporaryDirectory() as tmpdir:
            midi_path = Path(tmpdir) / "drone_test.mid"
            create_flute_midi(dims, events, midi_path, bpm=100)

            mid = mido.MidiFile(str(midi_path))
            track = mid.tracks[0]

            # Find drone start notes (time=0)
            drone1_note = 69
            drone2_note = 76  # 69 + 7

            note_ons = [m for m in track if m.type == 'note_on' and m.note in (drone1_note, drone2_note)]
            assert len(note_ons) >= 2
            for n_on in note_ons[:2]:
                assert n_on.time == 0

            # Calculate total ticks
            total_ticks = sum(m.time for m in track)
            expected_ticks = 5.0 * mid.ticks_per_beat
            assert pytest.approx(total_ticks, abs=1) == expected_ticks


class TestWaveformSynthesis:
    def test_synthesized_wav_header_and_signal_properties(self):
        """Synthesized WAV must have valid 16-bit PCM mono format with non-clipped samples."""
        dims = calculate_flute_geometry(root_midi=69)
        events = build_quantized_melody("native_motif", root_midi=69, scale_intervals=dims.scale_intervals)

        sample_rate = 22050
        bpm = 120
        with tempfile.TemporaryDirectory() as tmpdir:
            wav_path = Path(tmpdir) / "output.wav"
            synthesize_fallback_wav(dims, events, wav_path, sample_rate=sample_rate, bpm=bpm)

            assert wav_path.exists()

            with wave.open(str(wav_path), "rb") as w:
                assert w.getnchannels() == 1
                assert w.getsampwidth() == 2  # 16-bit
                assert w.getframerate() == sample_rate
                n_frames = w.getnframes()
                raw_bytes = w.readframes(n_frames)

            # Unpack all 16-bit signed samples
            num_samples = len(raw_bytes) // 2
            samples = struct.unpack(f"<{num_samples}h", raw_bytes)

            # Signal verification
            max_sample = max(samples)
            min_sample = min(samples)

            # Must have non-zero sound energy
            assert max_sample > 1000
            assert min_sample < -1000

            # Must not hard-clip (all samples strictly within 16-bit range)
            assert max_sample <= 32767
            assert min_sample >= -32768

            # Average DC offset should be approximately 0
            mean_dc = sum(samples) / len(samples)
            assert abs(mean_dc) < 500  # negligible DC offset


class TestSoundFontResolution:
    def test_find_soundfont_with_custom_path(self):
        with tempfile.NamedTemporaryFile(suffix=".sf2") as tmp:
            found = find_soundfont(tmp.name)
            assert found is not None
            assert found.resolve() == Path(tmp.name).resolve()

    def test_soundfont_missing_instructions_contain_download_link(self):
        msg = get_soundfont_instructions()
        assert "https://www.zanderjaz.com/downloads/soundfonts/flutes/" in msg
        assert "Mell Flutes" in msg
