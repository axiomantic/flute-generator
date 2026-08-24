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
        idx1 = (self.write_ptr - 1 - int_delay + self.max_length) % self.max_length
        idx2 = (idx1 - 1 + self.max_length) % self.max_length
        return (1.0 - frac) * self.buffer[idx1] + frac * self.buffer[idx2]


class OnePoleLowpass:
    """1-pole lowpass filter for mode locking and viscous reflection loss."""
    __slots__ = ('alpha', 'state')

    def __init__(self, cutoff_freq: float = 1200.0, sample_rate: int = 44100):
        costh = 2.0 - math.cos(2.0 * math.pi * min(sample_rate * 0.45, cutoff_freq) / sample_rate)
        self.alpha = costh - math.sqrt(max(0.0, costh * costh - 1.0))
        self.state = 0.0

    def set_cutoff(self, cutoff_freq: float, sample_rate: int = 44100):
        costh = 2.0 - math.cos(2.0 * math.pi * min(sample_rate * 0.45, cutoff_freq) / sample_rate)
        self.alpha = costh - math.sqrt(max(0.0, costh * costh - 1.0))

    def tick(self, x: float) -> float:
        self.state = (1.0 - self.alpha) * x + self.alpha * self.state
        return self.state


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
        in_mono = (in_l + in_r) * 0.010

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
    """Multi-mode physical woodwind resonator driven by non-linear labium vortex jet and CAD shape."""
    def __init__(
        self,
        sample_rate: int = 44100,
        bore_diameter: float = 19.0,
        windway_profile: str = "flat",
        windway_texture: str = "smooth",
    ):
        self.sr = sample_rate
        self.bore_diameter = bore_diameter
        self.windway_profile = windway_profile
        self.windway_texture = windway_texture

        # Quality factor Q derived from CAD bore diameter (wider bore = higher Q resonance)
        self.base_q = 26.0 + (bore_diameter / 25.0) * 14.0
        self.tune_ratio = 1.221

        # Resonant standing wave acoustic modes (Fundamental, 2nd overtone, 3rd overtone)
        self.modes = [
            {'freq_mult': self.tune_ratio * 1.0, 'gain': 1.00, 'q': self.base_q, 'y1': 0.0, 'y2': 0.0, 'x1': 0.0, 'x2': 0.0, 'b0': 0.0, 'a1': 0.0, 'a2': 0.0},
            {'freq_mult': self.tune_ratio * 2.0, 'gain': 0.20, 'q': self.base_q * 0.85, 'y1': 0.0, 'y2': 0.0, 'x1': 0.0, 'x2': 0.0, 'b0': 0.0, 'a1': 0.0, 'a2': 0.0},
            {'freq_mult': self.tune_ratio * 3.0, 'gain': 0.05, 'q': self.base_q * 0.70, 'y1': 0.0, 'y2': 0.0, 'x1': 0.0, 'x2': 0.0, 'b0': 0.0, 'a1': 0.0, 'a2': 0.0},
        ]

        # Jet delay line for fipple window transit time
        self.jet_delay = DelayLine(int(sample_rate * 0.05))
        self.noise_state = 0.0
        self.sac_state = 0.0

        self.target_freq = 440.0
        self.curr_freq = 440.0

        self.update_coefficients(440.0)

    def update_coefficients(self, freq: float):
        for m in self.modes:
            f = min(self.sr * 0.45, freq * m['freq_mult'])
            w0 = 2.0 * math.pi * f / self.sr
            q = m['q']
            alpha = math.sin(w0) / (2.0 * q)

            b0 = math.sin(w0) / 2.0
            a0 = 1.0 + alpha
            a1 = -2.0 * math.cos(w0)
            a2 = 1.0 - alpha

            m['b0'] = b0 / a0
            m['a1'] = a1 / a0
            m['a2'] = a2 / a0

    def set_frequency(self, freq: float):
        if freq > 20.0:
            self.target_freq = freq

    def process(self, breath_pressure: float, noise_gain: float = 0.0015, rng: Optional[random.Random] = None) -> float:
        if breath_pressure <= 0.0001:
            return 0.0

        if abs(self.target_freq - self.curr_freq) > 0.1:
            self.curr_freq += (self.target_freq - self.curr_freq) * 0.03
            self.update_coefficients(self.curr_freq)

        # 1. Slow Air Chamber (SAC) compliance smoothing on breath pressure
        if self.windway_profile == "sac":
            self.sac_state = self.sac_state * 0.85 + breath_pressure * 0.15
            eff_breath = self.sac_state
        else:
            eff_breath = breath_pressure

        # 2. Pink breath turbulence (enhanced if micro-ribbed)
        raw_n = (rng.random() * 2.0 - 1.0) if rng else 0.0
        pink_pole = 0.88 if self.windway_texture == "ribbed" else 0.92
        self.noise_state = self.noise_state * pink_pole + raw_n * (1.0 - pink_pole)
        actual_noise = noise_gain * (1.5 if self.windway_texture == "ribbed" else 1.0)
        p_jet = eff_breath + self.noise_state * actual_noise * math.sqrt(eff_breath)

        # 3. Sum of acoustic pressure from resonant body modes
        p_acoustic = sum(m['y1'] * m['gain'] for m in self.modes)

        # 4. Jet transit delay across fipple window
        d_jet = max(2.0, (self.sr / self.curr_freq) * 0.25)
        jet_disp = p_acoustic * 0.65 + self.noise_state * actual_noise * 0.35
        self.jet_delay.write(jet_disp)
        delayed_disp = self.jet_delay.read_fractional(d_jet)

        # 5. Non-linear labium vortex excitation
        jet_gain = 1.6 if self.windway_profile == "arched" else 1.35
        q_vortex = p_jet * math.tanh(delayed_disp * jet_gain + self.noise_state * actual_noise)

        # 6. Excite all resonant pipe modes
        total_out = 0.0
        for m in self.modes:
            y = m['b0'] * (q_vortex - m['x2']) - m['a1'] * m['y1'] - m['a2'] * m['y2']
            m['x2'] = m['x1']
            m['x1'] = q_vortex
            m['y2'] = m['y1']
            m['y1'] = y
            total_out += y * m['gain']

        return total_out * 0.40


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

    conductor_track = MidiTrack()
    mid.tracks.append(conductor_track)
    conductor_track.append(MetaMessage('set_tempo', tempo=tempo_us, time=0))
    conductor_track.append(MetaMessage('track_name', name='Conductor', time=0))

    melody_track = MidiTrack()
    mid.tracks.append(melody_track)
    melody_track.append(MetaMessage('track_name', name='Melody Pipe', time=0))

    chan_m = 0
    melody_track.append(Message('program_change', channel=chan_m, program=73, time=0))
    melody_track.append(Message('control_change', channel=chan_m, control=10, value=64, time=0))
    melody_track.append(Message('control_change', channel=chan_m, control=91, value=65, time=0))
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

    drone1_track = MidiTrack()
    mid.tracks.append(drone1_track)
    drone1_track.append(MetaMessage('track_name', name='Drone 1 (Root)', time=0))

    chan_d1 = 1
    drone1_track.append(Message('program_change', channel=chan_d1, program=73, time=0))
    drone1_track.append(Message('control_change', channel=chan_d1, control=10, value=38, time=0))
    drone1_track.append(Message('control_change', channel=chan_d1, control=91, value=75, time=0))
    drone1_track.append(Message('control_change', channel=chan_d1, control=11, value=76, time=0))

    drone1_midi = int(round(dims.root_midi + dims.scale_intervals[0]))
    total_piece_ticks = sum(int(round(e.duration_beats * ticks_per_beat)) for e in melody_events)

    drone1_track.append(Message('note_on', channel=chan_d1, note=drone1_midi, velocity=drone_velocity, time=0))
    drone1_track.append(Message('note_off', channel=chan_d1, note=drone1_midi, velocity=drone_velocity, time=total_piece_ticks))

    drone2_track = MidiTrack()
    mid.tracks.append(drone2_track)
    drone2_track.append(MetaMessage('track_name', name='Drone 2 (Harmonic)', time=0))

    chan_d2 = 2
    drone2_track.append(Message('program_change', channel=chan_d2, program=73, time=0))
    drone2_track.append(Message('control_change', channel=chan_d2, control=10, value=90, time=0))
    drone2_track.append(Message('control_change', channel=chan_d2, control=91, value=75, time=0))
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
    """Synthesize authentic, pure acoustic audio preview using physical modeling coupled to CAD shape."""
    seconds_per_beat = 60.0 / bpm
    total_beats = sum(e.duration_beats for e in melody_events)
    total_dur = total_beats * seconds_per_beat + 1.2
    total_samples = int(total_dur * sample_rate)

    melody_pipe = PhysicalWaveguidePipe(
        sample_rate,
        bore_diameter=dims.bore_melody,
        windway_profile=dims.windway_profile,
        windway_texture=dims.windway_texture,
    )
    drone1_pipe = PhysicalWaveguidePipe(
        sample_rate,
        bore_diameter=dims.bore_drone1,
        windway_profile=dims.windway_profile,
        windway_texture=dims.windway_texture,
    )
    drone2_pipe = PhysicalWaveguidePipe(
        sample_rate,
        bore_diameter=dims.bore_drone2,
        windway_profile=dims.windway_profile,
        windway_texture=dims.windway_texture,
    )

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

    drone_p1 = (0.55 + 0.15 * dims.drone_air_ratio)
    drone_p2 = (0.50 + 0.15 * dims.drone_air_ratio)
    noise_drone = 0.003 if dims.windway_texture == "ribbed" else 0.0015

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
            if dur > 0.6 and elapsed > dur * 0.45:
                vib = 1.0 + 0.0030 * math.sin(2.0 * math.pi * 5.0 * elapsed)
            else:
                vib = 1.0
            melody_pipe.set_frequency(active_f * vib)
            att = min(1.0, elapsed / 0.04)
            rel = min(1.0, (dur - elapsed) / 0.04)
            breath_m = (0.58 + vel * 0.18) * att * rel
        else:
            breath_m = 0.0

        global_env = min(1.0, t * 2.0, max(0.0, (total_dur - t) * 1.5))
        breath_d1 = drone_p1 * global_env
        breath_d2 = drone_p2 * global_env

        s_m = melody_pipe.process(breath_m, noise_gain=0.0015, rng=rng)
        s_d1 = drone1_pipe.process(breath_d1, noise_gain=noise_drone, rng=rng)
        s_d2 = drone2_pipe.process(breath_d2, noise_gain=noise_drone, rng=rng)

        # Balanced spatial stereo mix
        dry_l = (s_d1 * 0.40 + s_d2 * 0.18 + s_m * 0.62) * 0.70
        dry_r = (s_d1 * 0.18 + s_d2 * 0.40 + s_m * 0.62) * 0.70

        out_l, out_r = reverb.process(
            dry_l,
            dry_r,
            room_size=room_size,
            damping=damping,
            wet=reverb_wet,
            dry=reverb_dry,
            width=0.9,
        )

        out_l_c = math.tanh(out_l * 0.85)
        out_r_c = math.tanh(out_r * 0.85)
        frames.append(struct.pack('<hh', int(out_l_c * 32767.0), int(out_r_c * 32767.0)))

    out_wav = Path(wav_path)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(b''.join(frames))

    return out_wav
