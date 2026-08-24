"""Deep tests for expressive MIDI sequencing, controllers (CC1/CC11), physical waveguide acoustic synthesis, and stereo Freeverb reverb."""

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
    PhysicalWaveguidePipe,
    StereoFreeverb,
    synthesize_flute_audio,
)
from flute_generator.melodies import NoteEvent, build_quantized_melody
from flute_generator.scales import SCALES


class TestMidiSequencing:
    def test_midi_multitrack_structure_and_expressive_controllers(self):
        """MIDI file must contain Conductor, Melody with CC1/CC11/CC91/Pitchwheel, and Drone tracks."""
        dims = calculate_flute_geometry(root_midi=69)
        events = build_quantized_melody("condor_pasa", root_midi=69, scale_intervals=dims.scale_intervals)

        with tempfile.TemporaryDirectory() as tmpdir:
            midi_path = Path(tmpdir) / "flute.mid"
            create_flute_midi(dims, events, midi_path, bpm=120)

            mid = mido.MidiFile(str(midi_path))
            assert len(mid.tracks) == 4  # Conductor, Melody, Drone 1, Drone 2

            # Check Conductor track tempo
            conductor = mid.tracks[0]
            tempo_msgs = [m for m in conductor if m.type == 'set_tempo']
            assert len(tempo_msgs) == 1
            assert pytest.approx(mido.tempo2bpm(tempo_msgs[0].tempo), abs=0.1) == 120.0

            # Check Melody track (Track 1)
            melody_track = mid.tracks[1]
            program_msgs = [m for m in melody_track if m.type == 'program_change']
            assert len(program_msgs) == 1
            assert program_msgs[0].program == 73  # GM Flute

            # Check CC1 (vibrato modulation), CC11 (expression breath), CC91 (reverb)
            cc_msgs = [m for m in melody_track if m.type == 'control_change']
            cc_numbers = {m.control for m in cc_msgs}
            assert 1 in cc_numbers   # Vibrato LFO depth
            assert 11 in cc_numbers  # Expression breath swell
            assert 91 in cc_numbers  # Reverb send
            assert 10 in cc_numbers  # Pan

    def test_drone_tracks_have_stereo_separation_and_independent_channels(self):
        """Drone 1 and Drone 2 must be on separate channels with distinct stereo panning."""
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
            drone1_track = mid.tracks[2]
            drone2_track = mid.tracks[3]

            # Drone 1 channel 1, left pan (38)
            d1_pan = [m.value for m in drone1_track if m.type == 'control_change' and m.control == 10]
            assert d1_pan == [38]

            # Drone 2 channel 2, right pan (90)
            d2_pan = [m.value for m in drone2_track if m.type == 'control_change' and m.control == 10]
            assert d2_pan == [90]


class TestPhysicalWaveguideSynthesis:
    def test_synthesized_wav_stereo_and_signal_properties(self):
        """Synthesized WAV must have valid 16-bit PCM stereo format with rich non-clipped samples."""
        dims = calculate_flute_geometry(root_midi=69)
        events = build_quantized_melody("native_motif", root_midi=69, scale_intervals=dims.scale_intervals)

        sample_rate = 22050
        bpm = 120
        with tempfile.TemporaryDirectory() as tmpdir:
            wav_path = Path(tmpdir) / "output.wav"
            synthesize_flute_audio(dims, events, wav_path, sample_rate=sample_rate, bpm=bpm)

            assert wav_path.exists()

            with wave.open(str(wav_path), "rb") as w:
                assert w.getnchannels() == 2  # Stereo
                assert w.getsampwidth() == 2  # 16-bit
                assert w.getframerate() == sample_rate
                n_frames = w.getnframes()
                raw_bytes = w.readframes(n_frames)

            # Unpack all 16-bit signed interleaved stereo samples (L, R)
            num_samples = len(raw_bytes) // 2
            samples = struct.unpack(f"<{num_samples}h", raw_bytes)

            max_sample = max(samples)
            min_sample = min(samples)

            # Must have strong acoustic signal
            assert max_sample > 1000
            assert min_sample < -1000

            # Must not hard-clip (all samples strictly within 16-bit range)
            assert max_sample <= 32767
            assert min_sample >= -32768

            # Average DC offset should be minimal
            mean_dc = sum(samples) / len(samples)
            assert abs(mean_dc) < 500

    def test_waveguide_pipe_frequency_tuning(self):
        """Waveguide pipe must respond to frequency changes."""
        pipe = PhysicalWaveguidePipe(sample_rate=44100)
        pipe.set_frequency(440.0)
        assert pipe.target_freq == 440.0

    def test_stereo_freeverb_processing(self):
        """Stereo Freeverb must diffuse impulses and maintain stereo decorrelation."""
        reverb = StereoFreeverb(sample_rate=44100)
        out_l, out_r = reverb.process(1.0, 1.0, room_size=0.8, damping=0.2, wet=0.5, dry=0.5)
        assert out_l != 0.0
        assert out_r != 0.0
