#!/usr/bin/env python3
"""Render the Markdown legal pack in ../legal into themed HTML pages.

Usage:  python3 tools/build.py            # render every mapped document
        python3 tools/build.py --check    # render nothing, report unresolved placeholders

Placeholders written as [[TOKEN]] in the Markdown are substituted from site.json.
If site.json says draft=true, every generated page carries a visible draft banner.
The build FAILS if a placeholder has no value and draft mode is off, so an
unreviewed document can never be published silently.
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent      # .../seros/website
LEGAL = ROOT.parent / "legal"
CFG = json.loads((ROOT / "site.json").read_text())
DRAFT = bool(CFG.get("draft", True))

# markdown source -> output html file, page title, meta description
PAGES = [
    ("PRIVACY-POLICY.md",           "privacy.html",        "Privacy Policy",
     "How Seros, LLC collects, uses, shares, and protects personal data."),
    ("TERMS-OF-SERVICE.md",         "terms.html",          "Terms of Service",
     "The agreement between Seros, LLC and customers of the Seros service."),
    ("ACCEPTABLE-USE-POLICY.md",    "acceptable-use.html", "Acceptable Use Policy",
     "What you may and may not do with the Seros service."),
    ("DPA.md",                      "dpa.html",            "Data Processing Addendum",
     "Seros, LLC data processing addendum for customers subject to GDPR, UK GDPR, or US state privacy laws."),
    ("SUBPROCESSORS.md",            "subprocessors.html",  "Subprocessors",
     "The third parties Seros, LLC uses to deliver the service, and how changes are announced."),
    ("COOKIE-POLICY.md",            "cookies.html",        "Cookie Policy",
     "Cookies and similar technologies used by Seros, LLC."),
    ("SECURITY.md",                 "security.html",       "Security",
     "How Seros, LLC protects data, and how to report a vulnerability."),
    ("REFUND-AND-BILLING-POLICY.md","billing.html",        "Billing and Refunds",
     "Trials, renewals, cancellation, and refunds for Seros subscriptions."),
    ("AI-DISCLOSURE.md",            "ai.html",             "How Seros uses AI",
     "Plain-language explanation of how Seros uses AI models and what happens to your data."),
]

NAV = [("Product", "/#product"), ("How it works", "/#how"), ("Pricing", "/pricing.html"),
       ("Security", "/security.html"), ("Contact", "/#contact")]

TOKEN = re.compile(r"\[\[([A-Z0-9_]+)\]\]")


def substitute(text):
    missing = set()

    def repl(m):
        key = m.group(1)
        val = CFG.get(key)
        if val in (None, "", "TBD", "TBD — fill before publishing"):
            missing.add(key)
            return f'<span class="todo">[{key}]</span>' if not DRAFT else f"[[{key}]]"
        return str(val)

    return TOKEN.sub(repl, text), missing


def shell(title, desc, canonical, body):
    nav = "\n        ".join(f'<a href="{h}">{t}</a>' for t, h in NAV)
    banner = ""
    if DRAFT:
        banner = ('<p class="banner"><strong>Draft.</strong> This document has not yet been '
                  'reviewed by counsel and is not in force. It is published here for review only. '
                  'Bracketed tokens mark facts that still have to be filled in.</p>')
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — Seros, LLC</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{CFG['WEBSITE_URL']}{canonical}">
<meta name="robots" content="{'noindex' if DRAFT else 'index,follow'}">
<meta property="og:title" content="{title} — Seros, LLC">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{CFG['WEBSITE_URL']}/assets/og-image.jpg">
<link rel="icon" href="/assets/icon-192.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta name="theme-color" content="#EDE7DE">
<link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
<header class="site">
  <div class="wrap">
    <a class="brand" href="/"><img src="/assets/icon-192.png" alt=""> Seros, LLC</a>
    <nav class="site">
        {nav}
    </nav>
  </div>
</header>
<main class="wrap doc">
{banner}
{body}
</main>
<footer class="site">
  <div class="wrap">
    <p class="fineprint">&copy; 2026 Seros, LLC &middot;
      <a href="/privacy.html">Privacy</a> &middot; <a href="/terms.html">Terms</a> &middot;
      <a href="/acceptable-use.html">Acceptable use</a> &middot; <a href="/dpa.html">DPA</a> &middot;
      <a href="/subprocessors.html">Subprocessors</a> &middot; <a href="/security.html">Security</a><br>
      Nothing on this site is legal, tax, or professional advice.</p>
  </div>
</footer>
</body>
</html>
"""


def main():
    check_only = "--check" in sys.argv
    try:
        import markdown
    except ImportError:
        sys.exit("markdown package required: pip install markdown")

    all_missing, built = {}, []
    for src, out, title, desc in PAGES:
        p = LEGAL / src
        if not p.exists():
            print(f"skip (missing source): {src}")
            continue
        text, missing = substitute(p.read_text())
        if missing:
            all_missing[src] = sorted(missing)
        html = markdown.markdown(text, extensions=["tables", "toc", "sane_lists", "attr_list"])
        if not check_only:
            (ROOT / out).write_text(shell(title, desc, "/" + out, html))
        built.append(out)

    print(("checked: " if check_only else "built: ") + ", ".join(built))
    if all_missing:
        print("\nunresolved placeholders (fill these in site.json):")
        for src, keys in all_missing.items():
            print(f"  {src}: {', '.join(keys)}")
        if not DRAFT:
            sys.exit("refusing to publish with unresolved placeholders while draft=false")


if __name__ == "__main__":
    main()
