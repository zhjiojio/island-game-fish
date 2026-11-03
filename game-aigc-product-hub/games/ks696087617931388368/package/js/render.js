(function () {
  var M3=window.M3, gl, program, buffer, uRect,uColor,uMode,uScreen,uSampler,uAngle,uPivot,uPhase,uUvRect,uCarEffect, textures={},textTextures={},assetsReady=false,levelPreviewsReady=false,levelPreviewRequested=false;
  // Asset keys are scene-relative and load in stages: the main package only
  // carries the first home frame; playfield art waits for the game-assets
  // subpackage and popup/settings/shop/album art for popup-assets.
  var keys=['popup/loading-bg','popup/loading-text','home/background','home/artwork','home/btn-add','home/btn-share','home/btn-works','home/btn-shop','home/btn-album','home/btn-gear','home/btn-start','home/btn-privacy'];
  var gameKeys=['game/road','game/road-beach','game/car-body','game/car-open','game/slot-frame','game/slot-locked','hud/full-check','hud/tools-bar','hud/badge-ad','hud/badge-plus','hud/speed','hud/gear','hud/level-pill'];
  var uiKeys=['popup/privacy-panel','popup/panel-win','popup/panel-loss','popup/panel-refresh','popup/panel-revive','popup/panel-upgrade','popup/panel-daily','popup/panel-shop','popup/panel-album','popup/panel-works','settings/panel-game','settings/panel-home','settings/switch-on','settings/switch-off','shop/card-bg','shop/theme-road','shop/theme-beach','shop/theme-more','shop/btn-owned','shop/btn-ad-free','shop/btn-soon','album/frame-locked'].concat(['card-1','card-4','card-44','card-5','card-55','card-6','card-66','card-7','card-77','card-8','card-88'].map(function(n){return 'album/'+n;}));
  function assetPath(key){
    if(key.indexOf('level/')===0)return 'subpackages/level-previews/levels/level-'+key.slice(6)+'.png';
    if(key.indexOf('game/')===0||key.indexOf('hud/')===0)return 'subpackages/game-assets/assets/'+key+'.png';
    if(key.indexOf('settings/')===0||key.indexOf('shop/')===0||key.indexOf('album/')===0)return 'subpackages/popup-assets/assets/'+key+'.png';
    if(key==='popup/privacy-panel'||key.indexOf('popup/panel-')===0)return 'subpackages/popup-assets/assets/'+key+'.png';
    return 'assets/'+key+'.png';
  }
  // Stage-2 preloads: queued once the first home frame is on screen, so the
  // loading screen never waits on subpackage downloads.
  var subpackageQueued=false;
  function queueSubpackages(){
    function queue(name,list){
      if(!M3.SubpackageLoader)return;
      M3.SubpackageLoader.load(name,{onSuccess:function(){for(var i=0;i<list.length;i++)M3.AssetManager.acquire('image',list[i],assetPath(list[i]),'shared');},onFail:function(){}});
    }
    queue('game-assets',gameKeys);queue('popup-assets',uiKeys);
  }
  function ensureLevelPreviews(){
    if(levelPreviewsReady)return true;
    if(!levelPreviewRequested){
      levelPreviewRequested=true;
      if(M3.SubpackageLoader)M3.SubpackageLoader.load('level-previews',{onSuccess:function(){levelPreviewsReady=true;},onFail:function(){levelPreviewsReady=true;}});
      else levelPreviewsReady=true;
    }
    return levelPreviewsReady;
  }
  function clearExportMatte(texture,img){
    var width=img.width,height=img.height,pixels=new Uint8Array(width*height*4),seen=new Uint8Array(width*height),queue=new Int32Array(width*height),tail=0;
    var fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);return;}
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);
    function add(i){if(i<0||i>=seen.length||seen[i])return;seen[i]=1;var p=i*4;if(pixels[p]>244&&pixels[p+1]>244&&pixels[p+2]>244){queue[tail++]=i;pixels[p+3]=0;}}
    var i;for(i=0;i<width;i++){add(i);add((height-1)*width+i);}for(i=0;i<height;i++){add(i*width);add(i*width+width-1);}
    for(var head=0;head<tail;head++){i=queue[head];if(i%width)add(i-1);if(i%width<width-1)add(i+1);add(i-width);add(i+width);}
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  }
  function prepareHomeArtwork(texture,img){
    // Encode reveal groups in this opaque home texture's unused alpha channel.
    // Flood only paper connected to the outside, so pale interior details also
    // become the same grey as the rest of the unfinished artwork.
    var w=img.width,h=img.height,data=new Uint8Array(w*h*4);
    var fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('无法读取首页拼图');
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);
    var x0=Math.floor(101*w/375),x1=Math.ceil(274*w/375),y0=Math.floor(244*h/812),y1=Math.ceil(442*h/812);
    var seen=new Uint8Array(w*h),queue=[],head=0;
    function add(x,y){
      if(x<x0||x>=x1||y<y0||y>=y1)return;
      var i=y*w+x;if(seen[i])return;
      var k=i*4,r=data[k],g=data[k+1],b=data[k+2];
      if(r>204&&r-g>14&&r-g<74&&g-b>14&&g-b<74){seen[i]=1;queue.push(i);}
    }
    var x,y,i;
    for(x=x0;x<x1;x++){add(x,y0);add(x,y1-1);}
    for(y=y0;y<y1;y++){add(x0,y);add(x1-1,y);}
    while(head<queue.length){i=queue[head++];x=i%w;y=Math.floor(i/w);add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);}
    var cells={},ordered=[];
    for(y=y0;y<y1;y++)for(x=x0;x<x1;x++){
      i=y*w+x;if(seen[i])continue;
      var cell=Math.floor((y*812/h-244)/4.3)*41+Math.floor((x*375/w-101)/4.3);
      if(!cells[cell]){cells[cell]=[];ordered.push(cell);}cells[cell].push(i);
    }
    ordered.sort(function(a,b){return a-b;});
    for(i=3;i<data.length;i+=4)data[i]=0;
    ordered.forEach(function(cell,index){
      var group=(Math.floor(index*100/ordered.length)+1)*2;
      cells[cell].forEach(function(pixel){data[pixel*4+3]=group;});
    });
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
  }
  function compile(type,source){var shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;}
  function shape(x,y,w,h,color,mode,key){
    // Full-screen backgrounds and modal masks keep covering the whole
    // display, notch area included; only in-game content shifts below the
    // safe area, so skip the vertical safe-area transform for them.
    var full=y<=0&&y+h>=812;
    gl.uniform4f(uRect,x,full?y:M3.Layout.safeTop+y*(812-M3.Layout.safeTop)/812,w,full?h:h*(812-M3.Layout.safeTop)/812);
    gl.uniform4f(uColor,color[0],color[1],color[2],color.length>3?color[3]:1);
    gl.uniform1f(uMode,mode||0);
    if(key){
      var img=M3.AssetManager.get(key);if(!img)return;
      if(!textures[key]){textures[key]=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,textures[key]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);}
      else gl.bindTexture(gl.TEXTURE_2D,textures[key]);
      if(!textures[key].matteReady){if(key.indexOf('popup/')!==0&&key.indexOf('home/')!==0&&key!=='game/road'&&key!=='game/road-beach'&&key!=='game/slot-frame'&&key!=='album/frame-locked'&&key!=='hud/gear'&&key!=='hud/level-pill')clearExportMatte(textures[key],img);textures[key].matteReady=true;}
    }
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  function sprite(key,x,y,w,h){shape(x,y,w,h,[1,1,1,1],1,key);}
  function spriteCrop(key,x,y,w,h,u0,v0,u1,v1,mode){
    gl.uniform4f(uUvRect,u0,v0,u1-u0,v1-v0);
    shape(x,y,w,h,[1,1,1,1],mode||1,key);
    gl.uniform4f(uUvRect,0,0,1,1);
  }
  function label(text,x,y,w,h,color,size,weight,stroke,effect,align,opacity,scale,strokeWidth){
    var cacheKey=[text,w,h,color,size,weight,stroke,JSON.stringify(effect),align,strokeWidth].join('|'),texture=textTextures[cacheKey],canvas,ctx;
    if(!texture){
      // Kwai has no DOM and its WebGL layer does not accept web OffscreenCanvas
      // sources. Every ks.createCanvas() call after the first returns an
      // offscreen canvas — the scaffold-standard text-to-texture source on
      // device — so try the Kwai runtime before the web fallbacks.
      if(typeof ks!=='undefined'&&ks.createCanvas)canvas=ks.createCanvas();
      else if(typeof OffscreenCanvas!=='undefined')canvas=new OffscreenCanvas(Math.ceil(w*3),Math.ceil(h*3));
      else if(window.document&&window.document.createElement)canvas=window.document.createElement('canvas');
      if(!canvas)return;
      canvas.width=Math.ceil(w*3);canvas.height=Math.ceil(h*3);ctx=canvas.getContext('2d');if(!ctx)return;
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle=color||'#12457f';ctx.textAlign=align||'center';ctx.textBaseline='middle';ctx.font=(weight||'700')+' '+Math.round((size||14)*3)+'px sans-serif';
      if(effect){ctx.shadowColor='rgba(0,0,0,0.75)';ctx.shadowBlur=6;ctx.shadowOffsetX=1.5;ctx.shadowOffsetY=4.5;}
      if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=strokeWidth===undefined?(effect?6:3):strokeWidth;ctx.lineJoin='round';ctx.strokeText(text,canvas.width/2,canvas.height/2);}
      ctx.shadowColor='transparent';ctx.fillText(text,align==='left'?0:canvas.width/2,canvas.height/2);
      texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);textTextures[cacheKey]=texture;
    }else gl.bindTexture(gl.TEXTURE_2D,texture);
    // Scale the existing texture around its center without caching new textures.
    scale=scale===undefined?1:scale;
    x-=w*(scale-1)/2;y-=h*(scale-1)/2;w*=scale;h*=scale;
    gl.uniform4f(uRect,x,M3.Layout.safeTop+y*(812-M3.Layout.safeTop)/812,w,h*(812-M3.Layout.safeTop)/812);gl.uniform4f(uColor,1,1,1,opacity===undefined?1:opacity);gl.uniform1f(uMode,1);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  var digits=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
  function number(n,x,y,scale,color){var text=String(n),ink=color||[1,1,1];for(var i=0;i<text.length;i++){var glyph=digits[Number(text.charAt(i))];for(var j=0;j<15;j++)if(glyph.charAt(j)==='1')shape(x+i*4*scale+(j%3)*scale,y+Math.floor(j/3)*scale,scale,scale,ink,0);}}
  function crowdPerson(x,y,cellW,cellH,c){
    // Head bounds are 0.80 by 0.68 of the quad. Fit them to the actual
    // grid pitch so the next row covers the body, even on non-square grids.
    var w=cellW/0.80,h=cellH/0.56;
    gl.uniform1f(uPhase,0);
    shape(x-w/2,y-h*0.29,w,h,c,3);
  }
  function walkingPerson(x,y,c,elapsed,boarding){
    var size=M3.Board.getSize();
    var grid=M3.Layout.crowd(size.cols,size.rows),w=grid.w,h=grid.h;
    if(boarding!==undefined){
      var enter=Math.min(1,boarding/160);
      w*=1-enter*0.9;h*=1-enter*0.9;
      c=[c[0],c[1],c[2],1-enter];elapsed=0;
    }
    // A full left/right stride every 420ms, independent of path segmentation.
    var stride=Math.sin(elapsed/420*Math.PI*2);
    var bounce=Math.abs(stride)*h*0.035;
    gl.uniform1f(uPhase,stride);
    // Extra drawing room prevents the tilted head from clipping at the quad.
    gl.uniform4f(uUvRect,-0.12,-0.12,1.24,1.24);
    shape(x-w/2+stride*w*0.018-w*0.12,y-h*0.29-bounce-h*0.12,w*1.24,h*1.24,c,4);
    gl.uniform4f(uUvRect,0,0,1,1);
    gl.uniform1f(uPhase,0);
  }
  // Late levels keep thousands of standing beads on the board; drawing each
  // as its own quad costs thousands of GL calls every frame (which is why
  // the game sped up as beads were cleared). Bake the static standing crowd
  // into an offscreen texture and re-bake only when the standing set changes.
  var crowdCache={fb:null,tex:null,standing:-1,ready:false,bakeAt:-1e9};
  function bakeCrowd(people,size,colors){
    var w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    if(!crowdCache.tex){
      crowdCache.tex=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,crowdCache.tex);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      crowdCache.fb=gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,crowdCache.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,crowdCache.tex,0);
    }else gl.bindFramebuffer(gl.FRAMEBUFFER,crowdCache.fb);
    // Never render into the cache while it is bound as a texture source,
    // including the first bake right after the parameters were set — the
    // leftover binding forms a feedback loop and every draw is rejected.
    gl.bindTexture(gl.TEXTURE_2D,null);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    var i,p;
    // Row-major order paints rear rows first; foreground heads naturally
    // occlude their limbs without rectangular gap fillers.
    var grid=M3.Layout.crowd(size.cols,size.rows);
    for(i=0;i<people.length;i++){p=people[i];if(!p.gone&&!p.reserved){var point=M3.Game.point(p);crowdPerson(point.x,point.y,grid.cellW,grid.cellH,colors[p.color]);}}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.clearColor(0.2,0.3,0.4,1);
    crowdCache.ready=true;
  }
  function drawCrowd(){
    if(!crowdCache.ready)return;
    // The bake already contains content-space positions, so composite it as
    // one full-screen raw quad exactly like the backgrounds. FBO textures
    // store the image with the v axis running opposite to screen space, so
    // flip v (uvRect 0,1,1,-1) to keep the crowd upright.
    gl.bindTexture(gl.TEXTURE_2D,crowdCache.tex);
    gl.uniform4f(uRect,0,0,375,812);
    gl.uniform4f(uColor,1,1,1,1);
    gl.uniform1f(uMode,1);
    gl.uniform4f(uUvRect,0,1,1,-1);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    // uUvRect is global state shared with every later sprite; restore it
    // or all following textured elements would draw upside down.
    gl.uniform4f(uUvRect,0,0,1,1);
  }
  function drawCar(c){
    gl.uniform1f(uAngle,c.angle||0);gl.uniform2f(uPivot,c.x+25.85,M3.Layout.safeTop+(c.y+38.775)*(812-M3.Layout.safeTop)/812);
    var sway=c.stage==='starting'?Math.sin(c.elapsed/260*Math.PI*2)*0.045*Math.sin(c.elapsed/260*Math.PI):0;
    if(c.rejectPulse>0){var reject=1-c.rejectPulse/320;sway+=Math.sin(reject*Math.PI*6)*0.055*(1-reject);}
    var sx=1,sy=1,lift=0,t;
    if(c.tapPulse>0){
      t=1-c.tapPulse/260;
      if(t<0.65){
        var press=Math.sin(t/0.65*Math.PI);
        sx+=press*0.10;sy-=press*0.18;lift-=press*3;
      }else{
        var rebound=Math.sin((t-0.65)/0.35*Math.PI);
        sx-=rebound*0.035;sy+=rebound*0.08;lift+=rebound*1.5;
      }
    }
    if(c.parkPulse>0){
      t=1-c.parkPulse/380;
      var settle=Math.sin(t*Math.PI*2)*(1-t);
      sx+=settle*0.06;sy-=settle*0.14;lift-=settle*2.5;
    }
    if(c.shiftPulse>0){t=1-c.shiftPulse/280;lift+=Math.sin(t*Math.PI*2)*1.5*(1-t);}
    if(c.fullPulse>0){
      t=1-c.fullPulse/600;
      var fullScale,fullT;
      if(t<0.25){
        fullT=t/0.25;fullT=fullT*fullT*(3-2*fullT);
        fullScale=1-0.18*fullT;
      }else if(t<0.60){
        fullT=(t-0.25)/0.35;fullT=fullT*fullT*(3-2*fullT);
        fullScale=0.82+0.38*fullT;
      }else{
        fullT=(t-0.60)/0.40;fullT=fullT*fullT*(3-2*fullT);
        fullScale=1.20-0.20*fullT;
      }
      sx*=fullScale;sy*=fullScale;
      lift+=(fullScale-1)*15;
    }
    gl.uniform3f(uCarEffect,sx,sy,lift*(812-M3.Layout.safeTop)/812);
    gl.uniform1f(uAngle,(c.angle||0)+sway);
    var opened=c.stage==='opening'||c.stage==='parked';
    // Open artwork includes extra space for the rear doors. Align the body,
    // rather than the image bounds, with the closed sprite.
    if(opened)shape(c.x-3.102,c.y-10.5,57.904,86.856,M3.Board.getColors()[c.color],7,'game/car-open');
    else shape(c.x,c.y,51.7,77.55,M3.Board.getColors()[c.color],7,'game/car-body');
    if(c.stage==='starting'||c.stage==='leaving'){
      shape(c.x+3,c.y+59,19,19,[1,0.91,0.42,0.48],5);
      shape(c.x+29,c.y+59,19,19,[1,0.91,0.42,0.48],5);
      shape(c.x+9,c.y+64,7,7,[1.0,0.94,0.34,0.96],2);
      shape(c.x+35,c.y+64,7,7,[1.0,0.94,0.34,0.96],2);
      shape(c.x+10,c.y+65,3,3,[1,1,0.86,1],2);
      shape(c.x+38,c.y+65,3,3,[1,1,0.86,1],2);
    }
    // Extra texture padding keeps the thicker number outline from clipping.
    var numberOpacity=c.stage==='queue'&&c.numberOpacity!==undefined?c.numberOpacity:1;
    var pulseT=1-(c.numberPulse||0)/280;
    // Fast, pronounced pop followed by a small squash and recovery.
    var numberScale;
    if(pulseT<0.25)numberScale=1+0.65*Math.sin(pulseT/0.25*Math.PI/2);
    else if(pulseT<0.75)numberScale=1.65-0.75*(1-Math.cos((pulseT-0.25)/0.5*Math.PI))/2;
    else numberScale=0.9+0.1*Math.sin((pulseT-0.75)/0.25*Math.PI/2);
    if(c.remaining===0){
      // The doors are already closed. Pop the check independently, then
      // shrink/fade it completely before the departure animation begins.
      if(c.stage==='full'){
        var checkT=Math.min(1,c.elapsed/720),checkScale=1,checkAlpha=1;
        if(checkT<0.36){
          var back=checkT/0.36-1;
          checkScale=1+2.70158*back*back*back+1.70158*back*back;
        }else if(checkT>0.68){
          var fade=(checkT-0.68)/0.32;
          checkScale=1-0.35*fade;checkAlpha=1-fade;
        }
        var checkSize=34*Math.max(0.001,checkScale);
        if(M3.AssetManager.get('hud/full-check'))shape(c.x+25.85-checkSize/2,c.y+26-checkSize/2,checkSize,checkSize,[1,1,1,checkAlpha],1,'hud/full-check');
        else label('✓',c.x+5.85,c.y+12.5,40,27,'#25e84b',20,'700','#111827',true,'center',checkAlpha,checkScale);
      }
    }else label(String(c.remaining),c.x+5.85,c.y+12.5,40,27,'#ffffff',18,'700','#000000',false,'center',numberOpacity,numberScale,8);
    gl.uniform3f(uCarEffect,1,1,0);
    gl.uniform1f(uAngle,0);
  }
  function drawLevelPuzzle(x,y,w,h,levelNumber){
    var level=levelNumber||M3.Game.getLevel();
    var referenceKey='level/'+Math.min(level,100);
    if(level>=21){
      // Request the preview subpackage on demand. While it is still loading
      // (or when it failed) fall through to the vector artwork below, matching
      // the reference package instead of leaving the slot blank.
      ensureLevelPreviews();
      if(M3.AssetManager.getState(referenceKey)==='missing')M3.AssetManager.acquire('image',referenceKey,assetPath(referenceKey),'level-previews');
      var reference=M3.AssetManager.get(referenceKey);
      if(reference){
        shape(x,y,w,h,[1,0.96,0.86],0);
        var scale=Math.min((w-8)/reference.width,(h-8)/reference.height);
        var rw=reference.width*scale,rh=reference.height*scale;
        var px=x+(w-rw)/2,py=y+(h-rh)/2;
        sprite(referenceKey,px,py,rw,rh);
        return;
      }
    }
    var pattern=M3.Board.getPattern(level),colors=M3.Board.getColors(level);
    var rows=pattern.length,cols=pattern[0].length;
    var cell=Math.min((w-8)/cols,(h-8)/rows);
    var left=x+(w-cols*cell)/2,top=y+(h-rows*cell)/2;
    shape(x,y,w,h,[1,0.96,0.86],0);
    for(var row=0;row<rows;row++)for(var col=0;col<cols;col++){
      var symbol=pattern[row].charAt(col);if(symbol==='.')continue;
      shape(left+col*cell,top+row*cell,cell,cell,colors[parseInt(symbol,36)],0);
    }
  }
  function clipArtwork(x,y,w,h,draw){
    var scale=(812-M3.Layout.safeTop)/812;
    var sx=gl.drawingBufferWidth/375,sy=gl.drawingBufferHeight/812;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.round(x*sx),Math.round((812-M3.Layout.safeTop-(y+h)*scale)*sy),Math.round(w*sx),Math.round(h*scale*sy));
    try{draw();}finally{gl.disable(gl.SCISSOR_TEST);}
  }
  function drawModal(name){M3.FigmaUI.draw(name,sprite,label,shape,drawLevelPuzzle,clipArtwork);}
  M3.Render={
    init:function(context){
      gl=context;
      var modern=!!gl.createVertexArray,version=modern?'#version 300 es\n':'';
      var vs=version+'precision mediump float;'+(modern?'in':'attribute')+' vec2 p;uniform vec4 rect;uniform vec4 uvRect;uniform vec2 screen;uniform float angle;uniform vec2 pivot;uniform vec3 carEffect;'+(modern?'out':'varying')+' vec2 uv;void main(){uv=uvRect.xy+p*uvRect.zw;vec2 local=(rect.xy+p*rect.zw-pivot)*carEffect.xy;float c=cos(angle),s=sin(angle);vec2 q=(pivot+vec2(c*local.x-s*local.y,s*local.x+c*local.y)-vec2(0.0,carEffect.z))/screen;gl_Position=vec4(q.x*2.0-1.0,1.0-q.y*2.0,0,1);}';
      var fs=version+'precision mediump float;'+(modern?'in':'varying')+' vec2 uv;uniform vec4 color;uniform vec4 uvRect;uniform float mode;uniform float phase;uniform sampler2D tex;'+(modern?'out vec4 frag;':'')+
        'float ell(vec2 p,vec2 c,vec2 r){return length((p-c)/r);}' +
        'float roundBox(vec2 p,vec2 c,vec2 b,float r){vec2 q=abs(p-c)-b+r;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}' +
        'void main(){vec4 outColor=color;'+
        'if(mode>0.5&&mode<1.5){outColor='+(modern?'texture':'texture2D')+'(tex,uv)*color;}' +
        // The current album artwork is cropped from its card asset. Reveal it in
        // the same 100-step grid used by the homepage cycle while preserving paper.
        'else if(mode>9.5){' +
          'float a='+(modern?'texture':'texture2D')+'(tex,uv).a*0.4;' +
          'a+='+ (modern?'texture':'texture2D')+'(tex,uv+vec2(0.007,0.0)).a*0.15;' +
          'a+='+ (modern?'texture':'texture2D')+'(tex,uv-vec2(0.007,0.0)).a*0.15;' +
          'a+='+ (modern?'texture':'texture2D')+'(tex,uv+vec2(0.0,0.005)).a*0.15;' +
          'a+='+ (modern?'texture':'texture2D')+'(tex,uv-vec2(0.0,0.005)).a*0.15;' +
          'outColor=vec4(color.rgb,a*color.a);}' +
        'else if(mode>8.5){vec4 source='+(modern?'texture':'texture2D')+'(tex,uv);' +
          'vec2 q=clamp((uv-uvRect.xy)/uvRect.zw,0.0,0.9999);float group=(floor(q.y*10.0)*10.0+floor(q.x*10.0)+1.0)*2.0;' +
          'float revealed=step(group,phase);' +
          'outColor=vec4(mix(vec3(0.60),source.rgb,revealed),source.a);' +
        '}' +
        // Recolour only the green paint. Neutral highlights, glass, seats and wheels
        // retain the source material instead of being multiplied by a dark tint.
        'else if(mode>7.5){vec4 source='+(modern?'texture':'texture2D')+'(tex,uv);' +
          'float group=floor(source.a*255.0/2.0+0.5);' +
          'outColor=vec4(group>phase?vec3(0.60):source.rgb,1.0);' +
        '}' +
        'else if(mode>6.5){vec4 source='+(modern?'texture':'texture2D')+'(tex,uv);' +
          'float neutral=min(source.r,source.b);float chroma=max(0.0,source.g-max(source.r,source.b));' +
          'float paint=smoothstep(0.015,0.10,chroma);' +
          'vec3 tinted=color.rgb*max(0.0,source.g-neutral)+vec3(neutral);' +
          // Lift the vehicle artwork after recolouring so the body keeps a
          // bright toy-like finish instead of looking muted against the road.
          'outColor=vec4(min(vec3(1.0),mix(source.rgb,tinted,paint)*1.12),source.a*color.a);}' +
        'else if(mode>1.5&&mode<2.5){float d=length((uv-0.5)*2.0);if(d>1.0)discard;}' +
        'else if(mode>4.5&&mode<5.5){float d=length((uv-0.5)*2.0);if(d>=1.0)discard;outColor.a*=pow(1.0-d*d,2.0);}' +
        'else if(mode>2.5){' +
          'float walk=mode>3.5?phase:0.0;' +
          // A rounded square head keeps the grid dense while retaining a soft toy-like edge.
          // One continuous silhouette: face shading must not add geometry
          // at the seam. Gently narrow the lower part without protruding lips.
          // Rotate only the head in screen-proportional coordinates (~8 degrees).
          'float tilt=walk*0.14;float hc=cos(tilt),hs=sin(tilt);' +
          'vec2 hp=(uv-vec2(0.5+walk*0.045,0.35-abs(walk)*0.012))*vec2(1.0,1.1764706);' +
          'vec2 faceUV=vec2(hc*hp.x+hs*hp.y,-hs*hp.x+hc*hp.y)/vec2(1.0,1.1764706)+vec2(0.5,0.35);' +
          'float taper=1.0-0.12*smoothstep(0.47,0.69,faceUV.y);' +
          'vec2 headUV=vec2(0.5+(faceUV.x-0.5)/taper,faceUV.y);' +
          'float head=1.0+roundBox(headUV,vec2(0.5,0.35),vec2(0.40,0.34),0.105)/0.40;' +
          'if(mode>5.5&&head>1.0)discard;' +
          // Foreshorten the body beneath the head for the same elevated view.
          'vec2 bodyUV=vec2(0.5+(uv.x-0.5)/0.88,0.69+(uv.y-0.69)/0.82);' +
          'float armLean=max(0.0,bodyUV.y-0.67)*0.18;' +
          'float torso=1.0+roundBox(bodyUV,vec2(0.5,0.715),vec2(0.19,0.095),0.025)/0.095;' +
          'float armL=1.0+roundBox(vec2(bodyUV.x+armLean,bodyUV.y),vec2(0.255+walk*0.025,0.745+walk*0.045),vec2(0.06,0.105),0.025)/0.105;' +
          'float armR=1.0+roundBox(vec2(bodyUV.x-armLean,bodyUV.y),vec2(0.745+walk*0.025,0.745-walk*0.045),vec2(0.06,0.105),0.025)/0.105;' +
          // Short rounded legs remain separate through the whole walk cycle.
          'float legL=1.0+roundBox(bodyUV,vec2(0.38-walk*0.025,0.875-walk*0.06),vec2(0.075,0.115),0.04)/0.115;' +
          'float legR=1.0+roundBox(bodyUV,vec2(0.62-walk*0.025,0.875+walk*0.06),vec2(0.075,0.115),0.04)/0.115;' +
          'float body=min(torso,min(armL,min(armR,min(legL,legR))));float d=min(head,body);' +
          // Keep limb gaps transparent; a combined shadow would fill them in.
          'if(d>1.0){discard;}' +
          'else{' +
            // Shade the head independently of overlapping limbs: a solid
            // rounded front face above a darker, fully opaque bottom face.
            // Broad same-hue shading keeps the body readable at grid scale.
            'float neckShade=(1.0-smoothstep(0.68,0.78,bodyUV.y))*0.16;' +
            'float sideShade=smoothstep(0.42,0.78,uv.x)*0.08;' +
            'float footShade=smoothstep(0.92,0.99,bodyUV.y)*0.07;' +
            'float tone=0.88-neckShade-sideShade-footShade-smoothstep(0.70,1.0,body)*0.12;float shine=0.0;' +
            'if(head<=1.0){' +
              'float bottom=smoothstep(0.51,0.59,faceUV.y);' +
              'float bevel=smoothstep(0.80,1.0,head)*0.16;' +
              'tone=mix(0.98,0.72,bottom)-bevel;' +
              'shine=pow(max(0.0,1.0-ell(faceUV,vec2(0.34,0.14),vec2(0.24,0.15))),2.0)*0.035;' +
              'float glint=ell(faceUV,vec2(0.76,0.43),vec2(0.065,0.068));shine+=exp(-2.5*glint*glint)*0.30;' +
            '}' +
            'outColor.rgb=color.rgb*tone+vec3(shine);outColor.a=color.a;' +
          '}' +
        '}'+(modern?'frag':'gl_FragColor')+'=outColor;}';
      program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vs));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);
      var p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
      uRect=gl.getUniformLocation(program,'rect');uColor=gl.getUniformLocation(program,'color');uMode=gl.getUniformLocation(program,'mode');uScreen=gl.getUniformLocation(program,'screen');uSampler=gl.getUniformLocation(program,'tex');
      uCarEffect=gl.getUniformLocation(program,'carEffect');gl.uniform3f(uCarEffect,1,1,0);uAngle=gl.getUniformLocation(program,'angle');uPivot=gl.getUniformLocation(program,'pivot');uPhase=gl.getUniformLocation(program,'phase');uUvRect=gl.getUniformLocation(program,'uvRect');gl.uniform1f(uAngle,0);gl.uniform2f(uPivot,0,0);gl.uniform1f(uPhase,0);gl.uniform4f(uUvRect,0,0,1,1);
      gl.uniform2f(uScreen,375,812);gl.uniform1i(uSampler,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      for(var i=0;i<keys.length;i++)M3.AssetManager.acquire('image',keys[i],assetPath(keys[i]),'shared');
    },
    draw:function(){
      gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.clearColor(0.2,0.3,0.4,1);gl.clear(gl.COLOR_BUFFER_BIT);
      var G=M3.Game,L=M3.Layout,stats=M3.AssetManager.stats(),i;
      if(!assetsReady&&stats.loaded+stats.failed<stats.total){
        sprite('popup/loading-bg',0,0,375,812);sprite('popup/loading-text',81,644.6,213,25);M3.FigmaUI.progress(59,686,257,17,stats.loaded/stats.total,shape);return;
      }
      assetsReady=true;
      if(G.getState()==='home'){
        if(!subpackageQueued){subpackageQueued=true;queueSubpackages();}
        // Clean full-bleed background with standalone buttons. The center
        // artwork keeps the progress reveal (phase = completed levels).
        sprite('home/background',0,0,375,812);
        // mode-9 groups run 2..200, so double the completed count like
        // getArtworkProgress does for the album cards.
        gl.uniform1f(uPhase,Math.min(100,G.getAlbumState().completed)*2);
        shape(82,227,212,212,[1,1,1,1],9,'home/artwork');
        gl.uniform1f(uPhase,0);
        sprite('home/btn-gear',16.16,33.6,40,40);
        sprite('home/btn-add',16.16,105.6,58,58);
        sprite('home/btn-start',95.85,594.35,183.3,71.3);
        sprite('home/btn-shop',16,591,58,58);
        sprite('home/btn-works',301,591,58,58);
        sprite('home/btn-share',16,686,58,58);
        sprite('home/btn-album',301,686,58,58);
        sprite('home/btn-privacy',151.5,782,72,20);
      }
      else{
        sprite(G.getProgress().themes&&G.getProgress().themes.selected==='road2'?'game/road-beach':'game/road',0,0,375,812);
        var people=M3.Board.getPeople(),colors=M3.Board.getColors(),size=M3.Board.getSize(),p;
        // Standing beads only ever leave the board, so their count is a
        // cheap fingerprint. Boarding arrivals land in bursts; debounce the
        // re-bake (ghosts linger <100ms behind the walking person itself).
        var standing=0;
        for(i=0;i<people.length;i++)if(!people[i].gone&&!people[i].reserved)standing++;
        if(crowdCache.people!==people||(crowdCache.standing!==standing&&M3._now()-crowdCache.bakeAt>=100)){
          crowdCache.people=people;crowdCache.standing=standing;crowdCache.bakeAt=M3._now();bakeCrowd(people,size,colors);
        }
        drawCrowd();
        var slots=G.getSlots();
        for(i=0;i<slots.length;i++){var x=L.slotX(i,slots.length-1);if(!slots[i].unlocked){sprite('game/slot-locked',x,L.bayY,52,60);continue;}
          sprite('game/slot-frame',x,L.bayY,52,60);
          if(slots[i].unlockPulse>0){
            var unlock=slots[i].unlockPulse/420,shrink=unlock*unlock;
            shape(x-2,L.bayY-2,56,64,[0.55,0.9,1,Math.sin(unlock*Math.PI)*0.85],1,'game/slot-frame');
            shape(x+26-26*shrink,L.bayY+30-30*shrink,52*shrink,60*shrink,[1,1,1,unlock],1,'game/slot-locked');
          }
        }
        var cars=G.getCars();
        // Sort a render-only list: gameplay uses the original ID-indexed array.
        // Larger ground Y is closer to the camera and must be drawn last.
        var visibleCars=[];
        for(i=0;i<cars.length;i++)if(cars[i].stage!=='done'&&(cars[i].stage!=='queue'||cars[i].row<2))visibleCars.push(cars[i]);
        visibleCars.sort(function(a,b){return a.y-b.y||a.id-b.id;});
        var moving=G.getMoving();
        for(i=0;i<moving.length;i++)walkingPerson(moving[i].x,moving[i].y,colors[moving[i].person.color],moving[i].elapsed,moving[i].boarding);
        for(i=0;i<cars.length;i++){var fumes=cars[i].exhaust||[];for(var fi=0;fi<fumes.length;fi++){var f=fumes[fi],life=f.age/600,r=5+life*12;shape(f.x-r,f.y-r,r*2,r*2,[0.86,0.9,0.94,0.48*(1-life)],5);}}
        for(i=0;i<visibleCars.length;i++)drawCar(visibleCars[i]);
        sprite('hud/gear',16.1635,33.6061,40.0017,40.0048);
        // The speed dial hides once its boost is claimed for this level; it
        // comes back when the next level resets the multiplier.
        if(G.getMultiplier&&G.getMultiplier()<=1)sprite('hud/speed',L.speedX,L.speedY,L.speedSize,L.speedSize);
        sprite('hud/tools-bar',55.5,L.buttonY+3.0156,264,64.2813);
        // Tool badges follow the live stock: the clear/refresh tools show the
        // "+" hint again once their balance runs out (watch another ad);
        // upgrade keeps its one-time ad badge, shop has none.
        var badges=G.getProgress().adBadges||{};
        for(var bi=0;bi<4;bi++){
          var hasStock=(bi===1||bi===2)?G.toolStock(bi)>0:!!badges[bi];
          sprite(hasStock?'hud/badge-ad':'hud/badge-plus',[87.125,155.2803,227.375,297.3622][bi],L.buttonY,22,22);
        }
        // Level pill uses the exported capsule artwork (20% black, rounded
        // ends) with the number drawn on top.
        sprite('hud/level-pill',147.5,31.6645,80,30);
        label('关卡'+G.getLevel(),147.5,31.6645,80,30,'#ffffff',18,'600');
      }
      if(G.getModal())drawModal(G.getModal());
      if(G.getStatus()){shape(57.5,674,260,38,[0,0,0,0.8],0);label(G.getStatus(),62,675,251,36,'#ffffff',12,'500');}
    }
  };
}());
