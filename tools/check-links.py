#!/usr/bin/env python3
"""Fail when a deployed HTML page references a missing local file."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = []

    def handle_starttag(self, _tag, attrs):
        for name, value in attrs:
            if name in ("href", "src") and value:
                self.values.append(value)


def main():
    failures = []
    checked = 0
    for page in sorted(ROOT.glob("*.html")):
        parser = References()
        parser.feed(page.read_text(encoding="utf8"))
        for reference in parser.values:
            parsed = urlparse(reference)
            if parsed.scheme or reference.startswith(("#", "/", "data:")):
                continue
            target_name = parsed.path
            if not target_name:
                continue
            checked += 1
            target = (page.parent / target_name).resolve()
            if not target.exists():
                failures.append(f"{page.name}: {reference}")

    print(f"checked {checked} local HTML href/src references")
    if failures:
        print("BROKEN REFERENCES:")
        for failure in failures:
            print(f"  {failure}")
        raise SystemExit(1)
    print("all local HTML href/src references resolve")


if __name__ == "__main__":
    main()
