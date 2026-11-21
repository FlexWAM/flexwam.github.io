"""Extract three synchronized camera views for the HTML method diagrams."""
import argparse
from pathlib import Path
import subprocess
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = root.parent / 'Flexwam_materials/FlexWAM/HomePage_material/router/penbox2/wan/scene_0017_router.mp4'
out = root / 'public/images/method'
out.mkdir(parents=True, exist_ok=True)
# Same source frame, excluding existing camera-weight labels and chart.
for name, crop in [('global', 'crop=880:560:40:150'), ('left-wrist', 'crop=416:264:32:880'), ('right-wrist', 'crop=416:264:512:880')]:
    subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-ss', '3', '-i', str(source), '-frames:v', '1', '-vf', crop+',scale=660:420', '-q:v', '2', str(out / f'{name}.jpg')], check=True)
