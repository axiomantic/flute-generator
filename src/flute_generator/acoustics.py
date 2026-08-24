"""Acoustic physics and geometry calculations for multi-drone flutes from Piccolo to Contrabass."""

from dataclasses import dataclass
import math
from typing import Dict, List, Optional, Sequence, Tuple

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
    hole_diameters: List[float]  # Tone hole diameters in mm (ergonomically scaled)
    total_length: float
    bore_melody: float
    bore_drone1: float
    bore_drone2: float
    wall: float
    spacing: float
    hole_diameter: float
    tolerance: float
    flute_size: str = "tenor"  # piccolo, soprano, tenor, bass, contrabass
    mouthpiece_taper: bool = True
    windway_profile: str = "flat"
    drone_air_ratio: float = 0.78
    windway_texture: str = "smooth"


def midi_to_freq(midi_note: float) -> float:
    """Convert a MIDI note number to frequency in Hertz (A4 = 440 Hz)."""
    return 440.0 * (2.0 ** ((midi_note - 69.0) / 12.0))


def freq_to_midi(freq: float) -> float:
    """Convert frequency in Hertz to fractional MIDI note number."""
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


def get_default_bore_for_pitch(root_midi: int) -> Tuple[float, float, float, str]:
    """Determine the optimal acoustic bore diameters and flute size category for a given root pitch."""
    if root_midi >= 74:  # D5 and above: Piccolo / Sopranino
        return 12.0, 14.0, 10.0, "piccolo"
    elif root_midi >= 67:  # G4 to C#5: Soprano / Alto
        return 16.0, 18.0, 14.0, "soprano"
    elif root_midi >= 58:  # A#3 to F#4: Tenor (Traditional A4/G4/F4)
        return 19.0, 22.0, 16.0, "tenor"
    elif root_midi >= 46:  # A#2 to A3: Bass Flute
        return 28.0, 32.0, 24.0, "bass"
    else:  # C2 to A2: Contrabass Flute
        return 40.0, 46.0, 34.0, "contrabass"


def calculate_flute_geometry(
    root_midi: int = 69,
    scale_intervals: Sequence[int] = (0, 3, 5, 7, 10, 12),
    drone1_offset: int = 0,
    drone2_offset: int = 7,
    bore_melody: Optional[float] = None,
    bore_drone1: Optional[float] = None,
    bore_drone2: Optional[float] = None,
    wall: float = 4.0,
    spacing: Optional[float] = None,
    hole_diameter: Optional[float] = None,
    tolerance: float = 0.4,
    extra_head_length: float = 30.0,
    windway_profile: str = "flat",
    drone_air_ratio: float = 0.78,
    windway_texture: str = "smooth",
    max_hand_span_mm: float = 36.0,
) -> FluteDimensions:
    """Calculate all acoustic, physical, and ergonomic dimensions across any flute size."""
    auto_bm, auto_bd1, auto_bd2, size_cat = get_default_bore_for_pitch(root_midi)
    
    b_mel = bore_melody if bore_melody is not None else auto_bm
    b_d1 = bore_drone1 if bore_drone1 is not None else auto_bd1
    b_d2 = bore_drone2 if bore_drone2 is not None else auto_bd2
    
    # Auto-scale wall and spacing for large bass/contrabass flutes
    if spacing is None:
        spacing = max(20.0, min(50.0, b_mel * 1.35))
    if hole_diameter is None:
        hole_diameter = max(5.0, min(9.5, b_mel * 0.38))

    # Melody scale frequencies
    melody_notes = [root_midi + interval for interval in scale_intervals]
    melody_frequencies = [midi_to_freq(note) for note in melody_notes]

    # Drone frequencies
    drone1_freq = midi_to_freq(root_midi + drone1_offset)
    drone2_freq = midi_to_freq(root_midi + drone2_offset)

    # Tube lengths for fundamental notes
    l_melody = calculate_tube_length(melody_frequencies[0], b_mel)
    l_drone1 = calculate_tube_length(drone1_freq, b_d1)
    l_drone2 = calculate_tube_length(drone2_freq, b_d2)

    # Tone hole positions & ergonomic acoustic chimney diameter scaling
    hole_positions = []
    hole_diameters = []
    
    for idx, freq in enumerate(melody_frequencies[1:]):
        raw_hole_pos = calculate_tube_length(freq, b_mel)
        
        # Check if spacing from previous hole is too large for human hand reach
        if hole_positions:
            prev_pos = hole_positions[-1]
            gap = abs(raw_hole_pos - prev_pos)
            if gap > max_hand_span_mm and size_cat in ("bass", "contrabass"):
                # Shift hole upward within hand reach and scale hole diameter down:
                # delta_L_acoustic = (r_bore^2 / r_hole^2) * t_effective
                clamped_pos = prev_pos + (max_hand_span_mm if raw_hole_pos > prev_pos else -max_hand_span_mm)
                shift = abs(raw_hole_pos - clamped_pos)
                # Reduced hole diameter to retain exact acoustic target pitch
                scaled_diam = max(4.5, hole_diameter * math.sqrt(max(0.3, (l_melody - raw_hole_pos) / (l_melody - clamped_pos))))
                hole_positions.append(clamped_pos)
                hole_diameters.append(scaled_diam)
                continue

        hole_positions.append(raw_hole_pos)
        hole_diameters.append(hole_diameter)

    # Total flute body length (accommodating longest bore plus head joint)
    head_joint_len = extra_head_length if size_cat in ("piccolo", "soprano", "tenor") else extra_head_length * 1.5
    total_length = max(l_melody, l_drone1, l_drone2) + head_joint_len

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
        hole_diameters=hole_diameters,
        total_length=total_length,
        bore_melody=b_mel,
        bore_drone1=b_d1,
        bore_drone2=b_d2,
        wall=wall,
        spacing=spacing,
        hole_diameter=hole_diameter,
        tolerance=tolerance,
        flute_size=size_cat,
        mouthpiece_taper=True,
        windway_profile=windway_profile,
        drone_air_ratio=drone_air_ratio,
        windway_texture=windway_texture,
    )
