"""Tidy a folder by sorting files into subfolders by type.

Safe by default: it only PRINTS what it would do. Add --apply to really move files.
Usage:
    python automation.py ~/Downloads            # preview
    python automation.py ~/Downloads --apply    # move files
Needs only the Python standard library (3.8+).
"""
import argparse
import shutil
from pathlib import Path

CATEGORIES = {
    "Images": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"},
    "Documents": {".pdf", ".doc", ".docx", ".txt", ".md", ".xlsx", ".pptx"},
    "Archives": {".zip", ".tar", ".gz", ".rar", ".7z"},
    "Code": {".py", ".js", ".html", ".css", ".json"},
    "Media": {".mp3", ".wav", ".mp4", ".mov", ".mkv"},
}


def category_for(path: Path) -> str:
    ext = path.suffix.lower()
    for name, exts in CATEGORIES.items():
        if ext in exts:
            return name
    return "Other"


def main() -> None:
    parser = argparse.ArgumentParser(description="Sort files in a folder by type.")
    parser.add_argument("folder", type=Path)
    parser.add_argument("--apply", action="store_true", help="actually move the files")
    args = parser.parse_args()

    if not args.folder.is_dir():
        raise SystemExit(f"Not a folder: {args.folder}")

    moved = 0
    for item in sorted(args.folder.iterdir()):
        if not item.is_file() or item.name.startswith("."):
            continue
        target_dir = args.folder / category_for(item)
        target = target_dir / item.name
        if target.exists():
            print(f"skip (already exists): {item.name}")
            continue
        print(f"{'move' if args.apply else 'would move'}: {item.name} -> {target_dir.name}/")
        if args.apply:
            target_dir.mkdir(exist_ok=True)
            shutil.move(str(item), str(target))
        moved += 1

    print(f"\n{moved} file(s) {'moved' if args.apply else 'would be moved'}.")


if __name__ == "__main__":
    main()
