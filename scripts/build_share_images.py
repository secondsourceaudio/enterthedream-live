"""Render social cards from the site's original artwork and type.

Requires Python Playwright and Chromium. No remote assets or services are used.
"""
import base64
import html
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CARDS = [
    ('second-source', 'images/brand/src-icon-512.png', 'SECOND SOURCE', 'INDEPENDENT RECORD LABEL',
     'Music, images and audiovisual experiments.', 'Oslo, Norway'),
    ('drip', 'images/drip_cover_front_2.webp', 'DRIP', 'MARTIN SOLLI / SRC001',
     'Image / sound / interaction', 'SECOND SOURCE'),
    ('flower', 'images/gallery/flower_4.webp', 'FLOWER', 'SOURCES / 01',
     'An image in fluid motion.', 'SECOND SOURCE'),
    ('merch', 'images/brand/src-icon-512.png', 'MERCH', 'SECOND SOURCE',
     'By TROMSØ PURIST SHOP', 'Design mockups / Final products may change.'),
]


def data_url(path, mime):
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def main():
    font = data_url(ROOT / 'fonts/microgrammanormal.ttf', 'font/ttf')
    output = ROOT / 'images/share'
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                                    args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=1)
        for name, artwork, title, label, copy, note in CARDS:
            image = data_url(ROOT / artwork, 'image/png' if artwork.endswith('.png') else 'image/webp')
            page.set_content(f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>
                @font-face {{ font-family: Microgramma; src: url("{font}"); }}
                * {{ box-sizing: border-box; }}
                body {{ margin: 0; width: 1200px; height: 630px; background: #050505; color: #f4f4f4; }}
                main {{ display: grid; grid-template-columns: 480px 1fr; gap: 64px; padding: 75px 64px; height: 100%; }}
                img {{ width: 480px; height: 480px; object-fit: contain; }}
                section {{ display: flex; flex-direction: column; justify-content: center; min-width: 0; position: relative; }}
                .label {{ margin: 0 0 24px; color: #aaa; font: 14px/1.7 Microgramma, Arial; letter-spacing: 2px; }}
                h1 {{ margin: 0; font: 36px/1.25 Microgramma, Arial; letter-spacing: 3px; }}
                .copy {{ margin: 28px 0 0; font: 22px/1.6 Arial; color: #ddd; }}
                .note {{ margin: 12px 0 0; font: 17px/1.6 Arial; color: #aaa; }}
                .domain {{ position: absolute; bottom: 6px; margin: 0; font: 14px/1.5 Microgramma, Arial; letter-spacing: 1px; color: #aaa; }}
            </style></head><body><main><img src="{image}" alt=""><section>
                <p class="label">{html.escape(label)}</p><h1>{html.escape(title)}</h1>
                <p class="copy">{html.escape(copy)}</p><p class="note">{html.escape(note)}</p>
                <p class="domain">WWW.ENTERTHEDREAM.ORG</p>
            </section></main></body></html>''')
            page.evaluate('document.fonts.ready')
            page.locator('img').evaluate('image => image.decode()')
            target = output / f'{name}.png'
            page.screenshot(path=str(target))
            target.chmod(0o644)
            print(f'Built images/share/{name}.png')
        browser.close()


if __name__ == '__main__':
    main()
