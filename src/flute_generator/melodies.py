"""Melody presets and quantization algorithms for flute playback."""

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


@dataclass
class NoteEvent:
    """Represents a single note or rest in a melody."""
    midi_note: Optional[int]  # None for rests
    duration_beats: float     # Duration in beats (e.g. 1.0 = quarter note, 0.5 = eighth note)
    velocity: int = 90        # MIDI velocity (0-127)


# Common flute melodies defined as relative semitone intervals from melody base and durations in beats
# (interval_from_root, duration_in_beats) -> None for rests.
# These melodies are classic flute pieces.
MELODY_PRESETS: Dict[str, List[Tuple[Optional[int], float]]] = {
    # El Cóndor Pasa (Iconic Andean flute melody)
    "condor_pasa": [
        (7, 1.5), (10, 0.5), (12, 1.0), (10, 0.5), (7, 0.5),
        (5, 2.0), (7, 1.0), (5, 0.5), (3, 0.5),
        (0, 3.0), (None, 0.5),
        (0, 0.5), (3, 0.5), (5, 1.0), (7, 1.0), (5, 1.0),
        (3, 1.5), (0, 0.5), (0, 3.0),
        (None, 1.0),
        (12, 1.5), (15, 0.5), (12, 1.0), (10, 0.5), (7, 0.5),
        (10, 2.0), (12, 1.0), (10, 0.5), (7, 0.5),
        (7, 3.0),
    ],
    # Traditional Native American Flute spirit theme / motif
    "native_motif": [
        (0, 1.5), (3, 0.5), (5, 1.0), (7, 2.0),
        (10, 1.0), (7, 1.0), (5, 1.0), (3, 1.0),
        (0, 2.5), (None, 0.5),
        (7, 1.0), (10, 1.0), (12, 2.0),
        (10, 0.75), (12, 0.25), (10, 1.0), (7, 1.0),
        (5, 1.5), (7, 0.5), (5, 1.0), (3, 1.0),
        (0, 3.0),
    ],
    # Morning Mood - Edvard Grieg (Peer Gynt flute solo)
    "morning_mood": [
        (7, 0.5), (4, 0.5), (2, 0.5), (0, 0.5), (2, 0.5), (4, 0.5),
        (7, 0.5), (4, 0.5), (2, 0.5), (0, 0.5), (2, 0.5), (4, 0.5),
        (7, 0.5), (9, 0.5), (7, 0.5), (9, 0.5), (12, 1.0),
        (9, 0.5), (7, 0.5), (4, 0.5), (2, 1.5),
    ],
    # Greensleeves (Traditional English flute / recorder theme)
    "greensleeves": [
        (0, 1.0),
        (3, 2.0), (5, 1.0), (7, 1.5), (8, 0.5), (7, 1.0),
        (5, 2.0), (2, 1.0), (0, 1.5), (2, 0.5), (3, 1.0),
        (5, 2.0), (3, 1.0), (2, 1.5), (0, 0.5), (2, 1.0),
        (0, 3.0),
    ],
    # Amazing Grace (Traditional pentatonic melody)
    "amazing_grace": [
        (0, 1.0),
        (5, 2.0), (9, 0.5), (5, 0.5),
        (9, 2.0), (7, 1.0),
        (5, 2.0), (2, 1.0),
        (0, 2.0), (0, 1.0),
        (5, 2.0), (9, 0.5), (5, 0.5),
        (9, 2.0), (12, 1.0),
        (14, 3.0),
    ],
    # Scale arpeggio preview
    "scale_arpeggio": [
        (0, 0.5), (3, 0.5), (5, 0.5), (7, 0.5), (10, 0.5), (12, 1.0),
        (10, 0.5), (7, 0.5), (5, 0.5), (3, 0.5), (0, 1.5),
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
    # Return the note in available_notes with minimal distance to target_note
    return min(available_notes, key=lambda note: (abs(note - target_note), note))


def build_quantized_melody(
    melody_name: str,
    root_midi: int,
    scale_intervals: List[int],
    octaves: int = 2,
    tempo_bpm: int = 100,
) -> List[NoteEvent]:
    """Load a melody preset, transpose relative to root_midi, and quantize each note to the flute scale."""
    if melody_name not in MELODY_PRESETS:
        raise ValueError(
            f"Unknown melody '{melody_name}'. Available: {list(MELODY_PRESETS.keys())}"
        )

    raw_melody = MELODY_PRESETS[melody_name]
    available_notes = get_available_flute_notes(root_midi, scale_intervals, octaves=octaves)

    events: List[NoteEvent] = []
    for interval, duration in raw_melody:
        if interval is None:
            # Rest
            events.append(NoteEvent(midi_note=None, duration_beats=duration))
        else:
            target_midi = root_midi + interval
            quantized_midi = quantize_note_to_scale(target_midi, available_notes)
            events.append(NoteEvent(midi_note=quantized_midi, duration_beats=duration, velocity=90))

    return events
