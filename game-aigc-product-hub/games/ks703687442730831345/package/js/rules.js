(function(r){
 'use strict'; var M=r.M3;
 function clone(g){return g.map(function(x){return {a:x.a.slice(),q:x.q.map(function(y){return y.slice();})};});}
 function counts(g){var c={};g.forEach(function(x){[x.a].concat(x.q).forEach(function(a){a.forEach(function(t){if(t!==null)c[t]=(c[t]||0)+1;});});});return c;}
 function total(g){var c=counts(g),n=0;Object.keys(c).forEach(function(k){n+=c[k];});return n;}
 function occupied(a){return a.filter(function(t){return t!==null;});}
 // trace 仅供表现层读取中间状态；求解器不传入，规则与搜索成本保持原样。
 function settle(g,trace){var events=[],changed=true,guard=0;while(changed&&guard++<2000){changed=false;g.forEach(function(x,i){var a=occupied(x.a);if(a.length===3&&a[0]===a[1]&&a[1]===a[2]){if(trace)trace.push({kind:'clear',group:i,before:clone(g)});events.push({kind:'clear',group:i,type:a[0]});x.a=[null,null,null];a=[];changed=true;}if(!a.length&&x.q.length){if(trace)trace.push({kind:'refill',group:i,before:clone(g)});var layer=x.q.shift();x.a=[null,null,null];layer.forEach(function(t,j){x.a[j]=t;});events.push({kind:'refill',group:i});changed=true;}});}return events;}
 function move(g,from,slot,to,targetSlot,trace){if(!g[from]||!g[to]||slot%1!==0||slot<0||slot>2||g[from].a[slot]===null)return null;var dest=typeof targetSlot==='number'?targetSlot:g[to].a.indexOf(null);if(dest%1!==0||dest<0||dest>2||g[to].a[dest]!==null)return null;g[to].a[dest]=g[from].a[slot];g[from].a[slot]=null;return from===to?[]:settle(g,trace);}
 function moves(g){var out=[],info=g.map(function(x){var c={},len=0;x.a.forEach(function(t){if(t!==null){c[t]=(c[t]||0)+1;len++;}});return {counts:c,len:len};});g.forEach(function(x,i){var types={};x.a.forEach(function(t,s){if(t===null||types[t])return;types[t]=true;info.forEach(function(y,j){if(i===j||y.len===3)return;var same=y.counts[t]||0,score=same*12+(info[i].len===1?3:0)-(y.len&&!same?6:0);out.push({from:i,slot:s,to:j,score:score});});});});return out.sort(function(a,b){return b.score-a.score;});}
 function key(g){return g.map(function(x){return x.a.slice().sort().join(',')+'|'+x.q.map(function(a){return a.slice().sort().join(',');}).join('/');}).sort().join(';');}
 // 只有完整回放到空盘的搜索结果才算通过；超时不等于无解。
 function solve(g,budget){var seen={},nodes=0,max=budget||4000;function dfs(s,depth){if(!total(s))return [];if(++nodes>max||depth>1000)return null;var k=key(s);if(seen[k])return null;seen[k]=true;var ms=moves(s);for(var i=0;i<ms.length;i++){var n=clone(s),m=ms[i];move(n,m.from,m.slot,m.to);var path=dfs(n,depth+1);if(path)return [m].concat(path);if(nodes>max)return null;}return null;}var path=dfs(clone(g),0);return {path:path,nodes:nodes,verified:path!==null};}
 function rng(seed){return function(){seed=(Math.imul?Math.imul(seed,1664525):seed*1664525)+1013904223|0;return (seed>>>0)/4294967296;};}
 function shuffle(a,rand){for(var i=a.length-1;i>0;i--){var j=Math.floor(rand()*(i+1)),v=a[i];a[i]=a[j];a[j]=v;}return a;}
 function layout(c,n,empty,seed,minLayers){var rand=rng(seed),items=[],g=[],keys=Object.keys(c);keys.forEach(function(k){for(var j=0;j<c[k];j++)items.push(+k);});shuffle(items,rand);for(var i=0;i<n;i++)g.push({a:[null,null,null],q:[]});var active=Math.min(items.length,n*3-empty),slots=[],first=[],rest=[];for(i=0;i<n;i++){var order=shuffle([0,1,2],rand);first.push([i,order[0]]);rest.push([i,order[1]],[i,order[2]]);}slots=shuffle(first,rand).concat(shuffle(rest,rand));for(i=0;i<active;i++)g[slots[i][0]].a[slots[i][1]]=items.pop();
 if(minLayers){var reserved=[];for(i=0;i<n;i++)for(var layer=0;layer<(Array.isArray(minLayers)?minLayers[i]:minLayers);layer++)reserved.push(i);if(items.length<reserved.length)throw Error('食材总量不足以分配开局补位层');shuffle(reserved,rand);reserved.forEach(function(ix,k){var max=Math.min(3,items.length-(reserved.length-k-1)),len=1+Math.floor(rand()*max);g[ix].q.push(items.splice(0,len));});}
 while(items.length){var ix=Math.floor(rand()*n),len=Math.min(items.length,1+Math.floor(rand()*3));g[ix].q.push(items.splice(0,len));}return g;}
 function rebuild(c,n,empty,seed,minLayers){Object.keys(c).forEach(function(k){if(c[k]%3)throw Error('元素守恒失败');});for(var t=0;t<32;t++){var g=layout(c,n,empty,seed+t*137,minLayers);var instant=g.some(function(x){return x.a[0]!==null&&x.a[0]===x.a[1]&&x.a[1]===x.a[2];});var bad=g.some(function(x){return occupied(x.a).length===0&&x.q.length;});if(instant||bad)continue;var p=solve(g,4000);if(p.verified)return {groups:g,path:p.path,empty:n*3-g.reduce(function(s,x){return s+occupied(x.a).length;},0)};}
 // 验证失败必须回滚，不能偷偷增加空位、生成新元素或扣除道具。
 throw Error('关卡未通过求解验证');}
 function refresh(current,empty,seed){
   var n=current.length,remaining=total(current),candidates=[],minimum=[];
   current.forEach(function(g,i){minimum.push(0);if(g.q.length)candidates.push(i);});
   candidates.forEach(function(i){minimum[i]=1;});
   var requiredEmpty=Math.max(empty,n*3-(remaining-candidates.length));
   return rebuild(counts(current),n,requiredEmpty,seed,minimum);
 }
 function generate(l,seed){var c={},rand=rng(seed),reserve=l.triples-l.kinds>=3?3:0;for(var i=0;i<l.kinds;i++)c[i]=3;var target=Math.floor(rand()*l.kinds);c[target]+=reserve*3;for(i=l.kinds+reserve;i<l.triples;i++){var t=Math.floor(rand()*l.kinds);c[t]+=3;}return rebuild(c,l.groups,l.empty,seed,3);}
 function pack(g,rand,trace){var all=counts(g),front={};g.forEach(function(x){occupied(x.a).forEach(function(t){front[t]=(front[t]||0)+1;});});var types=Object.keys(all).filter(function(k){return front[k]>=3;});if(!types.length)types=Object.keys(all).filter(function(k){return all[k]>=3;});if(!types.length)return null;var type=+types[Math.floor(rand()*types.length)],n=3,before=trace?clone(g):null,items=[];g.forEach(function(x,gi){x.a.forEach(function(t,i){if(n&&t===type){items.push({group:gi,slot:i,layer:-1,type:t});x.a[i]=null;n--;}});});g.forEach(function(x,gi){x.q=x.q.map(function(a,qi){return a.filter(function(t,si){if(n&&t===type){items.push({group:gi,slot:si,layer:qi,type:t});n--;return false;}return true;});}).filter(function(a){return a.length;});});if(trace)trace.push({kind:'pack',group:-1,type:type,before:before,items:items});return [{kind:'clear',group:-1,type:type}].concat(settle(g,trace));}
 function wand(g,seed,trace){
   var rand=rng(seed),front=[],hidden=[],all=counts(g),sizes=[9,6,3];
   g.forEach(function(x,i){x.a.forEach(function(t,j){if(t!==null)front.push([i,j,t]);});x.q.forEach(function(a,qi){a.forEach(function(t,si){hidden.push([i,qi,si,t]);});});});
   // Prefer 9, then 6, then 3. Pick visible targets deliberately so hidden swaps preserve every type count.
   for(var si=0;si<sizes.length;si++){
     var size=sizes[si];if(front.length<size)continue;
     var possible=shuffle(Object.keys(all).filter(function(k){return all[k]>=size;}),rand);
     for(var z=0;z<possible.length;z++)for(var attempt=0;attempt<16;attempt++){
       var type=+possible[z],same=shuffle(front.filter(function(p){return p[2]===type;}),rand),other=shuffle(front.filter(function(p){return p[2]!==type;}),rand),supply=shuffle(hidden.filter(function(p){return p[3]===type;}),rand);
       var changed=Math.min(size,other.length,supply.length);if(!changed||same.length<size-changed)continue;
       var selected=other.slice(0,changed).concat(same.slice(0,size-changed)),n=clone(g);
       selected.slice(0,changed).forEach(function(p,j){var h=supply[j];n[h[0]].q[h[1]][h[2]]=p[2];n[p[0]].a[p[1]]=type;});
       var transformed=clone(n),frames=trace?[]:null,events=settle(n,frames),proof=solve(n,4000);
       if(proof.verified){if(trace)frames.forEach(function(f){trace.push(f);});return {groups:n,transformed:transformed,events:events,path:proof.path,size:size,type:type,selected:selected,fallback:false};}
     }
   }
   // Regroup a single type into real matching racks before normal settle/animation.
   // Every food is still present in transformed; only settle may remove triples.
   if(total(g)>=3){
     for(var fsi=0;fsi<sizes.length;fsi++){
       var fallbackSize=sizes[fsi];if(front.length<fallbackSize||total(g)<fallbackSize)continue;
       for(var fa=0;fa<16;fa++){
         var remaining={};Object.keys(all).forEach(function(k){remaining[k]=all[k];});
         var pool=shuffle(Object.keys(remaining).filter(function(k){return remaining[k]>=fallbackSize;}),rand);
         if(!pool.length)break;var chosen=+pool[0];remaining[chosen]-=fallbackSize;
         Object.keys(remaining).forEach(function(k){if(!remaining[k])delete remaining[k];});
         var empty=g.length*3-front.length;
         try{
           var safe=rebuild(remaining,g.length,empty,seed+7001+fsi*5003+fa*977),transformed=clone(safe.groups),selected=[];
           for(var gi=0;gi<fallbackSize/3;gi++){var prior=occupied(transformed[gi].a);if(prior.length)transformed[gi].q.unshift(prior);transformed[gi].a=[chosen,chosen,chosen];for(var sj=0;sj<3;sj++)selected.push([gi,sj,chosen]);}
           var finalGroups=clone(transformed),frames=trace?[]:null,events=settle(finalGroups,frames),proof=solve(finalGroups,4000);
           if(!proof.verified)continue;if(trace)frames.forEach(function(f){trace.push(f);});
           return {groups:finalGroups,transformed:transformed,events:events,path:proof.path,size:fallbackSize,type:chosen,selected:selected,fallback:true};
         }catch(e){}
       }
     }
   }
   return null;
 }
 M.Rules={clone:clone,counts:counts,total:total,occupied:occupied,settle:settle,move:move,moves:moves,solve:solve,rebuild:rebuild,refresh:refresh,generate:generate,pack:pack,wand:wand,rng:rng};
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
