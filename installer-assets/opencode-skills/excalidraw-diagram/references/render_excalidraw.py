"""Guard, safely revise, and verify scenes through the pinned official editor."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time


def _number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_excalidraw(data: dict) -> list[str]:
    """Check native geometry and both directions of every label/arrow binding."""
    if not isinstance(data, dict) or data.get("type") != "excalidraw":
        return ["Expected an excalidraw scene object"]
    elements = data.get("elements")
    if not isinstance(elements, list) or not elements:
        return ["Expected a nonempty elements array"]
    errors = []
    by_id = {}
    for element in elements:
        if not isinstance(element, dict) or not isinstance(element.get("id"), str) or not element["id"]:
            errors.append("Every element needs a nonempty string id")
            continue
        if element["id"] in by_id:
            errors.append(f"Duplicate element id: {element['id']}")
        by_id[element["id"]] = element
    active = {key: value for key, value in by_id.items() if not value.get("isDeleted")}
    references = {}
    for element_id, element in active.items():
        refs = element.get("boundElements") or []
        if not isinstance(refs, list):
            errors.append(f"{element_id}: boundElements must be an array or null")
            refs = []
        references[element_id] = refs
    for element_id, element in active.items():
        if not all(_number(element.get(key)) for key in ("x", "y", "width", "height")):
            errors.append(f"{element_id}: nonfinite or missing geometry")
        if element.get("type") in ("arrow", "line"):
            points = element.get("points")
            valid = isinstance(points, list) and len(points) >= 2 and all(
                isinstance(point, list) and len(point) == 2 and all(_number(n) for n in point) for point in points
            )
            if not valid:
                errors.append(f"{element_id}: invalid native points")
            elif element.get("elbowed") and any(
                abs(a[0] - b[0]) > 0.001 and abs(a[1] - b[1]) > 0.001 for a, b in zip(points, points[1:])
            ):
                errors.append(f"{element_id}: elbow segments must be orthogonal")
            for end in ("startBinding", "endBinding"):
                binding = element.get(end)
                if binding is None:
                    continue
                target = active.get(binding["elementId"]) if isinstance(binding, dict) and isinstance(binding.get("elementId"), str) else None
                if target is None:
                    errors.append(f"{element_id}: dangling {end}")
                    continue
                if {"id": element_id, "type": "arrow"} not in references[target["id"]]:
                    errors.append(f"{element_id}: missing reciprocal {end}")
                if "fixedPoint" in binding:
                    point = binding["fixedPoint"]
                    if not isinstance(point, list) or len(point) != 2 or not all(_number(n) and 0 <= n <= 1 for n in point):
                        errors.append(f"{element_id}: invalid fixedPoint")
                    elif valid and all(_number(item.get(key)) for item in (target, element) for key in ("x", "y", "width", "height")):
                        local = points[0 if end == "startBinding" else -1]
                        expected_x = target["x"] + target["width"] * point[0]
                        expected_y = target["y"] + target["height"] * point[1]
                        angle = target.get("angle", 0)
                        if _number(angle) and angle:
                            cx, cy = target["x"] + target["width"] / 2, target["y"] + target["height"] / 2
                            dx, dy = expected_x - cx, expected_y - cy
                            expected_x, expected_y = cx + dx * math.cos(angle) - dy * math.sin(angle), cy + dx * math.sin(angle) + dy * math.cos(angle)
                        if math.hypot(element["x"] + local[0] - expected_x, element["y"] + local[1] - expected_y) > 24:
                            errors.append(f"{element_id}: detached {end} fixedPoint")
                    if binding.get("mode") not in ("inside", "orbit", "skip"):
                        errors.append(f"{element_id}: missing or unsupported binding mode")
        if element.get("type") == "text":
            container_id = element.get("containerId")
            if container_id is not None:
                container = active.get(container_id) if isinstance(container_id, str) else None
                if container is None or {"id": element_id, "type": "text"} not in references[container["id"]]:
                    errors.append(f"{element_id}: missing reciprocal text container")
            position = element.get("labelPosition")
            if position is not None and (not _number(position) or not 0 <= position <= 1):
                errors.append(f"{element_id}: labelPosition must be between 0 and 1")
        for ref in references[element_id]:
            child = active.get(ref["id"]) if isinstance(ref, dict) and isinstance(ref.get("id"), str) else None
            if child is None or child.get("type") != ref.get("type"):
                errors.append(f"{element_id}: stale boundElements reference")
            elif ref["type"] == "text" and child.get("containerId") != element_id:
                errors.append(f"{element_id}: nonreciprocal label")
            elif ref["type"] == "arrow" and not any(
                isinstance(child.get(end), dict) and child[end].get("elementId") == element_id
                for end in ("startBinding", "endBinding")
            ):
                errors.append(f"{element_id}: nonreciprocal arrow")
    return errors


def revise_scene(path: Path, patch: dict, expected_sha256: str, backup_dir: Path) -> dict:
    """Apply explicit field patches to the current scene, retaining an exact backup."""
    if path.is_symlink() or not path.is_file():
        raise ValueError("The approved scene must be a regular file, not a symlink")
    original = path.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    if digest != expected_sha256:
        raise ValueError("The approved scene changed; read it again before revising")
    data = json.loads(original)
    if not isinstance(patch, dict) or set(patch) - {"updates", "additions", "removeIds"}:
        raise ValueError("Use only updates, additions and removeIds")
    revised = copy.deepcopy(data)
    by_id = {element["id"]: element for element in revised["elements"]}
    seen = set()
    for update in patch.get("updates", []):
        element_id = update.get("id")
        changes = update.get("changes")
        if element_id not in by_id or element_id in seen or not isinstance(changes, dict) or "id" in changes:
            raise ValueError("Updates require distinct existing ids and field changes without id")
        seen.add(element_id)
        by_id[element_id].update(changes)
        by_id[element_id].update(version=by_id[element_id].get("version", 0) + 1,
                                versionNonce=secrets.randbits(31), updated=int(time.time() * 1000))
    removals = patch.get("removeIds", [])
    if not isinstance(removals, list) or any(element_id not in by_id for element_id in removals):
        raise ValueError("removeIds must name existing elements")
    revised["elements"] = [element for element in revised["elements"] if element["id"] not in removals]
    revised["elements"].extend(patch.get("additions", []))
    errors = validate_excalidraw(revised)
    if errors:
        raise ValueError("; ".join(errors))
    payload = (json.dumps(revised, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = backup_dir / f"{path.name}.{digest}.{secrets.token_hex(4)}.bak"
    with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
        handle.write(original)
        handle.flush()
        os.fsync(handle.fileno())
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(path.stat().st_mode & 0o777)
        if path.is_symlink() or path.read_bytes() != original:
            raise ValueError("The approved scene changed during revision; backup retained")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return {"input": str(path.resolve()), "backup": str(backup.resolve()), "beforeSha256": digest,
            "afterSha256": hashlib.sha256(payload).hexdigest(), "updatedIds": sorted(seen), "removedIds": removals}


def render(excalidraw_path: Path, output_path: Path | None = None, scale: int = 2,
           max_width: int = 1920, edit_id: str | None = None, presentation: bool = False) -> Path:
    """Verify through the identified native editor before returning its requested PNG."""
    data = json.loads(excalidraw_path.read_text(encoding="utf-8"))
    errors = validate_excalidraw(data)
    if errors:
        raise ValueError("; ".join(errors))
    output_path = output_path or excalidraw_path.with_suffix(".png")
    native = Path(__file__).parent / "native"
    command = ["node", str(native / "verify.mjs"), str(excalidraw_path.resolve()),
               "--output-dir", str(output_path.resolve().with_suffix(".verification")),
               "--output", str(output_path.resolve()), "--scale", str(scale), "--width", str(max_width)]
    if edit_id:
        command.extend(["--edit-id", edit_id])
    if presentation:
        command.append("--presentation")
    subprocess.run(command, cwd=native, check=True)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", "-o", type=Path)
    parser.add_argument("--scale", "-s", type=int, default=2)
    parser.add_argument("--width", "-w", type=int, default=1920)
    parser.add_argument("--edit-id")
    parser.add_argument("--presentation", action="store_true")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--patch", type=Path)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--backup-dir", type=Path)
    args = parser.parse_args()
    try:
        if args.patch:
            if not args.expected_sha256 or not args.backup_dir:
                parser.error("--patch requires --expected-sha256 and --backup-dir")
            result = revise_scene(args.input, json.loads(args.patch.read_text(encoding="utf-8")), args.expected_sha256, args.backup_dir)
        elif args.validate_only:
            errors = validate_excalidraw(json.loads(args.input.read_text(encoding="utf-8")))
            result = {"structural": "fail" if errors else "pass", "errors": errors}
            print(json.dumps(result))
            raise SystemExit(bool(errors))
        else:
            result = {"png": str(render(args.input, args.output, args.scale, args.width, args.edit_id, args.presentation))}
        print(json.dumps(result))
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"ERROR: {error}\n")


if __name__ == "__main__":
    main()
