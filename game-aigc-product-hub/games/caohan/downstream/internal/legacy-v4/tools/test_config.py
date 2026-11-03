import json, pathlib, unittest
I=pathlib.Path(__file__).resolve().parents[1]
D=I.parent
S=json.loads(next((D.parent/'output').glob('*.v4.json')).read_text())
class ConfigTest(unittest.TestCase):
 def setUp(self): self.c=json.loads((D/'game-config.json').read_text());self.nodes={n['nodeId']:n for n in self.c['nodes']}
 def test_media_coverage(self):
  self.assertEqual(set(self.nodes),{k for k,v in S['nodes'].items() if v['type'] in ('scene','ending')})
  manifest=json.loads((I/'media-upload-manifest.json').read_text()); durations={v['videoId']:v['durationSec'] for v in manifest}
  for k,n in self.nodes.items():
   vid=S['nodes'][k]['videos'][0]['id'] if S['nodes'][k]['type']=='scene' else k
   self.assertEqual(n['video']['duration'],durations[vid]); self.assertTrue(n['video']['url'].startswith('https://'))
 def test_preserve_choices_and_ads(self):
  for k,n in S['nodes'].items():
   if n['type']!='scene':continue
   target=S['nodes'][n['next']];cs=self.nodes[k]['components']
   if target['type']=='choice':
    buttons=[c for c in cs if c['componentType']=='button1'];self.assertEqual(len(buttons),4)
    for o,c in zip(target['options'],buttons):
     self.assertEqual(c['nextNodeId'],o['next']);self.assertEqual(c['changes'],o['changes']);self.assertIsNone(c['showTime'])
     self.assertEqual(c['condition'],o['access'].get('condition'))
     self.assertEqual(c['unlockType']=='ad',o['access']['mode']=='rewarded_ad')
   elif target['type']=='ad_gate':
    c=cs[-1];self.assertEqual(c['nextNodeId'],target['unlock']['next']);self.assertEqual(c['unlockType'],'ad');self.assertEqual(c['adConfig']['failureBehavior'],'stay');self.assertIsNone(c['adConfig']['failNextNodeId'])
 def test_targets_endings_and_initial_state(self):
  self.assertEqual(self.c['initialState']['flags'],S['initialFlags']);self.assertEqual(self.c['initialState']['variables'],S['variables'])
  for n in self.nodes.values():
   for c in n['components']:
    if c['nextNodeId']:self.assertIn(c['nextNodeId'],self.nodes)
  for k,n in S['nodes'].items():
   if n['type']=='ending':self.assertEqual(self.nodes[k]['ending']['unlock'],n['unlock'])
if __name__=='__main__':unittest.main()
