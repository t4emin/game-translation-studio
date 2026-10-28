#!/usr/bin/env python3
"""usage: emu.py rom.gba "cmd;cmd;..." outdir [save.sav]
Runs tools/emu/emu-run with a semicolon-separated script (run N; hold KEYS N; shot name; ...)
and converts every `shot name` into outdir/name.png (3x). Build the runner first (see README in this file's header)."""
import sys,os,subprocess,tempfile
from PIL import Image
rom,script,out=sys.argv[1:4]; sav=sys.argv[4] if len(sys.argv)>4 else os.path.join(out,"emu.sav")
os.makedirs(out,exist_ok=True)
lines=[];shots=[]
for c in script.split(";"):
    c=c.strip()
    if c.startswith("shot "):
        n=c.split()[1]; shots.append(n); lines.append(f"shot {out}/{n}.ppm")
    elif c: lines.append(c)
f=os.path.join(out,"script.txt"); open(f,"w").write("\n".join(lines)+"\n")
here=os.path.dirname(os.path.abspath(__file__))
subprocess.run([os.path.join(here,"emu-run"),rom,f,sav],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for n in shots:
    Image.open(f"{out}/{n}.ppm").resize((720,480),Image.NEAREST).save(f"{out}/{n}.png"); os.remove(f"{out}/{n}.ppm")
print("shots:",", ".join(f"{out}/{n}.png" for n in shots))
