"""Create the original periodic Tone Field loop, entirely locally."""
from pathlib import Path
import math
import struct
import subprocess
import tempfile
import wave

root = Path(__file__).resolve().parents[1]
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
print('Created original 32-second tone loop.')
