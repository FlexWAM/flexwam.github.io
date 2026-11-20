"""Import all evaluation compilations without re-encoding or retiming them.

Usage: python scripts/import-evaluation-videos.py --ffmpeg /path/to/ffmpeg
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg')
parser.add_argument('--source', type=Path)
args = parser.parse_args()
project = Path(__file__).resolve().parents[1]
source_root = args.source or project.parent / 'Flexwam_materials/all_evaluation'
videos = project / 'public/videos/evaluation'
posters = project / 'public/posters/evaluation'
videos.mkdir(parents=True, exist_ok=True)
posters.mkdir(parents=True, exist_ok=True)

tasks = [
    ('cable', 'flexiv/cable', 'cable_insertion'),
    ('peg-l', 'flexiv/L', 'l_shape_insertion'),
    ('peg-round', 'flexiv/O', 'o_shape_insertion'),
    ('pencil', 'piper/penbox', 'pencil_case_packing'),
    ('conveyor', 'piper/conveyor', 'conveyor_sorting'),
]
methods = [
    ('wan', 'FlexWAM_wan'), ('lingbot', 'FlexWAM_lingbot'),
    ('pi', 'pi05'), ('fastwam', 'FastWAM'),
    ('openwam', 'OpenWAM'), ('lawam', 'LaWAM'),
]
# Explicit replacement supplied for the LingBot L-shaped peg evaluation.
source_overrides = {
    ('peg-l', 'lingbot'): 'flexiv/L/FlexWAM_lingbot.mp4',
}
jobs = [(source_root / source_overrides.get(
            (task, method), f'{folder}/{prefix}_{suffix}.mp4'), f'{task}-{method}')
        for task, folder, suffix in tasks for method, prefix in methods]
for source, _ in jobs:
    if not source.is_file():
        raise FileNotFoundError(source)


def import_video(job):
    source, name = job
    target = videos / f'{name}.mp4'
    temporary = videos / f'{name}.partial.mp4'
    # Copy encoded streams exactly; place MP4 metadata first for web playback.
    subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', '-i', str(source),
                    '-map', '0', '-c', 'copy', '-movflags', '+faststart',
                    str(temporary)], check=True)
    temporary.replace(target)
    subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', '-ss', '0.65',
                    '-i', str(target), '-frames:v', '1', '-vf', 'scale=960:-2',
                    '-q:v', '2', str(posters / f'{name}.jpg')], check=True)
    print(f'Imported {name}', flush=True)


with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(import_video, jobs))
