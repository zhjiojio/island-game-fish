GameGlobal.wx = ks
wx.onMessage = function() {}
wx.getOpenDataContext = function() {}
GameGlobal.window = GameGlobal
wx.getPerformance = function() {
    return {
        now: function() {
            return new Date().getTime()
        }
    }
}
