"""Acoustic physics and geometry calculations for multi-drone flutes."""

from dataclasses import dataclass
from typing import List, Sequence

SPEED_OF_SOUND_MM_S = 343200.0  # Speed of sound in dry air at 20°C (mm/s)


@dataclass(frozen=True)
class FluteDimensions:
    """Calculated acoustic dimensions for the flute."""
    root_midi: int
    scale_intervals: List[int]
    melody_frequencies: List[float]
    drone1_frequency: float
    drone2_frequency: float
    length_melody: float
    length_drone1: float
    length_drone2: float
    hole_positions: List[float]  # Distance from fipple (or top) to each tone hole
    total_length: float
    bore_melody: float
    bore_drone1: float
    bore_drone2: float
    wall: float
    spacing: float
    hole_diameter: float
    tolerance: float


def midi_to_freq(midi_note: float) -> float:
    """Convert a MIDI note number to frequency in Hertz (A4 = 440 Hz)."""
    return 440.0 * (2.0 ** ((midi_note - 69.0) / 12.0))


def freq_to_midi(freq: float) -> float:
    """Convert frequency in Hertz to fractional MIDI note number."""
    import math
    if freq <= 0:
        raise ValueError("Frequency must be positive.")
    return 69.0 + 12.0 * math.log2(freq / 440.0)


def calculate_tube_length(
    freq: float,
    bore_diameter: float,
    speed_of_sound: float = SPEED_OF_SOUND_MM_S,
    end_correction_factor: float = 1.6,
) -> float:
    """Calculate the physical tube length in mm for an open-open cylindrical resonator."""
    if freq <= 0:
        raise ValueError("Frequency must be greater than zero.")
    if bore_diameter <= 0:
        raise ValueError("Bore diameter must be greater than zero.")

    # Half-wave acoustic resonance: L_eff = c / (2 * f)
    effective_length = speed_of_sound / (2.0 * freq)
    end_correction = end_correction_factor * bore_diameter
    tube_length = effective_length - end_correction
    if tube_length <= 0:
        raise ValueError(
            f"Calculated tube length is non-positive ({tube_length:.1f} mm) for frequency {freq:.1f} Hz. "
            f"Bore diameter may be too large for this frequency."
        )
    return tube_length


def calculate_flute_geometry(
    root_midi: int = 69,
    scale_intervals: Sequence[int] = (0, 3, 5, 7, 10, 12),
    drone1_offset: int = 0,
    drone2_offset: int = 7,
    bore_melody: float = 19.0,
    bore_drone1: float = 22.0,
    bore_drone2: float = 16.0,
    wall: float = 4.0,
    spacing: float = 25.0,
    hole_diameter: float = 7.0,
    tolerance: float = 0.4,
    extra_head_length: float = 30.0,
) -> FluteDimensions:
    """Calculate all acoustic and physical dimensions for the flute."""
    # Melody scale frequencies
    melody_notes = [root_midi + interval for interval in scale_intervals]
    melody_frequencies = [midi_to_freq(note) for note in melody_notes]

    # Drone frequencies
    drone1_freq = midi_to_freq(root_midi + drone1_offset)
    drone2_freq = midi_to_freq(root_midi + drone2_offset)

    # Tube lengths for fundamental notes
    l_melody = calculate_tube_length(melody_frequencies[0], bore_melody)
    l_drone1 = calculate_tube_length(drone1_freq, bore_drone1)
    l_drone2 = calculate_tube_length(drone2_freq, bore_drone2)

    # Tone hole positions (distance from the sound-producing fipple edge)
    hole_positions = []
    for freq in melody_frequencies[1:]:
        hole_pos = calculate_tube_length(freq, bore_melody)
        hole_positions.append(hole_pos)

    # Total flute body length (accommodating the longest bore plus fipple/head margin)
    total_length = max(l_melody, l_drone1, l_drone2) + extra_head_length

    return FluteDimensions(
        root_midi=root_midi,
        scale_intervals=list(scale_intervals),
        melody_frequencies=melody_frequencies,
        drone1_frequency=drone1_freq,
        drone2_frequency=drone2_freq,
        length_melody=l_melody,
        length_drone1=l_drone1,
        length_drone2=l_drone2,
        hole_positions=hole_positions,
        total_length=total_length,
        bore_melody=bore_melody,
        bore_drone1=bore_drone1,
        bore_drone2=bore_drone2,
        wall=wall,
        spacing=spacing,
        hole_diameter=hole_diameter,
        tolerance=tolerance,
    )
