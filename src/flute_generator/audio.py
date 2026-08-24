"""Expressive audio synthesis and MIDI preview generator with SoundFont capabilities."""

import math
from pathlib import Path
import random
import shutil
import struct
import subprocess
from typing import List, Optional, Tuple, Union
import wave

import mido
from mido import Message, MetaMessage, MidiFile, MidiTrack

from .acoustics import FluteDimensions, midi_to_freq
from .melodies import NoteEvent

SOUNDFONT_DOWNLOAD_URL = "https://www.polyphone.io/en/soundfonts/flutes/214-ixox-flute-full-v0-2"
DEFAULT_SF2_CANDIDATES = [
    "ixox_flute.sf2",
    "ixox-flute.sf2",
    "Ixox Flute.sf2",
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
    """Return instructions on where to obtain the ixox_flute SoundFont."""
    return (
        f"SoundFont not found!\n"
        f"To enable high-quality SoundFont rendering:\n"
        f"  1. Download the public domain 'ixox_flute.sf2' (Ixox Flute Full v0.2) from:\n"
        f"     {SOUNDFONT_DOWNLOAD_URL}\n"
        f"  2. Place 'ixox_flute.sf2' in your project root, or pass `--soundfont <path>`."
    )


def create_flute_midi(
    dims: FluteDimensions,
    melody_events: List[NoteEvent],
    output_path: Union[str, Path],
    bpm: int = 96,
    drone_velocity: int = 68,
) -> Path:
    """Create a multi-instrument MIDI sequence where each tube is an independent monophonic voice with trail-off decay."""
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
    # Track 1: Solo Melody Tube (Channel 0 - Monophonic Exclusive Cut)
    # -------------------------------------------------------------
    melody_track = MidiTrack()
    mid.tracks.append(melody_track)
    melody_track.append(MetaMessage('track_name', name='Melody Tube (Mono Cut)', time=0))

    chan_m = 0
    melody_track.append(Message('program_change', channel=chan_m, program=0, time=0))
    melody_track.append(Message('control_change', channel=chan_m, control=126, value=1, time=0)) # Mono Mode On (Exclusive Voice Cut)
    melody_track.append(Message('control_change', channel=chan_m, control=10, value=64, time=0))   # Center Pan
    melody_track.append(Message('control_change', channel=chan_m, control=91, value=65, time=0))   # Natural Reverb
    melody_track.append(Message('control_change', channel=chan_m, control=11, value=90, time=0))   # Steady Expression
    melody_track.append(Message('control_change', channel=chan_m, control=1, value=0, time=0))     # Vibrato 0

    pending_delta = 0

    for idx, event in enumerate(melody_events):
        duration_ticks = int(round(event.duration_beats * ticks_per_beat))

        if event.midi_note is None:
            # Musical breath pause
            pending_delta += duration_ticks
            continue

        note = event.midi_note
        vel = event.velocity
        is_last_note = (idx == len(melody_events) - 1)
        next_is_rest = (idx < len(melody_events) - 1 and melody_events[idx + 1].midi_note is None)

        # Subtle grace note on designated ornaments (gentle flick)
        if event.ornament == "grace_dip" and note > 2:
            grace_note = note - 2
            grace_dur = min(28, duration_ticks // 5)
            melody_track.append(Message('note_on', channel=chan_m, note=grace_note, velocity=max(45, vel - 12), time=pending_delta))
            melody_track.append(Message('note_off', channel=chan_m, note=grace_note, velocity=vel, time=grace_dur))
            duration_ticks = max(10, duration_ticks - grace_dur)
            pending_delta = 0
        elif event.ornament == "grace_lift" and note < 125:
            grace_note = note + 2
            grace_dur = min(28, duration_ticks // 5)
            melody_track.append(Message('note_on', channel=chan_m, note=grace_note, velocity=max(45, vel - 12), time=pending_delta))
            melody_track.append(Message('note_off', channel=chan_m, note=grace_note, velocity=vel, time=grace_dur))
            duration_ticks = max(10, duration_ticks - grace_dur)
            pending_delta = 0

        # Note On (resets previous note instantly on monophonic channel)
        melody_track.append(Message('note_on', channel=chan_m, note=note, velocity=vel, time=pending_delta))
        pending_delta = 0

        # If sustained note (> 1.2 beats) or phrase ending: trail off with subtle vibrato and breath decay
        if duration_ticks >= int(1.2 * ticks_per_beat) or is_last_note or next_is_rest:
            t_core = int(duration_ticks * 0.55)
            t_tail = duration_ticks - t_core
            t_decay = t_tail // 2
            t_end = t_tail - t_decay

            # 1. Held core note
            # 2. Vibrato blossoms on the tail
            vib_val = int(max(0.3, event.vibrato_depth) * 35)
            melody_track.append(Message('control_change', channel=chan_m, control=1, value=vib_val, time=t_core))

            # 3. Breath volume gently decays
            melody_track.append(Message('control_change', channel=chan_m, control=11, value=72, time=t_decay))

            # 4. Note release & reset controllers
            melody_track.append(Message('note_off', channel=chan_m, note=note, velocity=vel, time=t_end))
            melody_track.append(Message('control_change', channel=chan_m, control=11, value=90, time=0))
            melody_track.append(Message('control_change', channel=chan_m, control=1, value=0, time=0))
        else:
            # Immediate legato cut to next note
            melody_track.append(Message('note_off', channel=chan_m, note=note, velocity=vel, time=duration_ticks))

    # -------------------------------------------------------------
    # Track 2: Drone 1 Tube - Root Resonator (Channel 1 - Continuous Pedal)
    # -------------------------------------------------------------
    drone1_track = MidiTrack()
    mid.tracks.append(drone1_track)
    drone1_track.append(MetaMessage('track_name', name='Drone 1 Tube (Root)', time=0))

    chan_d1 = 1
    drone1_track.append(Message('program_change', channel=chan_d1, program=0, time=0))
    drone1_track.append(Message('control_change', channel=chan_d1, control=126, value=1, time=0)) # Mono Mode
    drone1_track.append(Message('control_change', channel=chan_d1, control=10, value=38, time=0))   # Left pan
    drone1_track.append(Message('control_change', channel=chan_d1, control=91, value=75, time=0))   # Reverb
    drone1_track.append(Message('control_change', channel=chan_d1, control=11, value=82, time=0))

    drone1_midi = int(round(dims.root_midi + dims.scale_intervals[0]))
    total_piece_ticks = sum(int(round(e.duration_beats * ticks_per_beat)) for e in melody_events)

    # Re-sound drone notes in smooth 2-beat legato pedal waves so SoundFont sample never expires
    drone_step_ticks = int(2.0 * ticks_per_beat) # 2 beats per pedal breath
    curr_ticks = 0
    while curr_ticks < total_piece_ticks:
        dur = min(drone_step_ticks, total_piece_ticks - curr_ticks)
        drone1_track.append(Message('note_on', channel=chan_d1, note=drone1_midi, velocity=max(60, drone_velocity + 6), time=0))
        drone1_track.append(Message('note_off', channel=chan_d1, note=drone1_midi, velocity=drone_velocity, time=dur))
        curr_ticks += dur

    # -------------------------------------------------------------
    # Track 3: Drone 2 Tube - Harmonic Resonator (Channel 2 - Continuous Pedal)
    # -------------------------------------------------------------
    drone2_track = MidiTrack()
    mid.tracks.append(drone2_track)
    drone2_track.append(MetaMessage('track_name', name='Drone 2 Tube (Harmonic)', time=0))

    chan_d2 = 2
    drone2_track.append(Message('program_change', channel=chan_d2, program=0, time=0))
    drone2_track.append(Message('control_change', channel=chan_d2, control=126, value=1, time=0)) # Mono Mode
    drone2_track.append(Message('control_change', channel=chan_d2, control=10, value=90, time=0))   # Right pan
    drone2_track.append(Message('control_change', channel=chan_d2, control=91, value=75, time=0))   # Reverb
    drone2_track.append(Message('control_change', channel=chan_d2, control=11, value=76, time=0))

    drone2_midi = int(round(69 + 12 * math.log2(dims.drone2_frequency / 440.0)))
    curr_ticks = 0
    # Stagger drone 2 slightly (offset by 1 beat) for rich natural antiphony
    offset_d2 = min(ticks_per_beat, total_piece_ticks)
    drone2_track.append(Message('note_on', channel=chan_d2, note=drone2_midi, velocity=max(55, drone_velocity), time=0))
    drone2_track.append(Message('note_off', channel=chan_d2, note=drone2_midi, velocity=drone_velocity, time=offset_d2))
    curr_ticks += offset_d2

    while curr_ticks < total_piece_ticks:
        dur = min(drone_step_ticks, total_piece_ticks - curr_ticks)
        drone2_track.append(Message('note_on', channel=chan_d2, note=drone2_midi, velocity=max(55, drone_velocity), time=0))
        drone2_track.append(Message('note_off', channel=chan_d2, note=drone2_midi, velocity=drone_velocity, time=dur))
        curr_ticks += dur

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    mid.save(str(out_file))
    return out_file


def render_soundfont_wav(
    midi_path: Union[str, Path],
    sf2_path: Union[str, Path],
    wav_path: Union[str, Path],
    sample_rate: int = 44100,
) -> bool:
    """Render a multi-track MIDI file to WAV using FluidSynth with correct CLI argument ordering."""
    fluidsynth_bin = shutil.which("fluidsynth")
    if not fluidsynth_bin:
        return False

    out_file = Path(wav_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    # Modern FluidSynth requires options (-F, -r, -g) to precede positional soundfont/midi paths.
    cmd = [
        fluidsynth_bin,
        "-ni",                  # Non-interactive, no shell
        "-q",                   # Quiet mode
        "-g", "1.1",            # Gain
        "-r", str(sample_rate), # Sample rate
        "-F", str(out_file),    # Output audio file (must be before positional args)
        str(sf2_path),          # Soundfont file (.sf2)
        str(midi_path),         # MIDI input file (.mid)
    ]

    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        return res.returncode == 0 and out_file.is_file() and out_file.stat().st_size > 0
    except Exception:
        return False


def synthesize_fallback_wav(
    dims: FluteDimensions,
    melody_events: List[NoteEvent],
    wav_path: Union[str, Path],
    sample_rate: int = 44100,
    bpm: int = 96,
) -> Path:
    """Natural, smooth stereo synthesizer modeling 3 distinct monophonic physical acoustic tubes with vibrato decay tails."""
    seconds_per_beat = 60.0 / bpm
    total_beats = sum(e.duration_beats for e in melody_events)
    total_duration = total_beats * seconds_per_beat + 0.8
    total_samples = int(total_duration * sample_rate)

    drone1_f = dims.drone1_frequency
    drone2_f = dims.drone2_frequency

    # Parse note intervals for the monophonic melody tube
    note_intervals: List[Tuple[float, float, Optional[float], float, Optional[str]]] = []
    curr_time = 0.0
    for e in melody_events:
        dur = e.duration_beats * seconds_per_beat
        note_f = midi_to_freq(e.midi_note) if e.midi_note is not None else None
        note_intervals.append((curr_time, curr_time + dur, note_f, e.velocity / 127.0, e.ornament))
        curr_time += dur

    rng = random.Random(42)
    frames = []

    # 3 Separate physical monophonic tube phase accumulators
    drone1_phase = 0.0
    drone2_phase = 0.0
    melody_phase = 0.0

    two_pi = 2.0 * math.pi
    dt = 1.0 / sample_rate

    # Monophonic melody tube state
    current_melody_f = 440.0

    for i in range(total_samples):
        t = float(i) * dt

        # Global phrase breath arc
        phrase_breath = 0.85 + 0.15 * math.sin(two_pi * 0.16 * t)
        global_env = min(1.0, t * 2.5, max(0.0, (total_duration - t) * 2.0))

        # ---------------------------------------------------------
        # Tube 2: Drone 1 Resonator (Monophonic continuous tube)
        # ---------------------------------------------------------
        drone1_phase += two_pi * drone1_f * dt
        d1 = (
            math.sin(drone1_phase)
            + 0.18 * math.sin(2.0 * drone1_phase)
            + 0.05 * math.sin(3.0 * drone1_phase)
        ) * 0.16 * phrase_breath * global_env

        # ---------------------------------------------------------
        # Tube 3: Drone 2 Resonator (Monophonic continuous tube)
        # ---------------------------------------------------------
        drone2_phase += two_pi * drone2_f * dt
        d2 = (
            math.sin(drone2_phase)
            + 0.14 * math.sin(2.0 * drone2_phase)
            + 0.04 * math.sin(3.0 * drone2_phase)
        ) * 0.13 * phrase_breath * global_env

        # ---------------------------------------------------------
        # Tube 1: Melody Tube (Strictly Monophonic Exclusive Cut)
        # ---------------------------------------------------------
        melody_sample = 0.0
        active_note = None

        for start_t, end_t, note_f, vel, ornament in note_intervals:
            if start_t <= t < end_t:
                active_note = (start_t, end_t, note_f, vel, ornament)
                break

        if active_note and active_note[2] is not None:
            start_t, end_t, target_f, vel, ornament = active_note
            elapsed = t - start_t
            note_dur = end_t - start_t

            # Smooth single-column pitch glissando on note switch (4ms portamento cut)
            if elapsed < 0.005:
                current_melody_f += (target_f - current_melody_f) * (dt / 0.002)
            else:
                current_melody_f = target_f

            # Trail off with slight vibrato and decay on held notes / endings
            is_held = (note_dur >= 0.70)
            if is_held and elapsed > note_dur * 0.50:
                # Vibrato develops and blooms on the tail
                vib_progress = (elapsed - note_dur * 0.50) / (note_dur * 0.50)
                vib_amount = vib_progress * 0.0035
                f_inst = current_melody_f * (1.0 + vib_amount * math.sin(two_pi * 5.2 * elapsed))
                # Slight breath decay at the tail
                tail_decay = 1.0 - (0.25 * vib_progress)
            else:
                f_inst = current_melody_f
                tail_decay = 1.0

            melody_phase += two_pi * f_inst * dt

            # Fast attack (4ms) and legato release (4ms)
            attack = min(1.0, elapsed / 0.004)
            release = min(1.0, (note_dur - elapsed) / 0.004)
            env = attack * release * vel * phrase_breath * tail_decay

            h1 = math.sin(melody_phase)
            h2 = 0.22 * math.sin(2.0 * melody_phase)
            h3 = 0.06 * math.sin(3.0 * melody_phase)
            air_chuff = (rng.random() * 2.0 - 1.0) * 0.012 * math.exp(-elapsed * 30.0)

            melody_sample = (h1 + h2 + h3 + air_chuff) * 0.40 * env

        # Stereo mixing across the 3 physical pipes
        left_mix = d1 * 0.70 + d2 * 0.30 + melody_sample * 0.50
        right_mix = d1 * 0.30 + d2 * 0.70 + melody_sample * 0.50

        left_clamped = max(-1.0, min(1.0, left_mix))
        right_clamped = max(-1.0, min(1.0, right_mix))

        frames.append(struct.pack('<hh', int(left_clamped * 32767.0), int(right_clamped * 32767.0)))

    out_wav = Path(wav_path)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav), 'wb') as w:
        w.setnchannels(2)  # Stereo
        w.setsampwidth(2)  # 16-bit
        w.setframerate(sample_rate)
        w.writeframes(b''.join(frames))

    return out_wav
