(function () {
  var M3 = window.M3;
  // The play grid fills the space between the HUD and the parking bay as
  // large as possible so the small puzzle cells stay readable. The board top
  // sits 5px below the level pill (which ends at y 61.6645); the bay keeps
  // a 10px gap below the board.
  M3.Layout = {
    w: 375, h: 812, safeTop: 0,
    boardX: 8, boardY: 66.6645, boardW: 359, boardH: 388,
    bayY: 464.6645, carY: 583, secondCarY: 663, queuePitch: 80, driveLaneY: 558, buttonY: 733,
    speedX: 0, speedY: 540, speedSize: 56.627,
    // Slot callers pass the last index; include locked bays in the full row.
    slotX: function (i, count) {
      var step=count===4?61.25:56;
      return (M3.Layout.w-(count*step+52))/2+i*step;
    },
    queueX: function (i, count) {
      return (M3.Layout.w-((count-1)*56+51.7))/2+i*56;
    }
  };
  // Square heads in screen space; fit the complete crowd including front feet.
  M3.Layout.crowd = function (cols, rows) {
    var L=M3.Layout,scale=(812-L.safeTop)/812;
    var side=Math.min(L.boardW/cols,L.boardH*scale*0.68/(rows*0.56+0.42));
    var h=side/0.68/scale,pitch=h*0.56,totalH=h*(rows*0.56+0.42);
    return {cellW:side,cellH:pitch,w:side/0.80,h:h,
      x:L.boardX+(L.boardW-cols*side)/2+side/2,
      y:L.boardY+(L.boardH-totalH)/2+h*0.28};
  };
}());
