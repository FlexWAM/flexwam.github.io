"""Extract task selector thumbnails from representative evaluation rollouts."""
import argparse
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
public = Path(__file__).resolve().parents[1] / 'public'
out = public / 'images' / 'tasks'
out.mkdir(parents=True, exist_ok=True)
for task in ['cable', 'peg-l', 'peg-round', 'pencil', 'conveyor']:
    subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
                    '-ss', '4', '-i', str(public / 'videos' / 'evaluation' / f'{task}-wan.mp4'),
                    '-frames:v', '1', '-vf', 'crop=iw*0.75:ih*0.75:iw*0.125:ih*0.1,scale=640:360',
                    '-q:v', '3', str(out / f'{task}.jpg')], check=True)
