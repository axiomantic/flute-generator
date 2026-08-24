"""Melody presets, expressive phrasing, and quantization algorithms for flute playback."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class NoteEvent:
    """Represents a single note, grace ornament, or rest in an expressive melody."""
    midi_note: Optional[int]         # None for rests
    duration_beats: float            # Duration in beats (e.g. 1.0 = quarter note)
    velocity: int = 84               # MIDI velocity (0-127)
    ornament: Optional[str] = None   # Optional articulation/ornament: "grace_dip", "grace_lift", "mordent", "scoop"
    vibrato_depth: float = 0.5       # Maximum vibrato depth for sustained note (0.0 to 1.0)
    swell_intensity: float = 0.3     # Breath swell intensity (0.0 to 1.0)


# Common flute melodies defined as:
# (interval_from_root, duration_in_beats, ornament_type_or_None)
MELODY_PRESETS: Dict[str, List[Tuple[Optional[int], float, Optional[str]]]] = {
    # El Cóndor Pasa (Iconic Andean flute melody with soulful ornamentation)
    "condor_pasa": [
        (7, 1.5, None), (10, 0.5, "grace_lift"), (12, 1.0, None), (10, 0.5, None), (7, 0.5, None),
        (5, 2.0, "mordent"), (7, 1.0, None), (5, 0.5, None), (3, 0.5, None),
        (0, 3.0, None), (None, 0.5, None),
        (0, 0.5, "grace_dip"), (3, 0.5, None), (5, 1.0, "mordent"), (7, 1.0, None), (5, 1.0, None),
        (3, 1.5, "grace_dip"), (0, 0.5, None), (0, 3.0, None),
        (None, 1.0, None),
        (12, 1.5, None), (15, 0.5, "grace_lift"), (12, 1.0, None), (10, 0.5, None), (7, 0.5, None),
        (10, 2.0, "mordent"), (12, 1.0, None), (10, 0.5, None), (7, 0.5, None),
        (7, 3.5, None),
    ],
    # Canyon Echoes / Native Spirit (Traditional Native American Flute love theme & spirit call)
    "native_motif": [
        (0, 1.5, None), (3, 0.5, "grace_dip"), (5, 1.0, None), (7, 2.0, "mordent"),
        (10, 1.0, "grace_lift"), (7, 1.0, None), (5, 1.0, "grace_dip"), (3, 1.0, None),
        (0, 2.5, None), (None, 0.5, None),
        (7, 1.0, None), (10, 1.0, "grace_lift"), (12, 2.0, "mordent"),
        (10, 0.75, None), (12, 0.25, None), (10, 1.0, None), (7, 1.0, "grace_dip"),
        (5, 1.5, None), (7, 0.5, None), (5, 1.0, None), (3, 1.0, None),
        (0, 3.5, None),
    ],
    # Desert Caravan / Maqam Hijaz (Exotic Middle Eastern Ney / Hijaz scale taqsim)
    "desert_caravan": [
        (0, 1.0, None), (1, 0.5, "grace_dip"), (4, 1.5, "mordent"),
        (5, 1.0, None), (4, 0.5, None), (1, 0.5, "grace_dip"), (0, 2.0, None),
        (None, 0.5, None),
        (4, 1.0, None), (5, 0.5, None), (7, 1.5, "mordent"),
        (8, 1.0, "grace_lift"), (7, 0.5, None), (5, 0.5, None), (4, 2.0, None),
        (None, 0.5, None),
        (7, 1.0, None), (8, 0.5, "grace_lift"), (10, 1.0, None), (12, 2.0, "mordent"),
        (10, 0.5, None), (8, 0.5, None), (7, 1.0, None), (5, 0.5, None), (4, 1.0, "grace_dip"),
        (1, 1.5, None), (0, 3.0, None),
    ],
    # Morning Mood - Edvard Grieg (Peer Gynt flute solo)
    "morning_mood": [
        (7, 0.5, None), (4, 0.5, None), (2, 0.5, None), (0, 0.5, None), (2, 0.5, None), (4, 0.5, None),
        (7, 0.5, "mordent"), (4, 0.5, None), (2, 0.5, None), (0, 0.5, None), (2, 0.5, None), (4, 0.5, None),
        (7, 0.5, "grace_lift"), (9, 0.5, None), (7, 0.5, None), (9, 0.5, None), (12, 1.0, None),
        (9, 0.5, None), (7, 0.5, None), (4, 0.5, None), (2, 2.0, None),
    ],
    # Greensleeves (Traditional English flute theme with poignant cadence)
    "greensleeves": [
        (0, 1.0, "grace_dip"),
        (3, 2.0, None), (5, 1.0, None), (7, 1.5, "mordent"), (8, 0.5, None), (7, 1.0, None),
        (5, 2.0, "grace_lift"), (2, 1.0, None), (0, 1.5, None), (2, 0.5, None), (3, 1.0, None),
        (5, 2.0, "mordent"), (3, 1.0, None), (2, 1.5, "grace_dip"), (0, 0.5, None), (2, 1.0, None),
        (0, 3.5, None),
    ],
    # Amazing Grace (Traditional pentatonic hymn)
    "amazing_grace": [
        (0, 1.0, "grace_dip"),
        (5, 2.0, None), (9, 0.5, "grace_lift"), (5, 0.5, None),
        (9, 2.0, "mordent"), (7, 1.0, None),
        (5, 2.0, None), (2, 1.0, None),
        (0, 2.0, "grace_dip"), (0, 1.0, None),
        (5, 2.0, None), (9, 0.5, "grace_lift"), (5, 0.5, None),
        (9, 2.0, "mordent"), (12, 1.0, None),
        (14, 3.5, None),
    ],
    # Scale arpeggio preview
    "scale_arpeggio": [
        (0, 0.5, None), (3, 0.5, None), (5, 0.5, None), (7, 0.5, None), (10, 0.5, None), (12, 1.0, None),
        (10, 0.5, None), (7, 0.5, None), (5, 0.5, None), (3, 0.5, None), (0, 1.5, None),
    ],
}


def get_available_flute_notes(root_midi: int, scale_intervals: List[int], octaves: int = 2) -> List[int]:
    """Generate all available playable pitches on this flute across multiple octaves."""
    notes = set()
    for oct_idx in range(octaves):
        octave_offset = oct_idx * 12
        for interval in scale_intervals:
            note = root_midi + octave_offset + interval
            if 0 <= note <= 127:
                notes.add(note)
    return sorted(notes)


def quantize_note_to_scale(target_note: int, available_notes: List[int]) -> int:
    """Quantize/snap a target MIDI note to the nearest available note in the flute's scale."""
    if not available_notes:
        raise ValueError("available_notes list cannot be empty.")
    return min(available_notes, key=lambda note: (abs(note - target_note), note))


def build_quantized_melody(
    melody_name: str,
    root_midi: int,
    scale_intervals: List[int],
    octaves: int = 2,
    base_velocity: int = 84,
) -> List[NoteEvent]:
    """Load a melody preset, transpose relative to root_midi, and quantize each note with smooth, even dynamics."""
    if melody_name not in MELODY_PRESETS:
        raise ValueError(
            f"Unknown melody '{melody_name}'. Available: {list(MELODY_PRESETS.keys())}"
        )

    raw_melody = MELODY_PRESETS[melody_name]
    available_notes = get_available_flute_notes(root_midi, scale_intervals, octaves=octaves)

    events: List[NoteEvent] = []

    for item in raw_melody:
        interval = item[0]
        duration = item[1]
        ornament = item[2] if len(item) > 2 else None

        if interval is None:
            # Musical rest (breath pause)
            events.append(NoteEvent(midi_note=None, duration_beats=duration))
        else:
            target_midi = root_midi + interval
            quantized_midi = quantize_note_to_scale(target_midi, available_notes)

            # Smooth, stable velocity across the whole phrase to prevent volume jumps
            vel = base_velocity

            events.append(
                NoteEvent(
                    midi_note=quantized_midi,
                    duration_beats=duration,
                    velocity=vel,
                    ornament=ornament,
                    vibrato_depth=0.4 if duration >= 1.5 else 0.0,
                    swell_intensity=0.2,
                )
            )

    return events
