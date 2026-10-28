"""Compare Ghostscript renders of matching NAME.eps.png and NAME.pdf.png files (see check_eps_render.mjs). Requires pillow, numpy."""
import sys, pathlib
import numpy as np
from PIL import Image
D = pathlib.Path(sys.argv[1])
for eps in sorted(D.glob('*.eps.png')):
    pdf = D / eps.name.replace('.eps.png', '.pdf.png')
    a = np.asarray(Image.open(eps).convert('L'), dtype=float); b = np.asarray(Image.open(pdf).convert('L'), dtype=float)
    # both put the drawing at the page origin (bottom-left); the EPS box is rounded up to whole points
    h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1])
    A, B = a[a.shape[0]-h:, :w], b[b.shape[0]-h:, :w]
    d = np.abs(A - B); ink = (B < 128).sum()
    differ = ((d > 64)).sum()
    print(f"{eps.name[:-8]:14s} eps {a.shape[1]}x{a.shape[0]} pdf {b.shape[1]}x{b.shape[0]}  mean|diff| {d.mean():.3f}  pixels differing >25%: {differ} of {ink} ink pixels ({100*differ/max(1,ink):.2f}%)")
    Image.fromarray(np.uint8(255 - np.clip(d, 0, 255))).save(D / f"{eps.name[:-8]}.diff.png")
