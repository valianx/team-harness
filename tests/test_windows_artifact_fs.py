"""Native Windows tests for the review artifact filesystem adapter."""

from __future__ import annotations

import importlib.util
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "review-pr" / "scripts" / "windows_artifact_fs.py"
SPEC = importlib.util.spec_from_file_location("windows_artifact_fs", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


@unittest.skipUnless(os.name == "nt", "native Windows filesystem tests")
class WindowsArtifactFilesystemTests(unittest.TestCase):
    def test_handle_relative_create_read_stat_link_replace_and_delete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            root_fd = MODULE.open(
                root,
                os.O_RDONLY | MODULE.DIRECTORY | MODULE.NOFOLLOW,
            )
            try:
                source_fd = MODULE.open(
                    "source.bin",
                    os.O_RDWR | os.O_CREAT | os.O_EXCL | MODULE.NOFOLLOW,
                    0o600,
                    dir_fd=root_fd,
                )
                try:
                    self.assertEqual(os.write(source_fd, b"anchored"), 8)
                    os.fsync(source_fd)
                    os.lseek(source_fd, 0, os.SEEK_SET)
                    self.assertEqual(os.read(source_fd, 32), b"anchored")
                    source_identity = os.fstat(source_fd)
                finally:
                    os.close(source_fd)

                observed = MODULE.stat(
                    "source.bin", dir_fd=root_fd, follow_symlinks=False
                )
                self.assertEqual(
                    (observed.st_dev, observed.st_ino),
                    (source_identity.st_dev, source_identity.st_ino),
                )

                unicode_name = "spä ce.txt"
                unicode_fd = MODULE.open(
                    unicode_name,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL | MODULE.NOFOLLOW,
                    0o600,
                    dir_fd=root_fd,
                )
                try:
                    os.write(unicode_fd, b"unicode")
                finally:
                    os.close(unicode_fd)
                self.assertEqual(
                    MODULE.stat(unicode_name, dir_fd=root_fd, follow_symlinks=False).st_size,
                    7,
                )
                MODULE.unlink(unicode_name, dir_fd=root_fd)

                MODULE.link(
                    "source.bin",
                    "staging.bin",
                    src_dir_fd=root_fd,
                    dst_dir_fd=root_fd,
                    follow_symlinks=False,
                )
                self.assertEqual((root / "staging.bin").read_bytes(), b"anchored")
                self.assertEqual(
                    MODULE.stat("staging.bin", dir_fd=root_fd, follow_symlinks=False).st_ino,
                    source_identity.st_ino,
                )

                MODULE.replace(
                    "staging.bin",
                    "final.bin",
                    src_dir_fd=root_fd,
                    dst_dir_fd=root_fd,
                )
                self.assertEqual((root / "final.bin").read_bytes(), b"anchored")
                self.assertEqual((root / "source.bin").read_bytes(), b"anchored")

                MODULE.unlink("source.bin", dir_fd=root_fd)
                MODULE.unlink("final.bin", dir_fd=root_fd)
                with self.assertRaises(FileNotFoundError):
                    MODULE.stat("source.bin", dir_fd=root_fd, follow_symlinks=False)
            finally:
                os.close(root_fd)

    def test_scandir_uses_validated_directory_handle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "one").write_text("one", encoding="utf-8")
            (root / "two").mkdir()
            root_fd = MODULE.open(
                root,
                os.O_RDONLY | MODULE.DIRECTORY | MODULE.NOFOLLOW,
            )
            try:
                with MODULE.scandir(root_fd) as entries:
                    names = sorted(entry.name for entry in entries)
                self.assertEqual(names, ["one", "two"])
            finally:
                os.close(root_fd)

    def test_scandir_stays_on_the_pinned_directory_after_path_swap(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            root = parent / "root"
            root.mkdir()
            (root / "pinned.txt").write_text("pinned", encoding="utf-8")
            root_fd = MODULE.open(
                root,
                os.O_RDONLY | MODULE.DIRECTORY | MODULE.NOFOLLOW,
            )
            moved = parent / "moved"
            os.rename(root, moved)
            root.mkdir()
            (root / "replacement.txt").write_text("replacement", encoding="utf-8")
            try:
                with MODULE.scandir(root_fd) as entries:
                    names = sorted(entry.name for entry in entries)
                self.assertEqual(names, ["pinned.txt"])
            finally:
                os.close(root_fd)
            self.assertEqual((moved / "pinned.txt").read_text(encoding="utf-8"), "pinned")

    def test_reparse_leaf_is_reported_by_stat_but_rejected_by_open_and_link(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside_directory:
            root = Path(directory)
            outside = Path(outside_directory)
            sentinel = outside / "sentinel.txt"
            sentinel.write_text("outside", encoding="utf-8")
            symlink = root / "link.txt"
            try:
                symlink.symlink_to(sentinel)
            except (OSError, NotImplementedError) as error:
                self.skipTest(f"symbolic links unavailable: {error}")

            root_fd = MODULE.open(
                root,
                os.O_RDONLY | MODULE.DIRECTORY | MODULE.NOFOLLOW,
            )
            try:
                metadata = MODULE.stat("link.txt", dir_fd=root_fd, follow_symlinks=False)
                self.assertTrue(os.path.islink(symlink))
                self.assertTrue(stat.S_ISLNK(metadata.st_mode))
                with self.assertRaises(OSError):
                    MODULE.open("link.txt", os.O_RDONLY | MODULE.NOFOLLOW, dir_fd=root_fd)
                with self.assertRaises(OSError):
                    MODULE.link(
                        "link.txt",
                        "copy.txt",
                        src_dir_fd=root_fd,
                        dst_dir_fd=root_fd,
                        follow_symlinks=False,
                    )
                MODULE.unlink("link.txt", dir_fd=root_fd)
                self.assertEqual(sentinel.read_text(encoding="utf-8"), "outside")
            finally:
                os.close(root_fd)

    def test_junction_is_rejected_without_touching_target(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside_directory:
            root = Path(directory)
            outside = Path(outside_directory)
            sentinel = outside / "sentinel.txt"
            sentinel.write_text("outside", encoding="utf-8")
            junction = root / "junction"
            (root / "source.bin").write_bytes(b"source")
            completed = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(junction), str(outside)],
                capture_output=True,
                text=True,
                check=False,
            )
            if completed.returncode != 0:
                self.skipTest(f"junction creation unavailable: {completed.stderr or completed.stdout}")

            root_fd = MODULE.open(
                root,
                os.O_RDONLY | MODULE.DIRECTORY | MODULE.NOFOLLOW,
            )
            try:
                junction_metadata = MODULE.stat(
                    "junction", dir_fd=root_fd, follow_symlinks=False
                )
                self.assertTrue(stat.S_ISLNK(junction_metadata.st_mode))
                with self.assertRaises(OSError):
                    MODULE.open(
                        "junction",
                        os.O_WRONLY | os.O_TRUNC | MODULE.NOFOLLOW,
                        dir_fd=root_fd,
                    )
                self.assertEqual(sentinel.read_text(encoding="utf-8"), "outside")
                with self.assertRaises(OSError):
                    MODULE.replace(
                        "source.bin",
                        "junction",
                        src_dir_fd=root_fd,
                        dst_dir_fd=root_fd,
                    )
                self.assertEqual(sentinel.read_text(encoding="utf-8"), "outside")
                with self.assertRaises(OSError):
                    MODULE.open(
                        "junction",
                        os.O_RDONLY | MODULE.DIRECTORY | MODULE.NOFOLLOW,
                        dir_fd=root_fd,
                    )
                MODULE.unlink("junction", dir_fd=root_fd)
                self.assertTrue(sentinel.exists())
                self.assertEqual(sentinel.read_text(encoding="utf-8"), "outside")
            finally:
                os.close(root_fd)

    def test_replace_rejects_source_swapped_to_symlink(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside_directory:
            root = Path(directory)
            outside = Path(outside_directory)
            sentinel = outside / "sentinel.txt"
            sentinel.write_text("outside", encoding="utf-8")
            source = root / "source.bin"
            source.write_bytes(b"safe")
            destination = root / "destination.bin"
            destination.write_bytes(b"old")
            try:
                source.unlink()
                source.symlink_to(sentinel)
            except (OSError, NotImplementedError) as error:
                self.skipTest(f"symbolic links unavailable: {error}")

            root_fd = MODULE.open(
                root,
                os.O_RDONLY | MODULE.DIRECTORY | MODULE.NOFOLLOW,
            )
            try:
                with self.assertRaises(OSError):
                    MODULE.replace(
                        "source.bin",
                        "destination.bin",
                        src_dir_fd=root_fd,
                        dst_dir_fd=root_fd,
                    )
                self.assertEqual(destination.read_bytes(), b"old")
                self.assertEqual(sentinel.read_text(encoding="utf-8"), "outside")
            finally:
                os.close(root_fd)

    def test_replace_rejects_source_swapped_to_junction(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside_directory:
            root = Path(directory)
            outside = Path(outside_directory)
            sentinel = outside / "sentinel.txt"
            sentinel.write_text("outside", encoding="utf-8")
            source = root / "source.bin"
            source.write_bytes(b"safe")
            destination = root / "destination.bin"
            destination.write_bytes(b"old")
            source.unlink()
            completed = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(source), str(outside)],
                capture_output=True,
                text=True,
                check=False,
            )
            if completed.returncode != 0:
                self.skipTest(f"junction creation unavailable: {completed.stderr or completed.stdout}")

            root_fd = MODULE.open(
                root,
                os.O_RDONLY | MODULE.DIRECTORY | MODULE.NOFOLLOW,
            )
            try:
                with self.assertRaises(OSError):
                    MODULE.replace(
                        "source.bin",
                        "destination.bin",
                        src_dir_fd=root_fd,
                        dst_dir_fd=root_fd,
                    )
                self.assertEqual(destination.read_bytes(), b"old")
                self.assertTrue(source.is_dir())
                self.assertEqual(sentinel.read_text(encoding="utf-8"), "outside")
            finally:
                os.close(root_fd)


if __name__ == "__main__":
    unittest.main()
