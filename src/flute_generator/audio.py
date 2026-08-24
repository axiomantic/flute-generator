"""Digital waveguide physical modeling acoustic synthesizer and multitrack MIDI generator."""

import math
from pathlib import Path
import random
import struct
from typing import List, Optional, Tuple, Union
import wave

import mido
from mido import Message, MetaMessage, MidiFile, MidiTrack

from .acoustics import FluteDimensions, midi_to_freq
from .melodies import NoteEvent


class DelayLine:
    """Circular buffer delay line with fractional linear interpolation."""
    __slots__ = ('buffer', 'max_length', 'write_ptr')

    def __init__(self, max_length: int):
        self.buffer = [0.0] * max_length
        self.max_length = max_length
        self.write_ptr = 0

    def write(self, sample: float):
        self.buffer[self.write_ptr] = sample
        self.write_ptr = (self.write_ptr + 1) % self.max_length

    def read_fractional(self, delay: float) -> float:
        delay = max(1.0, min(self.max_length - 2.0, delay))
        int_delay = int(delay)
        frac = delay - int_delay
        idx1 = (self.write_ptr - 1 - int_delay) % self.max_length
        idx2 = (idx1 - 1) % self.max_length
        return (1.0 - frac) * self.buffer[idx1] + frac * self.buffer[idx2]


class CombFilter:
    """Lowpass Feedback Comb Filter for algorithmic reverberation."""
    __slots__ = ('delay', 'delay_len', 'filter_store')

    def __init__(self, delay_length: int):
        self.delay = DelayLine(delay_length + 10)
        self.delay_len = delay_length
        self.filter_store = 0.0

    def process(self, input_sample: float, feedback: float, damping: float) -> float:
        out = self.delay.read_fractional(self.delay_len)
        self.filter_store = out * (1.0 - damping) + self.filter_store * damping
        self.delay.write(input_sample + self.filter_store * feedback)
        return out


class AllpassFilter:
    """Diffusing Allpass Filter for stereo reverberation."""
    __slots__ = ('delay', 'delay_len', 'feedback')

    def __init__(self, delay_length: int, feedback: float = 0.5):
        self.delay = DelayLine(delay_length + 10)
        self.delay_len = delay_length
        self.feedback = feedback

    def process(self, input_sample: float) -> float:
        buf_out = self.delay.read_fractional(self.delay_len)
        out = -input_sample + buf_out
        self.delay.write(input_sample + buf_out * self.feedback)
        return out


class StereoFreeverb:
    """Stereo Freeverb algorithmic reverberator with controllable room parameters."""
    def __init__(self, sample_rate: int = 44100):
        comb_tunings_l = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
        comb_tunings_r = [1116 + 23, 1188 + 23, 1277 + 23, 1356 + 23, 1422 + 23, 1491 + 23, 1557 + 23, 1617 + 23]
        allpass_tunings = [556, 441, 341, 225]

        scale = sample_rate / 44100.0
        self.combs_l = [CombFilter(int(t * scale)) for t in comb_tunings_l]
        self.combs_r = [CombFilter(int(t * scale)) for t in comb_tunings_r]
        self.allpass_l = [AllpassFilter(int(t * scale)) for t in allpass_tunings]
        self.allpass_r = [AllpassFilter(int((t + 23) * scale)) for t in allpass_tunings]

    def process(
        self,
        in_l: float,
        in_r: float,
        room_size: float = 0.75,
        damping: float = 0.25,
        wet: float = 0.32,
        dry: float = 0.85,
        width: float = 0.9,
    ) -> Tuple[float, float]:
        feedback = 0.65 + max(0.0, min(1.0, room_size)) * 0.25
        damp = max(0.0, min(1.0, damping))
        in_mono = (in_l + in_r) * 0.012

        out_l = sum(c.process(in_mono, feedback, damp) for c in self.combs_l)
        out_r = sum(c.process(in_mono, feedback, damp) for c in self.combs_r)

        for ap in self.allpass_l:
            out_l = ap.process(out_l)
        for ap in self.allpass_r:
            out_r = ap.process(out_r)

        wet_1 = wet * (width / 2.0 + 0.5)
        wet_2 = wet * ((1.0 - width) / 2.0)

        out_final_l = in_l * dry + out_l * wet_1 + out_r * wet_2
        out_final_r = in_r * dry + out_r * wet_1 + out_l * wet_2
        return out_final_l, out_final_r


class PhysicalWaveguidePipe:
    """1D Digital Waveguide Acoustic Resonator with nonlinear vortex jet-drive."""
    def __init__(self, sample_rate: int = 44100):
        self.sr = sample_rate
        self.bore_delay = DelayLine(int(sample_rate * 0.1))
        self.jet_delay = DelayLine(int(sample_rate * 0.05))
        self.filter_state = 0.0
        self.dc_x = 0.0
        self.dc_y = 0.0
        self.curr_delay = sample_rate / 440.0
        self.target_delay = self.curr_delay

    def set_frequency(self, freq: float):
        if freq > 20.0:
            self.target_delay = self.sr / freq

    def process(self, breath_pressure: float, noise_gain: float = 0.03, rng: Optional[random.Random] = None) -> float:
        # Smooth portamento between target delays
        self.curr_delay += (self.target_delay - self.curr_delay) * 0.015

        # 1. Breath pressure with aeroacoustic vorticity turbulence
        noise = (rng.random() * 2.0 - 1.0) if rng else 0.0
        p_in = breath_pressure + noise * noise_gain * math.sqrt(max(0.0, breath_pressure))

        # 2. Bore feedback reflection with loss filter
        bore_refl = self.bore_delay.read_fractional(self.curr_delay)
        self.filter_state = self.filter_state * 0.30 + bore_refl * 0.70
        bore_sig = self.filter_state

        # 3. Jet delay (transit time across fipple sound window)
        jet_delay_len = max(2.0, min(self.curr_delay * 0.40, self.curr_delay - 2.0))
        jet_in = p_in + 0.35 * bore_sig
        self.jet_delay.write(jet_in)
        jet_out = self.jet_delay.read_fractional(jet_delay_len)

        # 4. Symmetrical nonlinear vortex saturation at the labium blade
        jet_dc = math.tanh(p_in - p_in**3) if p_in > 0 else 0.0
        vortex_drive = math.tanh(jet_out - jet_out**3) - jet_dc

        # 5. Acoustic injection back into resonator tube with open boundary phase inversion (-1)
        inj = - (vortex_drive * 0.65 + bore_sig * 0.60)
        self.bore_delay.write(inj)

        # 6. DC Blocker
        dc_out = bore_sig - self.dc_x + 0.995 * self.dc_y
        self.dc_x = bore_sig
        self.dc_y = dc_out

        return dc_out * 1.5


def create_flute_midi(
    dims: FluteDimensions,
    melody_events: List[NoteEvent],
    output_path: Union[str, Path],
    bpm: int = 96,
    drone_velocity: int = 66,
) -> Path:
    """Create a multitrack MIDI sequence with 3 independent channels for melody and drone pipes."""
    mid = MidiFile(type=1)
    ticks_per_beat = mid.ticks_per_beat  # 480
    tempo_us = mido.bpm2tempo(bpm)

    # Track 0: Conductor
    conductor_track = MidiTrack()
    mid.tracks.append(conductor_track)
    conductor_track.append(MetaMessage('set_tempo', tempo=tempo_us, time=0))
    conductor_track.append(MetaMessage('track_name', name='Conductor', time=0))

    # Track 1: Melody Pipe (Channel 0)
    melody_track = MidiTrack()
    mid.tracks.append(melody_track)
    melody_track.append(MetaMessage('track_name', name='Melody Pipe', time=0))

    chan_m = 0
    melody_track.append(Message('program_change', channel=chan_m, program=73, time=0))  # Flute
    melody_track.append(Message('control_change', channel=chan_m, control=10, value=64, time=0))  # Center Pan
    melody_track.append(Message('control_change', channel=chan_m, control=91, value=65, time=0))  # Reverb
    melody_track.append(Message('control_change', channel=chan_m, control=11, value=90, time=0))

    pending_delta = 0

    for idx, event in enumerate(melody_events):
        duration_ticks = int(round(event.duration_beats * ticks_per_beat))

        if event.midi_note is None:
            pending_delta += duration_ticks
            continue

        note = event.midi_note
        vel = event.velocity
        is_last_note = (idx == len(melody_events) - 1)
        next_is_rest = (idx < len(melody_events) - 1 and melody_events[idx + 1].midi_note is None)

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

        melody_track.append(Message('note_on', channel=chan_m, note=note, velocity=vel, time=pending_delta))
        pending_delta = 0

        if duration_ticks >= int(1.2 * ticks_per_beat) or is_last_note or next_is_rest:
            t_core = int(duration_ticks * 0.55)
            t_tail = duration_ticks - t_core
            t_decay = t_tail // 2
            t_end = t_tail - t_decay

            vib_val = int(max(0.3, event.vibrato_depth) * 35)
            melody_track.append(Message('control_change', channel=chan_m, control=1, value=vib_val, time=t_core))
            melody_track.append(Message('control_change', channel=chan_m, control=11, value=72, time=t_decay))
            melody_track.append(Message('note_off', channel=chan_m, note=note, velocity=vel, time=t_end))
            melody_track.append(Message('control_change', channel=chan_m, control=11, value=90, time=0))
            melody_track.append(Message('control_change', channel=chan_m, control=1, value=0, time=0))
        else:
            melody_track.append(Message('note_off', channel=chan_m, note=note, velocity=vel, time=duration_ticks))

    # Track 2: Drone 1 Pipe (Channel 1)
    drone1_track = MidiTrack()
    mid.tracks.append(drone1_track)
    drone1_track.append(MetaMessage('track_name', name='Drone 1 (Root)', time=0))

    chan_d1 = 1
    drone1_track.append(Message('program_change', channel=chan_d1, program=73, time=0))
    drone1_track.append(Message('control_change', channel=chan_d1, control=10, value=38, time=0))  # Left pan
    drone1_track.append(Message('control_change', channel=chan_d1, control=91, value=75, time=0))  # Reverb
    drone1_track.append(Message('control_change', channel=chan_d1, control=11, value=76, time=0))

    drone1_midi = int(round(dims.root_midi + dims.scale_intervals[0]))
    total_piece_ticks = sum(int(round(e.duration_beats * ticks_per_beat)) for e in melody_events)

    drone1_track.append(Message('note_on', channel=chan_d1, note=drone1_midi, velocity=drone_velocity, time=0))
    drone1_track.append(Message('note_off', channel=chan_d1, note=drone1_midi, velocity=drone_velocity, time=total_piece_ticks))

    # Track 3: Drone 2 Pipe (Channel 2)
    drone2_track = MidiTrack()
    mid.tracks.append(drone2_track)
    drone2_track.append(MetaMessage('track_name', name='Drone 2 (Harmonic)', time=0))

    chan_d2 = 2
    drone2_track.append(Message('program_change', channel=chan_d2, program=73, time=0))
    drone2_track.append(Message('control_change', channel=chan_d2, control=10, value=90, time=0))  # Right pan
    drone2_track.append(Message('control_change', channel=chan_d2, control=91, value=75, time=0))  # Reverb
    drone2_track.append(Message('control_change', channel=chan_d2, control=11, value=68, time=0))

    drone2_midi = int(round(69 + 12 * math.log2(dims.drone2_frequency / 440.0)))
    drone2_track.append(Message('note_on', channel=chan_d2, note=drone2_midi, velocity=max(45, drone_velocity - 6), time=0))
    drone2_track.append(Message('note_off', channel=chan_d2, note=drone2_midi, velocity=drone_velocity, time=total_piece_ticks))

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    mid.save(str(out_file))
    return out_file


def synthesize_flute_audio(
    dims: FluteDimensions,
    melody_events: List[NoteEvent],
    wav_path: Union[str, Path],
    sample_rate: int = 44100,
    bpm: int = 96,
    room_size: float = 0.75,
    damping: float = 0.25,
    reverb_wet: float = 0.32,
    reverb_dry: float = 0.85,
) -> Path:
    """Synthesize authentic acoustic audio preview using physical waveguide modeling with stereo reverb."""
    seconds_per_beat = 60.0 / bpm
    total_beats = sum(e.duration_beats for e in melody_events)
    total_dur = total_beats * seconds_per_beat + 1.2
    total_samples = int(total_dur * sample_rate)

    melody_pipe = PhysicalWaveguidePipe(sample_rate)
    drone1_pipe = PhysicalWaveguidePipe(sample_rate)
    drone2_pipe = PhysicalWaveguidePipe(sample_rate)

    drone1_pipe.set_frequency(dims.drone1_frequency)
    drone2_pipe.set_frequency(dims.drone2_frequency)

    reverb = StereoFreeverb(sample_rate)
    rng = random.Random(42)

    note_intervals = []
    curr_t = 0.0
    for e in melody_events:
        dur = e.duration_beats * seconds_per_beat
        f = midi_to_freq(e.midi_note) if e.midi_note is not None else None
        note_intervals.append((curr_t, curr_t + dur, f, e.velocity / 127.0, e.vibrato_depth))
        curr_t += dur

    frames = []
    dt = 1.0 / sample_rate

    # Aerodynamic drone pressure scaling based on CAD drone_air_ratio
    drone_p1 = (0.65 + 0.15 * dims.drone_air_ratio)
    drone_p2 = (0.60 + 0.15 * dims.drone_air_ratio)
    noise_drone = 0.045 if dims.windway_texture == "ribbed" else 0.025

    for i in range(total_samples):
        t = float(i) * dt
        active_f = None
        vel = 0.0
        for st, et, nf, v, vd in note_intervals:
            if st <= t < et:
                active_f = nf
                vel = v
                elapsed = t - st
                dur = et - st
                break

        if active_f is not None:
            if dur > 0.6 and elapsed > dur * 0.5:
                vib = 1.0 + 0.0035 * math.sin(2.0 * math.pi * 5.2 * elapsed)
            else:
                vib = 1.0
            melody_pipe.set_frequency(active_f * vib)
            att = min(1.0, elapsed / 0.015)
            rel = min(1.0, (dur - elapsed) / 0.015)
            breath_m = (0.65 + vel * 0.25) * att * rel
        else:
            breath_m = 0.0

        global_env = min(1.0, t * 2.0, max(0.0, (total_dur - t) * 1.5))
        breath_d1 = drone_p1 * global_env
        breath_d2 = drone_p2 * global_env

        s_m = melody_pipe.process(breath_m, noise_gain=0.035, rng=rng)
        s_d1 = drone1_pipe.process(breath_d1, noise_gain=noise_drone, rng=rng)
        s_d2 = drone2_pipe.process(breath_d2, noise_gain=noise_drone, rng=rng)

        dry_l = s_d1 * 0.50 + s_d2 * 0.20 + s_m * 0.65
        dry_r = s_d1 * 0.20 + s_d2 * 0.50 + s_m * 0.65

        out_l, out_r = reverb.process(
            dry_l,
            dry_r,
            room_size=room_size,
            damping=damping,
            wet=reverb_wet,
            dry=reverb_dry,
            width=0.9,
        )

        out_l_c = max(-1.0, min(1.0, out_l))
        out_r_c = max(-1.0, min(1.0, out_r))
        frames.append(struct.pack('<hh', int(out_l_c * 32767.0), int(out_r_c * 32767.0)))

    out_wav = Path(wav_path)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(b''.join(frames))

    return out_wav
