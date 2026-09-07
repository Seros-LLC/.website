#!/usr/bin/env python3
"""Fail when an HTML reference cannot be resolved locally or as an approved app link.

The marketing site owns static pages. The application owns its canonical
``https://app.seros.dev`` origin: OAuth state cookies, provider callbacks, forms and
sessions must all stay on that host. Legacy ``seros.dev`` app paths are redirects,
not transparent rewrites, so a request never starts on one host and completes its
stateful flow on another.

This check makes both boundaries explicit. An internal link must resolve to a site
page. An app link must be an approved canonical URL. Each legacy redirect must point
to the matching app path, which prevents an old bookmark from becoming a dead end.
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


APP_ORIGIN = "https://app.seros.dev"


def route_matchers(config):
    """Compile legacy redirect sources; /connect/(.*) covers callback paths too."""
    matchers = []
    for rule in config.get("redirects", []):
        source = rule.get("source", "")
        destination = rule.get("destination", "")
        if source and destination:
            matchers.append((source, destination, re.compile("^" + source + "$")))
    return matchers


def app_path(reference):
    """Return the app path for a canonical app URL, otherwise None."""
    parsed = urlparse(reference)
    if parsed.scheme != "https" or parsed.netloc != "app.seros.dev":
        return None
    return parsed.path or "/"


def main():
    failures = []
    checked = 0

    config = json.loads((ROOT / "vercel.json").read_text(encoding="utf8"))
    if config.get("rewrites"):
        failures.append("vercel.json: app paths must redirect, not transparently rewrite")
    matchers = route_matchers(config)

    demo_routes = [r for r in config.get("redirects", []) if r.get("source") == "/demo"]
    if demo_routes:
        failures.append("vercel.json: obsolete /demo redirect is configured")

    used_redirects = set()

    for page in sorted(ROOT.glob("*.html")):
        parser = References()
        parser.feed(page.read_text(encoding="utf8"))
        for reference in parser.values:
            parsed = urlparse(reference)
            if reference.startswith(("#", "data:")):
                continue
            canonical_app_path = app_path(reference)
            if canonical_app_path is not None:
                checked += 1
                if not any(rx.match(canonical_app_path) for _src, _dest, rx in matchers):
                    failures.append(f"{page.name}: {reference} is not an approved app route")
                continue
            if parsed.scheme:
                continue
            path = parsed.path
            if not path:
                continue
            checked += 1

            if path.startswith("/"):
                # An absolute internal link belongs to the static marketing site.
                target = ROOT / path.lstrip("/")
                if target.exists() or target.with_suffix(".html").exists():
                    continue
                failures.append(f"{page.name}: {reference} is neither a site page nor a canonical app URL")
                continue

            target = (page.parent / path).resolve()
            if not target.exists():
                failures.append(f"{page.name}: {reference}")

    # Old bookmarks may still use seros.dev routes. Keep them as ordinary redirects
    # and ensure every destination is on the canonical app origin with the same path.
    for source, destination, _rx in matchers:
        expected = APP_ORIGIN + source.replace("(.*)", "$1")
        if destination != expected:
            failures.append(f"vercel.json: {source} must redirect to {expected}, got {destination}")

    print(f"checked {checked} HTML href/src references")
    if matchers:
        print("legacy app paths redirect to app.seros.dev: "
              + ", ".join(src for src, _dest, _rx in matchers))
    if failures:
        print("BROKEN REFERENCES:")
        for failure in failures:
            print(f"  {failure}")
        raise SystemExit(1)
    print("every reference resolves to a site page or canonical app URL")


if __name__ == "__main__":
    main()
