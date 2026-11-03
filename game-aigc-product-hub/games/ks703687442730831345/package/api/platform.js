(function(r){
 'use strict'; var M=r.M3, k=typeof ks!=='undefined'?ks:null;
 if(!k&&typeof localStorage!=='undefined'&&typeof location!=='undefined'&&/[?&]reset=1(?:&|$)/.test(location.search)){['buffet-profile-v1','buffet-run-v1'].forEach(function(key){localStorage.removeItem(key);});}
 M.Platform={native:!!k,sdk:k,get:function(key){try{
  var v=k?k.getStorageSync(key):JSON.parse(localStorage.getItem(key));
  // 部分 iOS 运行时会把 getStorageSync 解析结果冻结为只读，业务侧原地赋值会抛 readonly 异常；统一深拷贝成可写副本。
  return v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):v;
 }catch(e){return null;}},set:function(key,value){try{if(k)k.setStorageSync(key,value);else localStorage.setItem(key,JSON.stringify(value));M.storageError=null;return true;}catch(e){M.storageError='本地保存失败，请检查存储空间；关闭游戏可能丢失进度';return false;}},image:function(){return k?k.createImage():new Image();},request:function(url,ok,fail){if(k){k.request({url:url,success:function(x){ok(x.data);},fail:fail});return;}var x=new XMLHttpRequest();x.open('GET',url);x.timeout=3000;x.onload=function(){try{if(x.status<200||x.status>=300)throw Error();ok(JSON.parse(x.responseText));}catch(e){fail();}};x.onerror=x.ontimeout=fail;x.send();}};
 M.Storage={get:M.Platform.get,set:M.Platform.set};
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
