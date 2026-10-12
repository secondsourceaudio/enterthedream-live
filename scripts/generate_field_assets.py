"""Create the authored vector fallback and periodic tone loop, entirely locally."""
from pathlib import Path
import math
import struct
import subprocess
import tempfile
import wave

root = Path(__file__).resolve().parents[1]
folder = root / 'images/experiments'
folder.mkdir(exist_ok=True)
columns, rows = 220, 138
aspect = 1.6
values = []
for y in range(rows + 1):
    py = .5 - y / rows
    row = []
    for x in range(columns + 1):
        px = (x / columns - .5) * aspect
        a = math.hypot(px + .28, py)
        b = math.hypot(px - .272, py - .02)
        row.append((math.sin(a * 23) + math.sin(b * 23)) * 3)
    values.append(row)

paths = []
for level in range(-5, 6):
    segments = []
    for y in range(rows):
        for x in range(columns):
            corners = [(x, y, values[y][x]), (x+1, y, values[y][x+1]),
                       (x+1, y+1, values[y+1][x+1]), (x, y+1, values[y+1][x])]
            intersections = []
            for a, b in zip(corners, corners[1:] + corners[:1]):
                if (a[2] < level) != (b[2] < level):
                    amount = (level-a[2]) / (b[2]-a[2])
                    intersections.append(((a[0]+amount*(b[0]-a[0]))*960/columns,
                                          (a[1]+amount*(b[1]-a[1]))*600/rows))
            for index in range(0, len(intersections)-1, 2):
                a, b = intersections[index:index+2]
                segments.append(f'M{a[0]:.1f},{a[1]:.1f}L{b[0]:.1f},{b[1]:.1f}')
    paths.append('<path d="' + ''.join(segments) + '"/>')
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600">
<title>Interference — two overlapping wave fields</title>
<defs><radialGradient id="fade"><stop offset="0" stop-color="white"/><stop offset=".65" stop-color="white"/><stop offset="1" stop-color="black"/></radialGradient><mask id="vignette"><rect width="960" height="600" fill="url(#fade)"/></mask></defs>
<rect width="960" height="600" fill="#07090b"/>
<g fill="none" stroke="#bac7cf" stroke-width=".75" opacity=".85" mask="url(#vignette)">
''' + '\n'.join(paths) + '\n</g></svg>\n'
(folder / 'interference.svg').write_text(svg)

# All carriers and modulation periods repeat exactly after 32 seconds.
# No samples, external recordings, or network calls are used.
rate, duration = 44100, 32
with tempfile.TemporaryDirectory() as temporary:
    wav = Path(temporary) / 'tone-field.wav'
    with wave.open(str(wav), 'wb') as output:
        output.setnchannels(2); output.setsampwidth(2); output.setframerate(rate)
        buffer = bytearray()
        for index in range(rate * duration):
            t = index / rate
            slow = 2 * math.pi * t / duration
            left = ((.22 + .065*math.sin(slow)) * math.sin(2*math.pi*87.3125*t)
                    + (.095 + .025*math.cos(slow*2)) * math.sin(2*math.pi*130.9375*t)
                    + .035*math.sin(2*math.pi*174.625*t + .3*math.sin(slow)))
            right = ((.22 + .065*math.sin(slow+.4)) * math.sin(2*math.pi*87.3125*t)
                     + (.095 + .025*math.cos(slow*2+.3)) * math.sin(2*math.pi*130.9375*t)
                     + .035*math.sin(2*math.pi*174.625*t - .3*math.sin(slow)))
            buffer.extend(struct.pack('<hh', round(left*32767), round(right*32767)))
            if len(buffer) >= 65536:
                output.writeframes(buffer); buffer.clear()
        output.writeframes(buffer)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
                    '-codec:a', 'libmp3lame', '-q:a', '5', '-map_metadata', '-1',
                    str(root / 'audio/tone-field.mp3')], check=True)
print('Created vector fallback and original 32-second tone loop.')
