"""Executable scene guards and preservation of approved native files."""

import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import sys

sys.dont_write_bytecode = True


SCRIPT = Path(__file__).resolve().parents[1] / "skills/excalidraw-diagram/references/render_excalidraw.py"
SPEC = importlib.util.spec_from_file_location("native_renderer", SCRIPT)
renderer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


def scene():
    return {
        "type": "excalidraw", "version": 2, "files": {}, "appState": {"viewBackgroundColor": "#ffffff"},
        "operatorNote": "preserve root metadata",
        "elements": [
            {"id": "a", "type": "rectangle", "x": 0, "y": 0, "width": 100, "height": 80,
             "boundElements": [{"id": "request", "type": "arrow"}]},
            {"id": "b", "type": "rectangle", "x": 320, "y": 100, "width": 100, "height": 80,
             "boundElements": [{"id": "request", "type": "arrow"}]},
            {"id": "request", "type": "arrow", "x": 105, "y": 40, "width": 210, "height": 100,
             "points": [[0, 0], [100, 0], [100, 100], [210, 100]], "elbowed": True,
             "startBinding": {"elementId": "a", "fixedPoint": [1, 0.5], "mode": "orbit"},
             "endBinding": {"elementId": "b", "fixedPoint": [0, 0.5], "mode": "orbit"},
             "boundElements": [{"id": "request-label", "type": "text"}]},
            {"id": "request-label", "type": "text", "x": 150, "y": 20, "width": 90, "height": 20,
             "text": "Submit", "fontSize": 16, "fontFamily": 3, "containerId": "request", "labelPosition": 0.25},
            {"id": "human-note", "type": "text", "x": 22, "y": 240, "width": 200, "height": 20,
             "text": "Operator changed this", "fontSize": 16, "fontFamily": 3,
             "customData": {"ownedBy": "human"}},
        ],
    }


class SceneIntegrityTests(unittest.TestCase):
    def test_native_elbow_with_reciprocal_label_is_valid(self):
        self.assertEqual(renderer.validate_excalidraw(scene()), [])

    def test_missing_label_reciprocity_is_rejected(self):
        data = scene()
        data["elements"][2]["boundElements"] = []
        self.assertTrue(renderer.validate_excalidraw(data))

    def test_dangling_endpoint_is_rejected(self):
        data = scene()
        data["elements"][2]["endBinding"]["elementId"] = "gone"
        self.assertTrue(renderer.validate_excalidraw(data))

    def test_native_fields_and_geometry_are_checked(self):
        for changes in ({"points": [[0, 0], [10, 10]]},
                        {"startBinding": {"elementId": "a", "fixedPoint": [2, 0.5], "mode": "orbit"}},
                        {"x": float("nan")}):
            with self.subTest(changes=changes):
                data = scene()
                data["elements"][2].update(changes)
                self.assertTrue(renderer.validate_excalidraw(data))

    def test_duplicate_ids_and_stale_reciprocal_references_are_rejected(self):
        data = scene()
        data["elements"].append(copy.deepcopy(data["elements"][0]))
        self.assertTrue(renderer.validate_excalidraw(data))
        data = scene()
        data["elements"][0]["boundElements"].append({"id": "gone", "type": "arrow"})
        self.assertTrue(renderer.validate_excalidraw(data))

    def test_detached_fixed_binding_is_rejected(self):
        data = scene()
        data["elements"][2]["x"] += 500
        self.assertTrue(renderer.validate_excalidraw(data))

    def test_malformed_reciprocal_lists_return_errors(self):
        for refs in ("wrong", [{"id": []}]):
            with self.subTest(refs=refs):
                data = scene()
                data["elements"][0]["boundElements"] = refs
                self.assertTrue(renderer.validate_excalidraw(data))


class SafeRevisionTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "posix", "POSIX permission bits are required")
    def test_backup_keeps_private_scene_inaccessible_to_other_users(self):
        with tempfile.TemporaryDirectory() as directory:
            approved = Path(directory) / "approved.excalidraw"
            original = json.dumps(scene()).encode()
            approved.write_bytes(original)
            approved.chmod(0o600)
            backups = Path(directory) / "backups"
            previous_umask = os.umask(0o022)
            try:
                receipt = renderer.revise_scene(approved, {"updates": []},
                                                hashlib.sha256(original).hexdigest(), backups)
            finally:
                os.umask(previous_umask)
            self.assertEqual(Path(receipt["backup"]).read_bytes(), original)
            self.assertEqual(Path(receipt["backup"]).stat().st_mode & 0o777, 0o600)
            self.assertEqual(backups.stat().st_mode & 0o777, 0o700)
            self.assertEqual(approved.stat().st_mode & 0o777, 0o600)

    def test_cli_reads_utf8_patch_independently_of_host_locale(self):
        with tempfile.TemporaryDirectory() as directory:
            approved = Path(directory) / "approved.excalidraw"
            original = json.dumps(scene()).encode()
            approved.write_bytes(original)
            patch_file = Path(directory) / "patch.json"
            patch_file.write_text(json.dumps({"updates": [{"id": "human-note", "changes": {"text": "Validación"}}]},
                                            ensure_ascii=False), encoding="utf-8")
            environment = {**os.environ, "LC_ALL": "C", "PYTHONUTF8": "0", "PYTHONCOERCECLOCALE": "0"}
            result = subprocess.run([sys.executable, str(SCRIPT), str(approved), "--patch", str(patch_file),
                                     "--expected-sha256", hashlib.sha256(original).hexdigest(),
                                     "--backup-dir", str(Path(directory) / "backups")],
                                    env=environment, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(approved.read_bytes())["elements"][4]["text"], "Validación")
            validation = subprocess.run([sys.executable, str(SCRIPT), str(approved), "--validate-only"],
                                        env=environment, capture_output=True)
            self.assertEqual(validation.returncode, 0, validation.stderr)
            self.assertEqual(json.loads(validation.stdout)["structural"], "pass")

    def test_unreadable_current_scene_stops_before_backup_or_replacement(self):
        with tempfile.TemporaryDirectory() as directory:
            approved = Path(directory) / "approved.excalidraw"
            original = json.dumps(scene()).encode()
            approved.write_bytes(original)
            backups = Path(directory) / "backups"
            with patch.object(Path, "read_bytes", side_effect=OSError("read failed")):
                with self.assertRaises(OSError):
                    renderer.revise_scene(approved, {"updates": []}, hashlib.sha256(original).hexdigest(), backups)
            self.assertEqual(approved.read_bytes(), original)
            self.assertFalse(backups.exists())

    def test_unwritable_backup_destination_preserves_approved_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            approved = Path(directory) / "approved.excalidraw"
            original = json.dumps(scene()).encode()
            approved.write_bytes(original)
            blocked = Path(directory) / "backups"
            blocked.write_text("existing unrelated file")
            with self.assertRaises(OSError):
                renderer.revise_scene(approved, {"updates": [{"id": "a", "changes": {"backgroundColor": "#fff"}}]},
                                      hashlib.sha256(original).hexdigest(), blocked)
            self.assertEqual(approved.read_bytes(), original)
            self.assertEqual(blocked.read_text(), "existing unrelated file")

    def test_revision_backs_up_exact_current_bytes_and_preserves_human_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            approved = Path(directory) / "approved.excalidraw"
            original = (json.dumps(scene(), indent=4) + "\n").encode()
            approved.write_bytes(original)
            receipt = renderer.revise_scene(approved, {"updates": [{"id": "a", "changes": {"backgroundColor": "#dbe4ff"}}]},
                                            hashlib.sha256(original).hexdigest(), Path(directory) / "backups")
            self.assertEqual(Path(receipt["backup"]).read_bytes(), original)
            revised = json.loads(approved.read_text())
            self.assertEqual(revised["elements"][4], scene()["elements"][4])
            self.assertEqual(revised["operatorNote"], "preserve root metadata")
            self.assertEqual(revised["elements"][0]["boundElements"], scene()["elements"][0]["boundElements"])
            self.assertEqual(revised["elements"][0]["backgroundColor"], "#dbe4ff")

    def test_stale_revision_and_invalid_references_leave_approved_bytes_intact(self):
        with tempfile.TemporaryDirectory() as directory:
            approved = Path(directory) / "approved.excalidraw"
            original = json.dumps(scene()).encode()
            approved.write_bytes(original)
            for patch, expected in (({"updates": []}, "0" * 64),
                                    ({"removeIds": ["b"]}, hashlib.sha256(original).hexdigest()),
                                    ({"updates": [{"id": "unknown", "changes": {"x": 1}}]}, hashlib.sha256(original).hexdigest())):
                with self.subTest(patch=patch), self.assertRaises(ValueError):
                    renderer.revise_scene(approved, patch, expected, Path(directory) / "backups")
                self.assertEqual(approved.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
