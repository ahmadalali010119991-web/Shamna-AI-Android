#!/usr/bin/env python3
"""Create a unique, short, exceptionally quiet two-tone chime.
No external sound files, music or copyrighted recordings. Standard library only.
"""
import math
import random
import struct
import wave
from pathlib import Path

random.seed(402)
RATE = 24000
DURATION = 1.05
N = round(DURATION * RATE)
samples = [0.0] * N
notes = [
    # start, note Hz, loudness, exponential ring, soft bell partials
    (0.03, 523.25, 0.078, 6.2),
    (0.24, 659.25, 0.064, 6.6),
    (0.46, 783.99, 0.048, 7.2),
]
for start, frequency, level, decay in notes:
    first = int(start * RATE)
    for i in range(first, N):
        t = (i-first)/RATE
        attack = min(1.0,t/0.022)
        envelope = attack*math.exp(-decay*t)
        sound = (
            math.sin(2*math.pi*frequency*t)*0.83
            + math.sin(2*math.pi*frequency*2*t)*0.11
            + math.sin(2*math.pi*frequency*3*t)*0.06
        )
        samples[i] += level*envelope*sound
# Subtle bell-room reflection, still very quiet
for delay, feedback in ((0.10, 0.16), (0.18, 0.08)):
    shift=int(delay*RATE)
    for i in range(shift,N):
        samples[i] += feedback * samples[i-shift]
# Soft fade-out; sound volume is intentionally low
for i in range(N):
    t=i/RATE
    samples[i] *= min(1.0, max(0.0,(DURATION-t)/0.16))
maximum=max(abs(x) for x in samples)
assert 0.015 < maximum < 0.17,maximum
pcm=b"".join(struct.pack("<h",int(max(-1,min(1,x))*32767)) for x in samples)
out=Path("shamna_heritage_chime.wav")
with wave.open(str(out),"wb") as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE)
    w.writeframes(pcm)
print(f"Created original soft WAV {len(pcm)} PCM bytes, peak {maximum:.4f}.")
