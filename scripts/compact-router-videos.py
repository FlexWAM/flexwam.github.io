"""Shorten router camera panels by 20%, preserving chart dimensions and timing.

Usage: python scripts/compact-router-videos.py --ffmpeg /path/to/ffmpeg
Original 960x1488: 1152 px of cameras + 336 px chart.
Compact 960x1258: 922 px of cameras + the same 336 px chart.
The even camera height rounds 80% of 1152 for H.264 compatibility.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
public = Path(__file__).resolve().parents[1] / 'public'
source_dir = public / 'videos/router'
output_dir = source_dir / 'compact'
poster_dir = public / 'posters/router/compact'
output_dir.mkdir(parents=True, exist_ok=True)
poster_dir.mkdir(parents=True, exist_ok=True)


def render(source):
    output = output_dir / source.name
    temporary = output.with_suffix('.partial.mp4')
    filters = (
        '[0:v]split=2[cameras][chart];'
        '[cameras]crop=960:1152:0:0,scale=960:922:flags=lanczos,setsar=1[small];'
        '[chart]crop=960:336:0:1152,setsar=1[plot];'
        '[small][plot]vstack=inputs=2[v]'
    )
    subprocess.run([
        args.ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-i', str(source),
        '-filter_complex', filters, '-map', '[v]', '-map', '0:a?',
        '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-threads', '3',
        '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart',
        str(temporary),
    ], check=True)
    temporary.replace(output)
    subprocess.run([
        args.ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-ss', '0.2',
        '-i', str(output), '-frames:v', '1', '-q:v', '2',
        str(poster_dir / (source.stem + '.jpg')),
    ], check=True)
    print(f'{source.name}: 960x1258; camera height -20%; chart remains 960x336', flush=True)


with ThreadPoolExecutor(max_workers=2) as executor:
    list(executor.map(render, sorted(source_dir.glob('*.mp4'))))
