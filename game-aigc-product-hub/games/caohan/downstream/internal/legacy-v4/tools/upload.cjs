// Invoke the maintained workflow uploader; keep credentials out of OS arguments/logs.
const path = require('path');
const {spawnSync} = require('child_process');
const root=path.resolve(__dirname,'../../../../../../game-aigc-workflow');
const cfg='/Users/kwaibear/work/minigame/game-aigc-product-hub/games/ks867658648250668260/workflow-run.yml';
const result=spawnSync('python',['-c','import yaml,sys,json; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps(d["config"]))',cfg],{encoding:'utf8'});
if(result.status!==0) throw new Error('Cannot read local upload credentials');
const c=JSON.parse(result.stdout);
if(!c.kcdn_token) throw new Error('Missing config.kcdn_token');
// The underlying SDK can print its options; redact at the output boundary.
for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  stream.write = (chunk, ...args) => write((Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)).split(c.kcdn_token).join('[REDACTED]'), ...args);
}
const extra=process.argv.slice(2);
process.argv=[process.execPath,path.join(root,'skills/agw-self-test/cdn/cdn-upload.js'),path.resolve(__dirname,'../.cdn-stage'),c.appid,'--no-replace',`--token=${c.kcdn_token}`,...extra];
require(process.argv[1]);
