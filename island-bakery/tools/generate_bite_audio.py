#!/usr/bin/env python3
import math
import struct
import wave
from pathlib import Path


output = Path(__file__).resolve().parents[1] / "package" / "res" / "audio" / "bite.wav"
output.parent.mkdir(parents=True, exist_ok=True)
sample_rate = 22050
duration = 0.22
with wave.open(str(output), "wb") as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(sample_rate)
    frames = []
    for index in range(int(sample_rate * duration)):
        time = index / sample_rate
        envelope = min(1, time * 80) * max(0, 1 - time / duration)
        frequency = 880 - time * 1200
        sample = math.sin(2 * math.pi * frequency * time) * envelope * 0.32
        frames.append(struct.pack("<h", int(sample * 32767)))
    audio.writeframes(b"".join(frames))
print(output)
