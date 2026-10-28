import json,re,sys
import os
R=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))+'/'
W=R+'.local/translate-work/'
os.makedirs(W,exist_ok=True)
em=[{'id':e['id'],'t':e['t']} for e in json.load(open(W+'emerald_entries.json'))]
T=R+'translations/'
fr=json.load(open(T+'pokemon-firered-rev1.thai.json'))['entries']
eth=json.load(open(T+'gba-pokemon-emerald-bpee-v0.thai.json'))['entries']
tok=lambda s:re.findall(r'\[[^\]]+\]',s)
pool={}
for e in fr+eth: pool.setdefault(e['sourceText'],e['translatedText'])
done={e['id'] for e in eth}
out={}
for e in em:
    if e['id'] in done: continue
    t=pool.get(e['t'])
    if t and tok(t)==tok(e['t']):
        out['e:'+e['id'][len('emerald-candidate-'):]]=t.replace('[NEW_LINE]','↵').replace('[PROMPT_CLEAR]','¶').replace('[PROMPT_SCROLL]','⇣')
json.dump(out,open(W+'tm1.json','w'),ensure_ascii=False)
print(len(out))
