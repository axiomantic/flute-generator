"""Audio and MIDI preview generation using SoundFonts or pure-Python synthesis."""

import math
from pathlib import Path
import shutil
import struct
from typing import List, Optional, Tuple, Union
import wave

import mido
from mido import Message, MetaMessage, MidiFile, MidiTrack
from midi2audio import FluidSynth

from .acoustics import FluteDimensions, midi_to_freq
from .melodies import NoteEvent

SOUNDFONT_DOWNLOAD_URL = "https://www.zanderjaz.com/downloads/soundfonts/flutes/"
DEFAULT_SF2_CANDIDATES = [
    "Mell Flutes.sf2",
    "mell_flutes.sf2",
    "GeneralUser GS.sf2",
    "fluid-soundfont-gm.sf2",
]


def find_soundfont(custom_path: Optional[Union[str, Path]] = None) -> Optional[Path]:
    """Locate a SoundFont file either at the specified path or common local filenames."""
    if custom_path:
        path = Path(custom_path)
        if path.is_file():
            return path.resolve()
        return None

    # Search current directory and parent directory for candidate SF2 names or any .sf2
    search_dirs = [Path.cwd(), Path(__file__).resolve().parent.parent.parent]
    for d in search_dirs:
        for candidate in DEFAULT_SF2_CANDIDATES:
            p = d / candidate
            if p.is_file():
                return p.resolve()

        # Check any .sf2 file in search directory
        sf2_files = list(d.glob("*.sf2"))
        if sf2_files:
            return sf2_files[0].resolve()

    return None


def get_soundfont_instructions() -> str:
    """Return instructions on where to obtain a flute SoundFont."""
    return (
        f"SoundFont not found!\n"
        f"To enable high-quality SoundFont rendering:\n"
        f"  1. Download the 'Mell Flutes' soundfont from:\n"
        f"     {SOUNDFONT_DOWNLOAD_URL}\n"
        f"  2. Place 'Mell Flutes.sf2' in the current working directory, or pass `--soundfont <path>`."
    )


def create_flute_midi(
    dims: FluteDimensions,
    melody_events: List[NoteEvent],
    output_path: Union[str, Path],
    bpm: int = 100,
    drone_velocity: int = 65,
) -> Path:
    """Create a standard MIDI file playing continuous drones and the quantized melody."""
    mid = MidiFile()
    track = MidiTrack()
    mid.tracks.append(track)

    ticks_per_beat = mid.ticks_per_beat  # Default 480
    tempo_us = mido.bpm2tempo(bpm)

    # Set tempo and MIDI program (73 = General MIDI Flute)
    track.append(MetaMessage('set_tempo', tempo=tempo_us, time=0))
    track.append(Message('program_change', program=73, time=0))

    drone1_midi = int(round(dims.root_midi + dims.scale_intervals[0]))  # root
    drone2_offset = int(round(69 + 12 * math.log2(dims.drone2_frequency / 440.0)))

    # Start drone notes at time=0
    track.append(Message('note_on', note=drone1_midi, velocity=drone_velocity, time=0))
    track.append(Message('note_on', note=drone2_offset, velocity=drone_velocity, time=0))

    pending_delta = 0

    for event in melody_events:
        duration_ticks = int(round(event.duration_beats * ticks_per_beat))

        if event.midi_note is None:
            # Rest: accumulate delta time
            pending_delta += duration_ticks
        else:
            # Note On
            track.append(
                Message(
                    'note_on',
                    note=event.midi_note,
                    velocity=event.velocity,
                    time=pending_delta,
                )
            )
            # Note Off after duration
            track.append(
                Message(
                    'note_off',
                    note=event.midi_note,
                    velocity=event.velocity,
                    time=duration_ticks,
                )
            )
            pending_delta = 0

    # Stop drones at the end of the sequence
    track.append(Message('note_off', note=drone1_midi, velocity=drone_velocity, time=pending_delta))
    track.append(Message('note_off', note=drone2_offset, velocity=drone_velocity, time=0))

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    mid.save(str(out_file))
    return out_file


def render_soundfont_wav(
    midi_path: Union[str, Path],
    sf2_path: Union[str, Path],
    wav_path: Union[str, Path],
) -> bool:
    """Render a MIDI file to WAV using FluidSynth and a SoundFont (.sf2)."""
    fluidsynth_bin = shutil.which("fluidsynth")
    if not fluidsynth_bin:
        return False

    try:
        fs = FluidSynth(sound_font=str(sf2_path))
        fs.midi_to_audio(str(midi_path), str(wav_path))
        return True
    except Exception:
        return False


def synthesize_fallback_wav(
    dims: FluteDimensions,
    melody_events: List[NoteEvent],
    wav_path: Union[str, Path],
    sample_rate: int = 44100,
    bpm: int = 100,
) -> Path:
    """Pure-Python harmonic synthesizer with ADSR envelopes as a fallback when FluidSynth is unavailable."""
    seconds_per_beat = 60.0 / bpm

    # Compute total duration in seconds
    total_beats = sum(e.duration_beats for e in melody_events)
    total_duration = total_beats * seconds_per_beat + 1.0  # +1s release tail
    total_samples = int(total_duration * sample_rate)

    drone1_f = dims.drone1_frequency
    drone2_f = dims.drone2_frequency

    frames = []

    def flute_oscillator(freq: float, t: float) -> float:
        """Flute harmonic timbre: strong fundamental, weak 2nd, gentle 3rd harmonic."""
        if freq <= 0:
            return 0.0
        return (
            1.0 * math.sin(2 * math.pi * freq * t)
            + 0.25 * math.sin(2 * math.pi * 2 * freq * t)
            + 0.10 * math.sin(2 * math.pi * 3 * freq * t)
        )

    # Build note time intervals for melody
    note_intervals: List[Tuple[float, float, Optional[float], float]] = []
    curr_time = 0.0
    for e in melody_events:
        dur = e.duration_beats * seconds_per_beat
        note_f = midi_to_freq(e.midi_note) if e.midi_note is not None else None
        note_intervals.append((curr_time, curr_time + dur, note_f, e.velocity / 127.0))
        curr_time += dur

    for i in range(total_samples):
        t = float(i) / sample_rate

        # Drones
        drone_env = min(1.0, t * 5.0, max(0.0, (total_duration - t) * 3.0))
        d1 = flute_oscillator(drone1_f, t) * 0.25 * drone_env
        d2 = flute_oscillator(drone2_f, t) * 0.25 * drone_env

        # Melody
        melody_sample = 0.0
        for start_t, end_t, note_f, vel in note_intervals:
            if start_t <= t < end_t and note_f is not None:
                note_elapsed = t - start_t
                note_dur = end_t - start_t
                # Note ADSR envelope
                attack = min(1.0, note_elapsed / 0.04)
                release = min(1.0, (note_dur - note_elapsed) / 0.03)
                env = attack * release * vel
                melody_sample = flute_oscillator(note_f, note_elapsed) * 0.40 * env
                break

        mixed = d1 + d2 + melody_sample
        # Clamp sample to prevent clipping
        clamped = max(-1.0, min(1.0, mixed))
        packed = struct.pack('<h', int(clamped * 32767.0))
        frames.append(packed)

    out_wav = Path(wav_path)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(b''.join(frames))

    return out_wav
