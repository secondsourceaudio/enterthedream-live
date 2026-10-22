"""Build a compact file preview with embedded visual assets.

Audio streams from the existing public GitHub file only after Play is selected.
Run from any directory: python3 scripts/build_preview.py
"""
import base64
import mimetypes
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = 'https://www.enterthedream.org/'
AUDIO = 'https://raw.githubusercontent.com/secondsourceaudio/enterthedream-live/main/audio/sage-counsel.mp3'


def embed(path):
    kind = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return f'data:{kind};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def asset(path):
    return ROOT / path.split('?')[0].lstrip('/')


def stylesheet(match):
    path = asset(match.group(1))
    css = path.read_text(encoding='utf-8')
    css = re.sub(r'url\(["\']?([^"\')]+)["\']?\)',
        lambda m: 'url("' + embed(path.parent / m.group(1)) + '")', css)
    return '<style>' + css + '</style>'


def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    scripts = re.findall(r'<script[^>]+src="([^"]+)"[^>]*></script>', html)
    html = re.sub(r'<script[^>]+src="[^"]+"[^>]*></script>', '', html)
    html = re.sub(r'<link rel="preload"[^>]+>', '', html)
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', stylesheet, html)
    html = re.sub(r'(<link rel="(?:icon|apple-touch-icon)"[^>]*href=")([^"]+)(")',
        lambda m: m.group(1) + embed(asset(m.group(2))) + m.group(3), html)
    html = re.sub(r'(<img[^>]*?)src="([^"]+)"',
        lambda m: m.group(1) + 'src="' + embed(asset(m.group(2))) + '"', html)
    html = html.replace('/audio/sage-counsel.mp3', AUDIO)
    html = html.replace('<audio ', '<audio crossorigin="anonymous" ')
    for route in ['', 'releases/', 'merch/', 'sources/', 'about/']:
        html = html.replace(f'href="/{route}"', f'href="{LIVE}{route}"')
    html = html.replace('<title>SECOND SOURCE</title>',
        '<title>SECOND SOURCE — DRIP PREVIEW</title>\n<meta name="robots" content="noindex, nofollow">')
    inline = ''
    for script in scripts:
        source = asset(script).read_text(encoding='utf-8')
        inline += '<script>' + source.replace('</script', '<\\/script') + '</script>'
    html = html.replace('</body>', inline + '</body>')
    html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
    output = ROOT / 'preview.html'
    output.write_text(html, encoding='utf-8')
    output.chmod(0o644)
    print(f'Built preview.html: {output.stat().st_size:,} bytes; no relative visual assets.')


if __name__ == '__main__':
    main()
