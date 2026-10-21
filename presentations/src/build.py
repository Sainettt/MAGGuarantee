#!/usr/bin/env python3
"""Generator prezentacji MAGGuarantee (HTML -> PDF).

Uruchomienie (z katalogu presentations/):
    python3 src/build.py            # generuje src/html/*.html i *.pdf w presentations/
    python3 src/build.py --html     # tylko HTML (bez PDF)

PDF renderuje lokalny Google Chrome w trybie headless (--print-to-pdf).
Treść slajdów jest w plikach src/deck_*.py, wspólny wygląd — w tym pliku.
"""
from __future__ import annotations

import html
import importlib
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # presentations/
SRC = ROOT / "src"
OUT_HTML = SRC / "html"
ASSETS = ROOT / "assets"

DECKS = [
    "deck_00_wprowadzenie",
    "deck_01_przewoznik",
    "deck_02_opiekun",
    "deck_03_opiekun_wnioskow",
    "deck_04_weryfikator",
    "deck_05_eksport",
    "deck_06_planista",
    "deck_07_dyspozytor",
    "deck_08_administrator",
]

CSS = r"""
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@500&display=swap');
:root{
  --red:#dc2626; --red-d:#991b1b; --red-50:#fef2f2; --ink:#1a1a1a; --ink-2:#404040; --muted:#6b7280;
  --line:#e5e7eb; --bg:#f5f5f5; --card:#ffffff; --green:#16a34a; --green-50:#f0fdf4; --amber:#d97706; --amber-50:#fffbeb;
  --blue:#2563eb; --blue-50:#eff6ff; --grey-50:#f3f4f6;
}
@page{ size:1280px 720px; margin:0 }
*{ box-sizing:border-box }
html,body{ margin:0; padding:0; background:#888 }
body{ font-family:'DM Sans',system-ui,sans-serif; color:var(--ink); -webkit-print-color-adjust:exact; print-color-adjust:exact }
.slide{ width:1280px; height:720px; position:relative; overflow:hidden; background:#fff; page-break-after:always; break-after:page;
  padding:46px 56px 54px; display:flex; flex-direction:column }
@media screen{ .slide{ margin:0 auto 24px; box-shadow:0 4px 24px rgba(0,0,0,.25) } body{ padding:24px 0 } }
.slide::before{ content:''; position:absolute; left:0; top:0; width:100%; height:6px; background:var(--red) }
.kicker{ font-size:13px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--red); margin-bottom:6px }
h1{ font-size:34px; line-height:1.15; margin:0 0 18px; font-weight:700; letter-spacing:-.01em }
h2{ font-size:19px; margin:0 0 8px; font-weight:700 }
h3{ font-size:16px; margin:12px 0 4px; font-weight:700; color:var(--ink-2); text-transform:uppercase; letter-spacing:.06em }
p{ margin:0 0 10px; font-size:19px; line-height:1.45; color:var(--ink-2) }
ul,ol{ margin:0 0 8px; padding-left:22px } li{ font-size:18.5px; line-height:1.4; margin:0 0 6px; color:var(--ink-2) }
li li{ font-size:16.5px; margin-bottom:3px }
b,strong{ color:var(--ink) }
code,.mono{ font-family:'JetBrains Mono',monospace; font-size:.88em; background:var(--grey-50); padding:1px 5px; border-radius:4px; color:var(--ink) }
.ui{ font-weight:600; color:var(--ink); background:var(--red-50); border:1px solid #fecaca; padding:0 6px; border-radius:5px; white-space:nowrap }
.body{ flex:1; min-height:0; display:flex; gap:30px }
.col{ flex:1; min-width:0 } .col-2{ flex:2; min-width:0 } .col-3{ flex:3; min-width:0 }
.shot{ flex:1.75; min-width:0; display:flex; align-items:flex-start; justify-content:center }
.shot.tall{ flex:1.2 }
.shot img{ max-width:100%; max-height:100%; border:1px solid var(--line); border-radius:10px; box-shadow:0 6px 22px rgba(0,0,0,.10); object-fit:contain; background:#fff }
.side{ flex:1; min-width:0; overflow:hidden }
.full{ flex:1; min-height:0; display:flex; justify-content:center; align-items:flex-start }
.full img{ max-width:100%; max-height:100%; border:1px solid var(--line); border-radius:10px; box-shadow:0 6px 22px rgba(0,0,0,.10) }
.caption{ font-size:16px; color:var(--muted); margin-top:10px }
.footer{ position:absolute; left:56px; right:56px; bottom:18px; display:flex; align-items:center; gap:14px; font-size:12.5px; color:var(--muted) }
.footer img{ height:20px } .footer .sp{ flex:1 } .footer .pg{ font-weight:600; color:var(--ink-2) }
table{ width:100%; border-collapse:collapse; font-size:17.5px }
th{ text-align:left; font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); font-weight:700; padding:7px 10px; border-bottom:2px solid var(--ink); background:#fff }
td{ padding:9px 11px; border-bottom:1px solid var(--line); vertical-align:top; line-height:1.35; color:var(--ink-2) }
td:first-child{ font-weight:600; color:var(--ink) }
table.compact td{ padding:6px 10px; font-size:15.5px } table.compact th{ padding:5px 9px }
.req{ display:inline-block; font-size:12.5px; font-weight:700; padding:1px 7px; border-radius:999px; background:var(--red); color:#fff; letter-spacing:.04em }
.opt{ display:inline-block; font-size:12.5px; font-weight:700; padding:1px 7px; border-radius:999px; background:var(--grey-50); color:var(--muted); border:1px solid var(--line) }
.cond{ display:inline-block; font-size:12.5px; font-weight:700; padding:1px 7px; border-radius:999px; background:var(--amber-50); color:var(--amber); border:1px solid #fde68a }
.ro{ display:inline-block; font-size:12.5px; font-weight:700; padding:1px 7px; border-radius:999px; background:var(--blue-50); color:var(--blue); border:1px solid #bfdbfe }
.pill{ display:inline-block; font-size:14px; font-weight:700; padding:2px 9px; border-radius:999px; white-space:nowrap }
.p-blue{ background:var(--blue-50); color:var(--blue) } .p-amber{ background:var(--amber-50); color:var(--amber) }
.p-green{ background:var(--green-50); color:var(--green) } .p-red{ background:var(--red-50); color:var(--red) } .p-grey{ background:var(--grey-50); color:var(--muted) }
.box{ border:1px solid var(--line); border-radius:12px; padding:14px 18px; background:#fff; margin-bottom:12px }
.box.tip{ background:var(--green-50); border-color:#bbf7d0 } .box.warn{ background:var(--amber-50); border-color:#fde68a } .box.key{ background:var(--red-50); border-color:#fecaca }
.box.info{ background:var(--blue-50); border-color:#bfdbfe }
.box h2{ font-size:18px; margin-bottom:6px } .box p,.box li{ font-size:17px } .box p:last-child,.box ul:last-child{ margin-bottom:0 }
.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:14px 22px } .grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px 18px }
.grid4{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px }
.stat{ border:1px solid var(--line); border-radius:12px; padding:14px 16px } .stat .n{ font-size:30px; font-weight:700; color:var(--red) } .stat .t{ font-size:14px; color:var(--ink-2) }
.steps{ counter-reset:s; list-style:none; padding:0 } .steps>li{ counter-increment:s; position:relative; padding-left:42px; margin-bottom:10px }
.steps>li::before{ content:counter(s); position:absolute; left:0; top:0; width:28px; height:28px; border-radius:50%; background:var(--red); color:#fff; font-weight:700; font-size:14px; display:flex; align-items:center; justify-content:center }
.flow{ display:flex; align-items:stretch; gap:0; margin:6px 0 }
.flow .st{ flex:1; border:1.5px solid var(--line); border-radius:12px; padding:12px 12px; background:#fff; position:relative }
.flow .st .who{ font-size:11.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--red) }
.flow .st .what{ font-size:16.5px; font-weight:600; color:var(--ink); margin-top:4px; line-height:1.3 } .flow .st .det{ font-size:14.5px; color:var(--muted); margin-top:4px; line-height:1.3 }
.flow .ar{ width:26px; display:flex; align-items:center; justify-content:center; color:var(--red); font-size:22px; font-weight:700 }
.flow .st.hl{ border-color:var(--red); background:var(--red-50) }
.cover{ padding:0; flex-direction:row }
.cover .l{ width:470px; background:var(--red); color:#fff; padding:64px 52px; display:flex; flex-direction:column; justify-content:space-between }
.cover .l .big{ font-size:96px; line-height:1; font-weight:700; opacity:.95 }
.cover .l .lbl{ font-size:15px; letter-spacing:.16em; text-transform:uppercase; font-weight:700; opacity:.85 }
.cover .r{ flex:1; padding:70px 64px; display:flex; flex-direction:column; justify-content:center }
.cover .r img{ height:54px; align-self:flex-start; margin-bottom:46px }
.cover h1{ font-size:48px; margin-bottom:16px } .cover .sub{ font-size:21px; color:var(--ink-2); line-height:1.45; max-width:640px }
.cover .meta{ margin-top:40px; font-size:14px; color:var(--muted) }
.section{ background:var(--ink); color:#fff } .section::before{ background:var(--red) }
.section .inner{ flex:1; display:flex; flex-direction:column; justify-content:center }
.section .num{ font-size:120px; font-weight:700; color:var(--red); line-height:1 } .section h1{ color:#fff; font-size:46px; margin-top:12px }
.section p{ color:#d4d4d4; font-size:20px; max-width:880px }
.section .footer{ color:#a3a3a3 }
.toc{ columns:2; column-gap:40px } .toc li{ font-size:19px; margin-bottom:8px; break-inside:avoid }
.small{ font-size:15px !important } .muted{ color:var(--muted) }
.callout-num{ display:inline-flex; width:22px; height:22px; border-radius:50%; background:var(--red); color:#fff; font-size:12px; font-weight:700; align-items:center; justify-content:center; margin-right:6px; vertical-align:1px }
"""


def esc(s: str) -> str:
    return html.escape(s, quote=True)


class Deck:
    """Builder slajdów jednej prezentacji."""

    def __init__(self, slug: str, title: str, short: str):
        self.slug, self.title, self.short = slug, title, short
        self.slides: list[str] = []

    # ── helpers ────────────────────────────────────────────
    def _wrap(self, inner: str, cls: str = "") -> None:
        self.slides.append(f'<section class="slide {cls}">{inner}__FOOTER__</section>')

    @staticmethod
    def _head(title: str, kicker: str | None) -> str:
        k = f'<div class="kicker">{kicker}</div>' if kicker else ""
        return f"{k}<h1>{title}</h1>"

    @staticmethod
    def img(name: str) -> str:
        return f'<img src="../../assets/{name}.jpg" alt="">'

    # ── layouts ────────────────────────────────────────────
    def cover(self, big: str, label: str, title: str, sub: str, meta: str = "") -> None:
        self.slides.append(
            f'<section class="slide cover"><div class="l"><div class="lbl">{label}</div><div class="big">{big}</div>'
            f'<div class="lbl">MAGGuarantee · instrukcja</div></div>'
            f'<div class="r"><img src="../../assets/logo.png" alt=""><h1>{title}</h1><div class="sub">{sub}</div>'
            f'<div class="meta">{meta or "Wersja na podstawie aplikacji z października 2026 · dane na zrzutach są fikcyjne (środowisko demo)"}</div></div></section>'
        )

    def section(self, num: str, title: str, text: str = "") -> None:
        self._wrap(f'<div class="inner"><div class="num">{num}</div><h1>{title}</h1><p>{text}</p></div>', "section")

    def text(self, title: str, body: str, kicker: str | None = None) -> None:
        self._wrap(self._head(title, kicker) + f'<div class="body"><div class="col">{body}</div></div>')

    def cols(self, title: str, *columns: str, kicker: str | None = None) -> None:
        inner = "".join(f'<div class="col">{c}</div>' for c in columns)
        self._wrap(self._head(title, kicker) + f'<div class="body">{inner}</div>')

    def shot(self, title: str, image: str, side: str, kicker: str | None = None, tall: bool = False, right: bool = False) -> None:
        shot = f'<div class="shot{" tall" if tall else ""}">{self.img(image)}</div>'
        sidebox = f'<div class="side">{side}</div>'
        body = sidebox + shot if right else shot + sidebox
        self._wrap(self._head(title, kicker) + f'<div class="body">{body}</div>')

    def full(self, title: str, image: str, caption: str = "", kicker: str | None = None) -> None:
        cap = f'<div class="caption">{caption}</div>' if caption else ""
        self._wrap(self._head(title, kicker) + f'<div class="full">{self.img(image)}</div>{cap}')

    def two(self, title: str, img1: str, img2: str, side: str = "", kicker: str | None = None) -> None:
        s = f'<div class="side" style="flex:.8">{side}</div>' if side else ""
        self._wrap(self._head(title, kicker) +
                   f'<div class="body"><div class="shot" style="flex:1">{self.img(img1)}</div>'
                   f'<div class="shot" style="flex:1">{self.img(img2)}</div>{s}</div>')

    def table(self, title: str, headers: list[str], rows: list[list[str]], intro: str = "", note: str = "",
              kicker: str | None = None, compact: bool = False, image: str | None = None, widths: list[int] | None = None) -> None:
        cg = ""
        if widths:
            cg = "<colgroup>" + "".join(f'<col style="width:{w}%">' for w in widths) + "</colgroup>"
        th = "".join(f"<th>{h}</th>" for h in headers)
        tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
        t = f'<table class="{"compact" if compact else ""}">{cg}<thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>'
        i = f"<p>{intro}</p>" if intro else ""
        n = f'<div class="caption">{note}</div>' if note else ""
        if image:
            body = f'<div class="body"><div class="col-3">{i}{t}{n}</div><div class="shot tall" style="flex:2">{self.img(image)}</div></div>'
        else:
            body = f'<div class="body"><div class="col">{i}{t}{n}</div></div>'
        self._wrap(self._head(title, kicker) + body)

    # ── output ─────────────────────────────────────────────
    def render(self) -> str:
        total = len(self.slides)
        out = []
        for i, s in enumerate(self.slides, 1):
            foot = (f'<div class="footer"><img src="../../assets/logo.png" alt=""><span>MAGGuarantee · {esc(self.short)}</span>'
                    f'<span class="sp"></span><span class="pg">{i} / {total}</span></div>')
            out.append(s.replace("__FOOTER__", foot))
        return (f'<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>{esc(self.title)}</title>'
                f'<style>{CSS}</style></head><body>{"".join(out)}</body></html>')


# Wspólne skróty do tabel pól
REQ = '<span class="req">TAK</span>'
OPT = '<span class="opt">nie</span>'
COND = lambda t="warunkowo": f'<span class="cond">{t}</span>'  # noqa: E731
RO = '<span class="ro">tylko odczyt</span>'


def ui(t: str) -> str:
    """Etykieta z interfejsu (przycisk, pole, zakładka)."""
    return f'<span class="ui">{t}</span>'


def pill(t: str, tone: str) -> str:
    return f'<span class="pill p-{tone}">{t}</span>'


def chrome() -> str:
    for c in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        p = shutil.which(c)
        if p:
            return p
    sys.exit("Nie znaleziono Chrome/Chromium — zainstaluj go albo użyj --html")


def main() -> None:
    only_html = "--html" in sys.argv
    sys.path.insert(0, str(SRC))
    OUT_HTML.mkdir(parents=True, exist_ok=True)
    wanted=[a for a in sys.argv[1:] if not a.startswith('--')]
    for mod_name in DECKS:
        if wanted and not any(w in mod_name for w in wanted):
            continue
        mod = importlib.import_module(mod_name)
        deck: Deck = mod.build()
        html_path = OUT_HTML / f"{deck.slug}.html"
        html_path.write_text(deck.render(), encoding="utf-8")
        print(f"HTML  {html_path.relative_to(ROOT)}  ({len(deck.slides)} slajdów)")
        if only_html:
            continue
        pdf_path = ROOT / f"{deck.slug}.pdf"
        subprocess.run([chrome(), "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
                        "--run-all-compositor-stages-before-draw", "--virtual-time-budget=15000",
                        f"--print-to-pdf={pdf_path}", html_path.as_uri()],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"PDF   {pdf_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
