const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
let root=__dirname;
while(!fs.existsSync(path.join(root,'game-aigc-workflow'))){const next=path.dirname(root);if(next===root)throw Error('Workspace not found');root=next;}
const cfg='/Users/kwaibear/work/minigame/game-aigc-product-hub/games/ks867658648250668260/workflow-run.yml';
const result=spawnSync('python3',['-c','import yaml,sys,json; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps(d["config"]))',cfg],{encoding:'utf8'});
if(result.status!==0)throw Error('Cannot read upload credentials');
const c=JSON.parse(result.stdout);
if(!c.kcdn_token || c.appid!=='ks867658648250668260')throw Error('Missing credentials or unexpected app');
for(const stream of [process.stdout,process.stderr]){const write=stream.write.bind(stream);stream.write=(chunk,...args)=>write((Buffer.isBuffer(chunk)?chunk.toString():String(chunk)).split(c.kcdn_token).join('[REDACTED]'),...args);}
const tool=path.join(root,'game-aigc-workflow/skills/agw-self-test/cdn/cdn-upload.js');
process.argv=[process.execPath,tool,path.resolve(__dirname,'../.cdn-stage'),c.appid,'--no-replace','--allow-rewrite=false',`--token=${c.kcdn_token}`,...process.argv.slice(2)];
require(tool);
