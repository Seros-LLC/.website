#!/usr/bin/env python3
"""Fail when an HTML reference resolves to neither a local file nor a configured rewrite.

The site serves two kinds of internal link:

  * a static page, e.g. /terms, served by ./terms.html because cleanUrls is on; and
  * an application route, e.g. /login, served by a vercel.json rewrite to app.seros.dev.

A visitor cannot tell the two apart and should not have to. This check makes sure
neither kind can rot: a link to a page that does not exist fails, and so does a link
to an app route that no rewrite covers.
"""
import json
import re
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


def rewrite_matchers(config):
    """Compile every rewrite source into a regex, so /connect/(.*) covers /connect/slack."""
    matchers = []
    for rule in config.get("rewrites", []):
        source = rule.get("source", "")
        if not source:
            continue
        matchers.append((source, re.compile("^" + source + "$")))
    return matchers


def main():
    failures = []
    checked = 0

    config = json.loads((ROOT / "vercel.json").read_text(encoding="utf8"))
    matchers = rewrite_matchers(config)

    demo_rewrites = [r for r in config.get("rewrites", []) if r.get("source") == "/demo"]
    if demo_rewrites:
        failures.append("vercel.json: obsolete /demo rewrite is configured")

    used_rewrites = set()

    for page in sorted(ROOT.glob("*.html")):
        parser = References()
        parser.feed(page.read_text(encoding="utf8"))
        for reference in parser.values:
            parsed = urlparse(reference)
            if parsed.scheme or reference.startswith(("#", "data:")):
                continue
            path = parsed.path
            if not path:
                continue
            checked += 1

            if path.startswith("/"):
                # An absolute internal link: a static page, or an app route.
                target = ROOT / path.lstrip("/")
                if target.exists() or target.with_suffix(".html").exists():
                    continue
                matched = [src for src, rx in matchers if rx.match(path)]
                if matched:
                    used_rewrites.update(matched)
                    continue
                failures.append(f"{page.name}: {reference} is neither a page nor a rewrite")
                continue

            target = (page.parent / path).resolve()
            if not target.exists():
                failures.append(f"{page.name}: {reference}")

    print(f"checked {checked} HTML href/src references")
    if used_rewrites:
        print("app routes reached through vercel.json rewrites: "
              + ", ".join(sorted(used_rewrites)))
    if failures:
        print("BROKEN REFERENCES:")
        for failure in failures:
            print(f"  {failure}")
        raise SystemExit(1)
    print("every reference resolves to a page or a configured rewrite")


if __name__ == "__main__":
    main()
