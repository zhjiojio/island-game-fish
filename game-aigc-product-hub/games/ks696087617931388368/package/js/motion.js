(function () {
  var M3 = window.M3;
  function distance(a, b) { var x = b.x - a.x, y = b.y - a.y; return Math.sqrt(x*x + y*y); }
  function mix(a, b, t) { return { x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t }; }
  function rounded(points, radius) {
    var samples = [points[0]], total = 0, lengths = [0];
    for (var i=1;i<points.length-1;i++) {
      var before=points[i-1], corner=points[i], after=points[i+1];
      var incoming=distance(before,corner), outgoing=distance(corner,after);
      if(incoming<0.001||outgoing<0.001)continue;
      var r=Math.min(radius,incoming/2,outgoing/2);
      var start=mix(corner,before,r/incoming), end=mix(corner,after,r/outgoing);
      samples.push(start);
      for(var j=1;j<=24;j++){var t=j/24; samples.push(mix(mix(start,corner,t),mix(corner,end,t),t));}
    }
    samples.push(points[points.length-1]);
    for(var k=1;k<samples.length;k++){total+=distance(samples[k-1],samples[k]);lengths.push(total);}
    return {points:samples,lengths:lengths,length:total};
  }
  function sample(route, elapsed, duration, reverse) {
    var t=Math.max(0,Math.min(1,elapsed/duration));
    var travel=route.length*(t*t*(3-2*t)), i=1;
    while(i<route.lengths.length-1 && route.lengths[i]<travel)i++;
    var a=route.points[i-1], b=route.points[i], span=route.lengths[i]-route.lengths[i-1];
    var p=mix(a,b,span>0?(travel-route.lengths[i-1])/span:1);
    p.angle=Math.atan2(b.y-a.y,b.x-a.x)-Math.PI/2+(reverse?Math.PI:0);
    p.done=t===1;return p;
  }
  M3.Motion={
    entry:function(x,y,tx,ty){
      if(Math.abs(tx-x)<1)return rounded([{x:x,y:y},{x:tx,y:ty}],0);
      var lane=M3.Layout.driveLaneY;
      return rounded([{x:x,y:y},{x:x,y:lane},{x:tx,y:lane},{x:tx,y:ty}],16);
    },
    exit:function(x,y,left){var lane=M3.Layout.driveLaneY;return rounded([{x:x,y:y},{x:x,y:lane},{x:left?-80:455,y:lane}],16);},
    sample:sample
  };
}());
