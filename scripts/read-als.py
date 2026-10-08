"""Arrangement MIDI clips of an .als as legato [start, length, midi] lists per track; prints a summary."""
import gzip,json,glob,sys,collections,xml.etree.ElementTree as ET
f=[p for p in glob.glob(sys.argv[1]+'/**/*.als',recursive=True) if 'Backup' not in p][0]
root=ET.fromstring(gzip.open(f).read())
ts=[(e.find('Numerator').get('Value'),e.find('Denominator').get('Value')) for e in root.iter('RemoteableTimeSignature')][:1]
names=[];parts=[];end=0
for t in root.iter('MidiTrack'):
    name=t.find('Name/EffectiveName').get('Value')
    ns=[]
    for c in t.findall('.//ArrangerAutomation/Events/MidiClip'):
        ls=float(c.find('Loop/LoopStart').get('Value')); st=float(c.get('Time')); ce=float(c.find('CurrentEnd').get('Value')); end=max(end,ce)
        for kt in c.iter('KeyTrack'):
            k=int(kt.find('MidiKey').get('Value'))
            for n in kt.iter('MidiNoteEvent'):
                if n.get('IsEnabled')=='false': continue
                s=st+float(n.get('Time'))-ls
                if s<ce-1e-6: ns.append([round(s,3),round(float(n.get('Duration')),3),k])
    if not ns: continue
    ns.sort(); names.append(name); parts.append(ns)
end=round(end)
for name,ns in zip(names,parts):
    on=collections.Counter(n[0] for n in ns)
    print(name,len(ns),'notes, chords',sum(v>1 for v in on.values()),'off 8th grid',sum(abs(n[0]*2-round(n[0]*2))>0.02 for n in ns),'range',min(n[2] for n in ns),max(n[2] for n in ns))
leg=[[[s,(p[i+1][0] if i+1<len(p) else end)-s,m] for i,(s,d,m) in enumerate(p)] for p in parts]
print('meter',ts,'beats',end)
json.dump({'names':names,'parts':leg,'end':end},open(sys.argv[2],'w'))
