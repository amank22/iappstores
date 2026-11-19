"""Synthesised soundtrack (no stock audio): soft pad + a chime at each scene cut.
python3 soundtrack.py out.wav"""
import sys, wave, numpy as np
SR, DUR = 44100, 24.0
t = np.arange(int(SR*DUR))/SR
def env(x, a, d, r=0): return np.clip(x/a,0,1)*np.exp(-np.maximum(x-a,0)/d)
mix = np.zeros_like(t)
# pad: Am9-ish -> F -> C -> G, 6s each, slow swell
chords = [[220,261.63,329.63,392],[174.61,220,261.63,349.23],[130.81,196,261.63,329.63],[196,246.94,293.66,392]]
for i,ch in enumerate(chords):
    s=i*6.0; m=(t>=s)&(t<s+6.4); x=t-s
    e=np.clip(x/1.5,0,1)*np.clip((6.4-x)/1.5,0,1)
    for f in ch:
        mix += m*e*0.045*(np.sin(2*np.pi*f*t)+0.4*np.sin(2*np.pi*f*2.003*t))
# bass pulse
for i,f in enumerate([110,87.31,65.41,98]):
    s=i*6.0; m=(t>=s)&(t<s+6); mix += m*0.10*np.sin(2*np.pi*f*t)*(0.7+0.3*np.sin(2*np.pi*2*t))
# chimes on scene cuts
notes = {0:880,3:1174.66,7:1318.51,10.5:1567.98,14:1318.51,17.5:1760,20:2093}
for s,f in notes.items():
    x=t-s; m=x>=0
    ch=m*np.exp(-np.where(m,x,0)*2.6)*(np.sin(2*np.pi*f*t)+0.35*np.sin(2*np.pi*f*2.01*t)+0.15*np.sin(2*np.pi*f*3.02*t))
    mix += 0.11*ch
# soft whoosh at cuts
rng=np.random.default_rng(1)
for s in notes:
    x=t-s+0.25; m=(x>=0)&(x<0.5)
    n=rng.standard_normal(len(t))
    k=np.convolve(n,np.ones(60)/60,'same')
    mix += m*np.sin(np.pi*np.clip(x/0.5,0,1))*k*0.5
# outro swell + fade
mix += ((t>=20)&(t<24))*0.0
fade=np.clip((DUR-t)/1.5,0,1)*np.clip(t/0.4,0,1)
mix*=fade
mix/=max(1e-9,np.abs(mix).max())/0.8
st=np.stack([mix,np.roll(mix,60)],1)
pcm=(st*32767).astype('<i2')
with wave.open(sys.argv[1],'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
