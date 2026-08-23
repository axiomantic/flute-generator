"""Expressive audio synthesis and MIDI preview generator with SoundFont capabilities."""

import math
from pathlib import Path
import random
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

    # Search current working directory and parent directory
    search_dirs = [Path.cwd(), Path(__file__).resolve().parent.parent.parent]
    for d in search_dirs:
        for candidate in DEFAULT_SF2_CANDIDATES:
            p = d / candidate
            if p.is_file():
                return p.resolve()

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
    bpm: int = 96,
    drone_velocity: int = 68,
) -> Path:
    """Create an expressive multi-channel MIDI sequence utilizing CC11 breath swells, CC1 delayed vibrato, pitch scoops, and stereo panning."""
    mid = MidiFile(type=1)  # Synchronous multitrack MIDI
    ticks_per_beat = mid.ticks_per_beat  # 480
    tempo_us = mido.bpm2tempo(bpm)

    # -------------------------------------------------------------
    # Track 0: Conductor / Tempo Track
    # -------------------------------------------------------------
    conductor_track = MidiTrack()
    mid.tracks.append(conductor_track)
    conductor_track.append(MetaMessage('set_tempo', tempo=tempo_us, time=0))
    conductor_track.append(MetaMessage('track_name', name='Conductor', time=0))

    # -------------------------------------------------------------
    # Track 1: Expressive Solo Flute (Channel 0)
    # -------------------------------------------------------------
    melody_track = MidiTrack()
    mid.tracks.append(melody_track)
    melody_track.append(MetaMessage('track_name', name='Flute Melody', time=0))

    chan_m = 0
    melody_track.append(Message('program_change', channel=chan_m, program=73, time=0))
    melody_track.append(Message('control_change', channel=chan_m, control=10, value=64, time=0))  # Center Pan
    melody_track.append(Message('control_change', channel=chan_m, control=91, value=75, time=0))  # Reverb send
    melody_track.append(Message('control_change', channel=chan_m, control=11, value=90, time=0))  # Expression
    melody_track.append(Message('control_change', channel=chan_m, control=1, value=0, time=0))    # Vibrato 0

    pending_delta = 0

    for event in melody_events:
        duration_ticks = int(round(event.duration_beats * ticks_per_beat))

        if event.midi_note is None:
            # Musical breath pause
            pending_delta += duration_ticks
            continue

        note = event.midi_note
        vel = event.velocity

        # Handle ornamentations
        if event.ornament == "grace_dip" and note > 2:
            grace_note = note - 2
            grace_dur = min(40, duration_ticks // 4)
            melody_track.append(Message('note_on', channel=chan_m, note=grace_note, velocity=max(45, vel - 15), time=pending_delta))
            melody_track.append(Message('note_off', channel=chan_m, note=grace_note, velocity=vel, time=grace_dur))
            duration_ticks = max(10, duration_ticks - grace_dur)
            pending_delta = 0
        elif event.ornament == "grace_lift" and note < 125:
            grace_note = note + 2
            grace_dur = min(40, duration_ticks // 4)
            melody_track.append(Message('note_on', channel=chan_m, note=grace_note, velocity=max(45, vel - 15), time=pending_delta))
            melody_track.append(Message('note_off', channel=chan_m, note=grace_note, velocity=vel, time=grace_dur))
            duration_ticks = max(10, duration_ticks - grace_dur)
            pending_delta = 0
        elif event.ornament == "scoop":
            # Pitch bend scoop: start -1200 units (~1 semitone down) and glide up
            melody_track.append(Message('pitchwheel', channel=chan_m, pitch=-1500, time=pending_delta))
            pending_delta = 0

        # Note On
        melody_track.append(Message('note_on', channel=chan_m, note=note, velocity=vel, time=pending_delta))
        pending_delta = 0

        # If sustained note (> 1 beat), introduce expressive breath swells (CC11) and delayed vibrato (CC1)
        if duration_ticks >= ticks_per_beat:
            step1 = duration_ticks // 3
            step2 = duration_ticks // 3
            step3 = duration_ticks - (step1 + step2)

            # Pitch scoop recovery
            if event.ornament == "scoop":
                melody_track.append(Message('pitchwheel', channel=chan_m, pitch=0, time=step1 // 2))
                melody_track.append(Message('control_change', channel=chan_m, control=11, value=min(120, int(vel * 1.15)), time=step1 - (step1 // 2)))
            else:
                # Breath swell
                melody_track.append(Message('control_change', channel=chan_m, control=11, value=min(120, int(vel * 1.15)), time=step1))

            # Delayed vibrato bloom
            vib_val = int(event.vibrato_depth * 65)
            melody_track.append(Message('control_change', channel=chan_m, control=1, value=vib_val, time=step2))

            # Soft release taper
            melody_track.append(Message('control_change', channel=chan_m, control=11, value=max(50, int(vel * 0.75)), time=step3))
            melody_track.append(Message('note_off', channel=chan_m, note=note, velocity=vel, time=0))
            melody_track.append(Message('control_change', channel=chan_m, control=1, value=0, time=0))
            melody_track.append(Message('pitchwheel', channel=chan_m, pitch=0, time=0))
        else:
            if event.ornament == "scoop":
                half_t = duration_ticks // 2
                melody_track.append(Message('pitchwheel', channel=chan_m, pitch=0, time=half_t))
                melody_track.append(Message('note_off', channel=chan_m, note=note, velocity=vel, time=duration_ticks - half_t))
            else:
                melody_track.append(Message('note_off', channel=chan_m, note=note, velocity=vel, time=duration_ticks))

    # -------------------------------------------------------------
    # Track 2: Drone 1 - Root Resonator (Channel 1)
    # -------------------------------------------------------------
    drone1_track = MidiTrack()
    mid.tracks.append(drone1_track)
    drone1_track.append(MetaMessage('track_name', name='Drone 1 (Root)', time=0))

    chan_d1 = 1
    drone1_track.append(Message('program_change', channel=chan_d1, program=73, time=0))
    drone1_track.append(Message('control_change', channel=chan_d1, control=10, value=38, time=0))  # Left pan
    drone1_track.append(Message('control_change', channel=chan_d1, control=91, value=85, time=0))  # Deep Reverb
    drone1_track.append(Message('control_change', channel=chan_d1, control=11, value=75, time=0))

    drone1_midi = int(round(dims.root_midi + dims.scale_intervals[0]))
    total_piece_ticks = sum(int(round(e.duration_beats * ticks_per_beat)) for e in melody_events)

    drone1_track.append(Message('note_on', channel=chan_d1, note=drone1_midi, velocity=drone_velocity, time=0))

    # Undulating subtle breath wave on drone
    num_cycles = max(1, int(total_piece_ticks / (ticks_per_beat * 2)))
    cycle_ticks = total_piece_ticks // (num_cycles * 2) if num_cycles > 0 else total_piece_ticks
    curr_drone1_ticks = 0
    for _ in range(num_cycles):
        if curr_drone1_ticks + cycle_ticks * 2 <= total_piece_ticks:
            drone1_track.append(Message('control_change', channel=chan_d1, control=11, value=82, time=cycle_ticks))
            drone1_track.append(Message('control_change', channel=chan_d1, control=11, value=68, time=cycle_ticks))
            curr_drone1_ticks += cycle_ticks * 2

    remaining_d1 = max(0, total_piece_ticks - curr_drone1_ticks)
    drone1_track.append(Message('note_off', channel=chan_d1, note=drone1_midi, velocity=drone_velocity, time=remaining_d1))

    # -------------------------------------------------------------
    # Track 3: Drone 2 - Fifth / Harmonic Resonator (Channel 2)
    # -------------------------------------------------------------
    drone2_track = MidiTrack()
    mid.tracks.append(drone2_track)
    drone2_track.append(MetaMessage('track_name', name='Drone 2 (Harmonic)', time=0))

    chan_d2 = 2
    drone2_track.append(Message('program_change', channel=chan_d2, program=73, time=0))
    drone2_track.append(Message('control_change', channel=chan_d2, control=10, value=90, time=0))  # Right pan
    drone2_track.append(Message('control_change', channel=chan_d2, control=91, value=85, time=0))  # Deep Reverb
    drone2_track.append(Message('control_change', channel=chan_d2, control=11, value=65, time=0))

    drone2_midi = int(round(69 + 12 * math.log2(dims.drone2_frequency / 440.0)))
    drone2_track.append(Message('note_on', channel=chan_d2, note=drone2_midi, velocity=max(45, drone_velocity - 6), time=0))

    curr_drone2_ticks = 0
    for _ in range(num_cycles):
        if curr_drone2_ticks + cycle_ticks * 2 <= total_piece_ticks:
            drone2_track.append(Message('control_change', channel=chan_d2, control=11, value=62, time=cycle_ticks))
            drone2_track.append(Message('control_change', channel=chan_d2, control=76, time=cycle_ticks))
            curr_drone2_ticks += cycle_ticks * 2

    remaining_d2 = max(0, total_piece_ticks - curr_drone2_ticks)
    drone2_track.append(Message('note_off', channel=chan_d2, note=drone2_midi, velocity=drone_velocity, time=remaining_d2))

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    mid.save(str(out_file))
    return out_file


def render_soundfont_wav(
    midi_path: Union[str, Path],
    sf2_path: Union[str, Path],
    wav_path: Union[str, Path],
) -> bool:
    """Render a multi-track MIDI file to WAV using FluidSynth and a SoundFont (.sf2)."""
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
    bpm: int = 96,
) -> Path:
    """Rich stereo harmonic audio synthesizer with breath chuff noise, delayed LFO vibrato, and dynamic envelopes."""
    seconds_per_beat = 60.0 / bpm
    total_beats = sum(e.duration_beats for e in melody_events)
    total_duration = total_beats * seconds_per_beat + 1.2
    total_samples = int(total_duration * sample_rate)

    drone1_f = dims.drone1_frequency
    drone2_f = dims.drone2_frequency

    # Parse note intervals
    note_intervals: List[Tuple[float, float, Optional[float], float, str]] = []
    curr_time = 0.0
    for e in melody_events:
        dur = e.duration_beats * seconds_per_beat
        note_f = midi_to_freq(e.midi_note) if e.midi_note is not None else None
        ornament = e.ornament or "normal"
        note_intervals.append((curr_time, curr_time + dur, note_f, e.velocity / 127.0, ornament))
        curr_time += dur

    rng = random.Random(42)

    frames = []

    for i in range(total_samples):
        t = float(i) / sample_rate

        # 1. Drones (Stereo Panned with slow breath movement)
        drone_swell1 = 0.5 + 0.15 * math.sin(2 * math.pi * 0.25 * t)
        drone_swell2 = 0.5 + 0.15 * math.sin(2 * math.pi * 0.25 * t + math.pi / 2)
        drone_global_env = min(1.0, t * 4.0, max(0.0, (total_duration - t) * 2.5))

        d1 = (
            math.sin(2 * math.pi * drone1_f * t)
            + 0.22 * math.sin(2 * math.pi * 2 * drone1_f * t)
            + 0.08 * math.sin(2 * math.pi * 3 * drone1_f * t)
        ) * 0.18 * drone_swell1 * drone_global_env

        d2 = (
            math.sin(2 * math.pi * drone2_f * t)
            + 0.18 * math.sin(2 * math.pi * 2 * drone2_f * t)
            + 0.06 * math.sin(2 * math.pi * 3 * drone2_f * t)
        ) * 0.15 * drone_swell2 * drone_global_env

        # 2. Solo Flute Melody (with pitch scoop, delayed vibrato & breath noise)
        melody_sample = 0.0
        for start_t, end_t, note_f, vel, ornament in note_intervals:
            if start_t <= t < end_t and note_f is not None:
                elapsed = t - start_t
                note_dur = end_t - start_t

                # Delayed vocal vibrato: LFO begins at 0.3s
                vib_amount = min(1.0, max(0.0, (elapsed - 0.28) / 0.45)) * 0.015
                vib_freq = note_f * (1.0 + vib_amount * math.sin(2 * math.pi * 5.6 * elapsed))

                # Pitch scoop on attack
                if ornament == "scoop" and elapsed < 0.10:
                    scoop_ratio = 1.0 - (0.06 * (1.0 - (elapsed / 0.10)))
                    vib_freq *= scoop_ratio

                # ADSR Envelope with breath swell
                attack = min(1.0, elapsed / 0.045)
                release = min(1.0, (note_dur - elapsed) / 0.04)
                swell = 1.0 + 0.15 * math.sin(math.pi * (elapsed / max(0.01, note_dur)))
                env = attack * release * swell * vel

                # Flute body resonance + breath turbulence
                harmonic_1 = math.sin(2 * math.pi * vib_freq * elapsed)
                harmonic_2 = 0.28 * math.sin(2 * math.pi * 2 * vib_freq * elapsed)
                harmonic_3 = 0.10 * math.sin(2 * math.pi * 3 * vib_freq * elapsed)

                # Breath turbulence noise (fipple air whisper)
                air_chuff = (rng.random() * 2.0 - 1.0) * 0.035 * math.exp(-elapsed * 12.0)

                flute_voice = (harmonic_1 + harmonic_2 + harmonic_3 + air_chuff) * 0.38 * env
                melody_sample = flute_voice
                break

        # Stereo mixing (16-bit stereo PCM)
        # Left channel: Drone 1 (70%) + Drone 2 (30%) + Melody (50%)
        left_mix = d1 * 0.70 + d2 * 0.30 + melody_sample * 0.50
        # Right channel: Drone 1 (30%) + Drone 2 (70%) + Melody (50%)
        right_mix = d1 * 0.30 + d2 * 0.70 + melody_sample * 0.50

        left_clamped = max(-1.0, min(1.0, left_mix))
        right_clamped = max(-1.0, min(1.0, right_mix))

        left_i = int(left_clamped * 32767.0)
        right_i = int(right_clamped * 32767.0)

        frames.append(struct.pack('<hh', left_i, right_i))

    out_wav = Path(wav_path)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav), 'wb') as w:
        w.setnchannels(2)  # Stereo
        w.setsampwidth(2)  # 16-bit
        w.setframerate(sample_rate)
        w.writeframes(b''.join(frames))

    return out_wav
