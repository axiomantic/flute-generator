"""Scale definitions and musical pitch utilities."""

from typing import Dict, List, Tuple

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NOTE_ALIASES = {
    "DB": "C#",
    "EB": "D#",
    "FB": "E",
    "E#": "F",
    "GB": "F#",
    "AB": "G#",
    "BB": "A#",
    "B#": "C",
    "CB": "B",
}

SCALES: Dict[str, List[int]] = {
    "minor_pentatonic": [0, 3, 5, 7, 10, 12],
    "major_pentatonic": [0, 2, 4, 7, 9, 12],
    "major": [0, 2, 4, 5, 7, 9, 11, 12],
    "natural_minor": [0, 2, 3, 5, 7, 8, 10, 12],
    "dorian": [0, 2, 3, 5, 7, 9, 10, 12],
    "blues": [0, 3, 5, 6, 7, 10, 12],
}


def note_name_to_midi(name_or_str: str) -> int:
    """Parse a note string (e.g., 'A4', 'C#5', 'Bb3', '69') into a MIDI note number."""
    name_clean = name_or_str.strip()
    if name_clean.isdigit():
        midi_val = int(name_clean)
        if 0 <= midi_val <= 127:
            return midi_val
        raise ValueError(f"MIDI note number {midi_val} out of range (0-127).")

    # Parse format like A4 or C#5 or Bb3
    if len(name_clean) < 2:
        raise ValueError(f"Invalid note name: '{name_or_str}'")

    octave_str = ""
    pitch_str = ""
    for i, char in enumerate(name_clean):
        if char.isdigit() or (char == "-" and i > 0):
            pitch_str = name_clean[:i].upper()
            octave_str = name_clean[i:]
            break

    if not pitch_str or not octave_str:
        raise ValueError(f"Could not parse pitch and octave from: '{name_or_str}'")

    try:
        octave = int(octave_str)
    except ValueError:
        raise ValueError(f"Invalid octave '{octave_str}' in note name '{name_or_str}'.")

    # Normalize enharmonics with octave adjustments
    if pitch_str == "B#":
        pitch_str = "C"
        octave += 1
    elif pitch_str == "CB":
        pitch_str = "B"
        octave -= 1
    elif pitch_str in NOTE_ALIASES:
        pitch_str = NOTE_ALIASES[pitch_str]

    if pitch_str not in NOTE_NAMES:
        raise ValueError(f"Unknown note pitch '{pitch_str}' in '{name_or_str}'.")

    pitch_class = NOTE_NAMES.index(pitch_str)
    midi = (octave + 1) * 12 + pitch_class
    if not (0 <= midi <= 127):
        raise ValueError(f"Calculated MIDI note {midi} is out of 0-127 range.")
    return midi


def midi_to_note_name(midi_note: int) -> str:
    """Convert a MIDI note number into a note name (e.g., 69 -> 'A4')."""
    if not (0 <= midi_note <= 127):
        raise ValueError(f"MIDI note {midi_note} out of range (0-127).")
    pitch_class = midi_note % 12
    octave = (midi_note // 12) - 1
    return f"{NOTE_NAMES[pitch_class]}{octave}"


def get_scale_notes(root_midi: int, scale_name: str) -> List[int]:
    """Return a list of absolute MIDI note numbers for the given scale and root."""
    if scale_name not in SCALES:
        raise ValueError(f"Unknown scale '{scale_name}'. Available: {list(SCALES.keys())}")
    intervals = SCALES[scale_name]
    return [root_midi + interval for interval in intervals]
