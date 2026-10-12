#!/usr/bin/env python3
"""Convert website images to WebP, update references, and remove originals."""

import argparse
import hashlib
import os
from pathlib import Path
import re
import sys
import tempfile


def fingerprint(path):
    with path.open("rb") as stream:
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
        return digest.digest()


def positive_int(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return number


def image_candidates(root):
    images = root / "images"
    if not images.is_dir() or images.is_symlink():
        raise ValueError(f"Expected an ordinary images directory: {images}")
    sources = []
    for directory, directories, files in os.walk(images, followlinks=False):
        for name in directories:
            if (Path(directory) / name).is_symlink():
                raise ValueError("Symlinked image directories are not supported")
        for name in files:
            path = Path(directory) / name
            if path.suffix.lower() in {".jpg", ".jpeg", ".png"}:
                if path.is_symlink():
                    raise ValueError(f"Symlinked images are not supported: {path}")
                sources.append(path)
    sources.sort()
    common_stems = {}
    for source in sources:
        stem = source.with_suffix("")
        common_stems[stem] = common_stems.get(stem, 0) + 1
    plan = []
    for source in sources:
        target = (source.with_name(source.name + ".webp")
                  if common_stems[source.with_suffix("")] > 1
                  else source.with_suffix(".webp"))
        if target.exists() or target.is_symlink():
            raise ValueError(f"Refusing to overwrite existing output: {target}")
        plan.append((source, target))
    return plan


def source_files(root):
    excluded = {".git", "node_modules", ".venv", "venv", "images"}
    for directory, directories, files in os.walk(root, followlinks=False):
        directories[:] = [
            name for name in directories
            if name not in excluded
            and not name.startswith(".optimize-images-")
            and not (Path(directory) / name).is_symlink()
        ]
        for name in sorted(files):
            path = Path(directory) / name
            if path.suffix.lower() in {".html", ".css", ".js", ".json"}:
                if path.is_symlink():
                    raise ValueError(f"Symlinked source files are not supported: {path}")
                yield path


def prepare_references(root, conversions):
    mapping = {
        source.relative_to(root).as_posix(): target.relative_to(root).as_posix()
        for source, target, *_ in conversions
    }
    if not mapping:
        return []
    pattern = re.compile(
        "(?:" + "|".join(re.escape(path) for path in mapping)
        + r")(?=$|[?#\"'\s)<>`])"
    )
    changes = []
    for path in source_files(root):
        original = path.read_bytes()
        text = original.decode("utf-8")
        updated, count = pattern.subn(lambda match: mapping[match.group()], text)
        if count:
            changes.append((path, original, updated.encode("utf-8"), count))
    return changes


def encode_image(source, staged, edge, quality):
    from io import BytesIO
    from PIL import Image, ImageCms, ImageOps

    with Image.open(source) as opened:
        original_size = opened.size
        icc = opened.info.get("icc_profile")
        if opened.format == "JPEG":
            opened.draft("RGB", (edge, edge))
        image = ImageOps.exif_transpose(opened)
        image.thumbnail((edge, edge), Image.Resampling.LANCZOS, reducing_gap=3.0)
        if image.mode == "CMYK" and icc:
            image = ImageCms.profileToProfile(
                image, ImageCms.ImageCmsProfile(BytesIO(icc)),
                ImageCms.createProfile("sRGB"), outputMode="RGB",
            )
            icc = ImageCms.ImageCmsProfile(
                ImageCms.createProfile("sRGB")
            ).tobytes()
        elif image.mode not in {"RGB", "RGBA"}:
            image = image.convert(
                "RGBA" if "transparency" in image.info
                or "A" in image.getbands() else "RGB"
            )
        if image.mode == "RGBA" and image.getchannel("A").getextrema() == (255, 255):
            image = image.convert("RGB")
        options = {"quality": quality, "method": 6}
        if icc:
            options["icc_profile"] = icc
        image.save(staged, "WEBP", **options)
        with Image.open(staged) as verified:
            verified.load()
            if verified.format != "WEBP" or verified.size != image.size:
                raise ValueError(f"WebP verification failed: {source}")
            if "A" in image.getbands() and "A" not in verified.getbands():
                raise ValueError(f"Transparency was lost: {source}")
        return original_size, image.size


def commit(conversions, changes, staging):
    for source, target, _, digest, *_ in conversions:
        if fingerprint(source) != digest:
            raise ValueError(f"Image changed during conversion: {source}")
        if target.exists() or target.is_symlink():
            raise ValueError(f"Output appeared during conversion: {target}")
    for path, original, _, _ in changes:
        if path.read_bytes() != original:
            raise ValueError(f"Source file changed during conversion: {path}")

    published, edited, moved = [], [], []
    try:
        for _, target, staged, *_ in conversions:
            os.link(staged, target)
            published.append(target)
        for index, (path, _, updated, _) in enumerate(changes):
            replacement = staging / f"source-{index}"
            replacement.write_bytes(updated)
            os.chmod(replacement, path.stat().st_mode & 0o777)
            edited.append((path, path.read_bytes()))
            os.replace(replacement, path)
        for index, (source, *_rest) in enumerate(conversions):
            backup = staging / f"original-{index}"
            os.replace(source, backup)
            moved.append((source, backup))
    except BaseException:
        for source, backup in reversed(moved):
            os.replace(backup, source)
        for path, original in reversed(edited):
            path.write_bytes(original)
        for target in reversed(published):
            target.unlink()
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--quality", type=int, choices=range(1, 101),
        default=88, metavar="1-100"
    )
    parser.add_argument("--max-edge", type=positive_int, default=4096)
    parser.add_argument("--thumbnail-edge", type=positive_int, default=1600)
    args = parser.parse_args(argv)
    root = args.root.resolve(strict=True)
    plan = image_candidates(root)
    if not plan:
        print("No PNG/JPEG images to convert. Nothing changed.")
        return 0
    if args.dry_run:
        for source, target in plan:
            print(f"{source.relative_to(root)} -> {target.relative_to(root)}")
        changes = prepare_references(root, plan)
        for path, _, _, count in changes:
            print(f"Update {count} reference(s): {path.relative_to(root)}")
        print(
            f"Dry run: {len(plan)} candidate images. No files changed. "
            "Actual conversion keeps any original whose WebP is not smaller."
        )
        return 0

    try:
        from PIL import features
    except ImportError:
        raise ValueError(
            "Pillow is required. Install with: python3 -m pip install Pillow"
        )
    if not features.check("webp"):
        raise ValueError("This Pillow installation does not support WebP")
    conversions = []
    old_bytes = new_bytes = 0
    with tempfile.TemporaryDirectory(
        prefix=".optimize-images-", dir=root
    ) as directory:
        staging = Path(directory)
        for index, (source, target) in enumerate(plan):
            digest = fingerprint(source)
            staged = staging / f"image-{index}.webp"
            edge = (
                args.thumbnail_edge
                if "thumbs" in source.relative_to(root).parts
                else args.max_edge
            )
            before, after = encode_image(source, staged, edge, args.quality)
            if fingerprint(source) != digest:
                raise ValueError(f"Image changed during conversion: {source}")
            size_before = source.stat().st_size
            size_after = staged.stat().st_size
            if size_after >= size_before:
                print(
                    f"Keep {source.relative_to(root)}: WebP is not smaller",
                    flush=True,
                )
                continue
            conversions.append((source, target, staged, digest, before, after))
            old_bytes += size_before
            new_bytes += size_after
            print(
                f"{source.relative_to(root)}: "
                f"{size_before:,} -> {size_after:,} bytes; "
                f"{before[0]}x{before[1]} -> {after[0]}x{after[1]}",
                flush=True,
            )
        changes = prepare_references(root, conversions)
        commit(conversions, changes, staging)
    for path, _, _, count in changes:
        print(f"Updated {count} reference(s): {path.relative_to(root)}")
    print(
        f"Converted {len(conversions)} image(s); removed their originals. "
        f"Saved {(old_bytes - new_bytes) / 1048576:.2f} MiB "
        f"({(1 - new_bytes / old_bytes) * 100 if old_bytes else 0:.1f}%)."
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
