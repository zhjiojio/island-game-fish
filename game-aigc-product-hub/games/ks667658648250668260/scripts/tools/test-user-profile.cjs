const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const context={setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../package/js/user-profile.js'),'utf8'),context);
function fixture({valid=false,granted=false,deny=false,hold=false}={}){
 const calls=[],pending={},timers=[];
 const api={
  checkSession(o){calls.push('checkSession');if(hold)pending.session=o;else valid?o.success():o.fail();},
  login(o){calls.push('login');o.success({code:'never-store-this'});},
  getSetting(o){calls.push('getSetting');o.success({authSetting:{'scope.userInfo':granted}});},
  authorize(o){calls.push('authorize');deny?o.fail():o.success();},
  getUserInfo(o){calls.push('getUserInfo');o.success({userInfo:{nickName:'测试用户',avatarUrl:'https://example.test/avatar.png',openid:'untrusted'}});}
 };
 const changed=[];
 const profile=context.UserProfile.create({api,onChange:u=>changed.push(u),setTimer:cb=>(timers.push(cb),timers.length),clearTimer(){}});
 return {profile,calls,changed,pending,timers,api};
}
{
 const f=fixture({valid:true,granted:true});f.profile.load(false);
 assert.deepEqual(f.calls,['checkSession','getSetting','getUserInfo']);assert.equal(f.profile.get().nickName,'测试用户');
 assert.equal(f.profile.get().openid,undefined);assert(!JSON.stringify(f.changed).includes('never-store-this'));
}
{
 const f=fixture();f.profile.load(false);assert.equal(f.profile.get().status,'needs_authorization');assert(!f.calls.includes('authorize'));
 f.api.checkSession=o=>{f.calls.push('checkSession');o.success();};
 f.profile.load(true);assert.equal(f.profile.get().status,'ready');assert.equal(f.calls.filter(c=>c==='login').length,1);
}
{
 const f=fixture({hold:true});let successes=0;f.profile.load(false,()=>successes++);f.profile.load(true,()=>successes++);
 f.pending.session.fail();assert.equal(successes,2);assert.equal(f.calls.filter(c=>c==='login').length,1);assert.equal(f.calls.filter(c=>c==='authorize').length,1);
}
{
 const f=fixture({deny:true});let failure=0;f.profile.load(true,null,()=>failure++);
 assert.equal(failure,1);assert.equal(f.profile.get().status,'denied');assert.equal(f.profile.get().logging,false);
 f.api.authorize=o=>o.success();f.profile.load(true);assert.equal(f.profile.get().status,'ready');
}
{
 const f=fixture({hold:true});f.profile.load(true);const old=f.pending.session;
 f.timers[0]();assert.equal(f.profile.get().status,'timeout');f.profile.load(true);old.success();assert.equal(f.calls.filter(c=>c==='getSetting').length,0);
 f.pending.session.fail();assert.equal(f.profile.get().status,'ready');
}
{
 const f=fixture({hold:true});f.profile.load(true);const old=f.pending.session;f.profile.reset();old.success();assert.equal(f.profile.get().status,'idle');
}
console.log('PASS profile: session reuse, startup without prompt, gesture auth, concurrent calls, denial/retry, timeout/late callback, reset, untrusted identity exclusion.');
