"""Generate lightweight posters without changing the source videos.
Usage: python scripts/generate-video-posters.py --ffmpeg /path/to/ffmpeg
"""
import argparse
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
public = Path(__file__).resolve().parents[1] / 'public'
for video in sorted((public / 'videos').rglob('*.mp4')):
    poster = (public / 'posters' / video.relative_to(public / 'videos')).with_suffix('.jpg')
    poster.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
                    '-ss', '0.2', '-i', str(video), '-frames:v', '1',
                    '-vf', 'scale=960:-2', '-q:v', '4', str(poster)], check=True)
print('Generated posters for all videos.')
