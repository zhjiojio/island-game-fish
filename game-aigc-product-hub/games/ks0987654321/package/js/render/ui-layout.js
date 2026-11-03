(function () {
  var M3 = window.M3;
  function rect(x,y,w,h){return{x:x,y:y,w:w,h:h};}
  function contains(r,x,y){return x>=r.x&&y>=r.y&&x<=r.x+r.w&&y<=r.y+r.h;}
  function layout() {
    var w=M3.Layout.w||414,h=M3.Layout.h||896,top=M3.Layout.safeTop||0,usable=h-top,margin=Math.max(12,w*0.04),boardW=w-margin*2,cell=Math.min(boardW/10,(usable*0.56)/8),boardH=cell*8,boardX=(w-cell*10)/2,boardY=top+usable*0.16,i,cards=[],cardW=(w-margin*2-10)/3,mapList=rect(margin,top+usable*.15,w-margin*2,usable*.79),levelRowH=usable*.205,levelGap=usable*.018;
    for(i=0;i<6;i+=1)cards.push(rect(margin+(i%3)*(cardW+5),top+usable*0.27+Math.floor(i/3)*(cardW*0.72+8),cardW,cardW*0.72));
    return { w:w,h:h,top:top,usable:usable,homeHero:rect(w*.1,top+usable*.19,w*.8,usable*.34),homeStart:rect(w*.2,top+usable*.66,w*.6,usable*.1),mapUpgrade:rect(w*.72,top+usable*.075,w*.24,usable*.06),mapList:mapList,levelRowH:levelRowH,levelGap:levelGap,levelCard:function(index,scroll){return rect(mapList.x,mapList.y+index*(levelRowH+levelGap)-(scroll||0),mapList.w,levelRowH);},detailPreview:rect(w*.12,top+usable*.16,w*.76,usable*.34),detailBack:rect(w*.08,top+usable*.73,w*.20,usable*.09),detailStart:rect(w*.31,top+usable*.73,w*.61,usable*.09),cards:cards,progressionBack:rect(margin,top+usable*.79,w*.20,usable*.075),pagePrev:rect(margin,top+usable*.68,w*.18,usable*.07),pageNext:rect(w-margin-w*.18,top+usable*.68,w*.18,usable*.07),deckStart:rect(w*.2,top+usable*.79,w*.6,usable*.09),board:rect(boardX,boardY,cell*10,boardH),cell:cell,cardBarY:top+usable*.79,towerPanel:rect(w*.20,top+usable*.67,w*.60,usable*.10),towerUpgrade:rect(w*.48,top+usable*.685,w*.28,usable*.07),resultButton:rect(w*.2,top+usable*.68,w*.6,usable*.11) };
  }
  M3.UILayout={get:layout,contains:contains};
})();
