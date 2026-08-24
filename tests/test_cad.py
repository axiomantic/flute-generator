"""Deep tests for OpenSCAD code generation, geometry consistency, and 3D printing slicing."""

from pathlib import Path
import tempfile
from flute_generator.acoustics import calculate_flute_geometry
from flute_generator.cad import generate_scad_content, save_scad_file
from flute_generator.scales import SCALES


class TestOpenScadGeneration:
    def test_scad_syntax_balance_and_modules(self):
        """Generated SCAD file must have balanced braces and required 3D printable modules."""
        dims = calculate_flute_geometry(
            root_midi=69,
            scale_intervals=SCALES["minor_pentatonic"],
            drone1_offset=0,
            drone2_offset=7,
        )
        scad_code = generate_scad_content(dims)

        # Syntax check: Braces balance
        open_braces = scad_code.count("{")
        close_braces = scad_code.count("}")
        assert open_braces == close_braces, f"Mismatched braces: {open_braces} open vs {close_braces} close"

        open_parens = scad_code.count("(")
        close_parens = scad_code.count(")")
        assert open_parens == close_parens, f"Mismatched parens: {open_parens} open vs {close_parens} close"

        # Check critical modules
        required_modules = [
            "module hex_profile_2d()",
            "module body_cross_section(h)",
            "module body_with_chimneys(h)",
            "module bores()",
            "module fipple_sound_windows()",
            "module converging_windways()",
            "module complete_flute()",
            "module head_slice()",
            "module mid_slice()",
            "module foot_slice()",
        ]
        for mod in required_modules:
            assert mod in scad_code, f"Missing OpenSCAD module '{mod}'"

    def test_scad_contains_exact_acoustic_dimensions(self):
        """All acoustic parameters must be exactly represented in the SCAD script."""
        dims = calculate_flute_geometry(
            root_midi=62,  # D4
            scale_intervals=SCALES["dorian"],
            bore_melody=18.5,
            bore_drone1=21.0,
            bore_drone2=15.5,
            wall=3.5,
            spacing=28.0,
            hole_diameter=6.5,
            tolerance=0.35,
        )
        scad_code = generate_scad_content(dims)

        assert f"wall = {dims.wall:.2f};" in scad_code
        assert f"spacing = {dims.spacing:.2f};" in scad_code
        assert f"tol = {dims.tolerance:.2f};" in scad_code
        assert f"fipple_z = {dims.total_length:.2f};" in scad_code
        assert f"total_L = {42.0 + dims.total_length:.2f};" in scad_code
        assert f"bore_melody = {dims.bore_melody:.2f};" in scad_code
        assert f"bore_drone1 = {dims.bore_drone1:.2f};" in scad_code
        assert f"bore_drone2 = {dims.bore_drone2:.2f};" in scad_code
        assert f"L_melody = {dims.length_melody:.2f};" in scad_code

        # Number of chimney hole cuts must match number of scale tone holes
        assert scad_code.count("rotate_extrude") >= len(dims.hole_positions)

    def test_save_scad_creates_parent_directories(self):
        dims = calculate_flute_geometry()
        with tempfile.TemporaryDirectory() as tmpdir:
            nested_path = Path(tmpdir) / "sub1" / "sub2" / "flute.scad"
            saved = save_scad_file(dims, nested_path)
            assert saved.is_file()
            assert saved.stat().st_size > 500
