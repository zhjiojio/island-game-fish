(function () {
  var M3=window.M3;
  // Bounds read from Figma, relative to each 375 x 812 frame. PNGs are
  // exports of the referenced foreground nodes, including Figma crop/masks.
  var panels={
    refresh:{node:'10660:8331',rect:[28.2306,158.2673,318.5388,430.3799],close:[296,262,47,48],button:[101,482,174,61],action:'refreshReward'},
    revive:{node:'10660:8332',rect:[28.2306,163.9055,318.5388,419.1034],close:[298,273,47,47],button:[101,495.7,173,61.027],action:'revive'},
    upgrade:{node:'10660:8333',rect:[16.8879,118.8567,341.2241,463.2428],close:[289,226,46,48],button:[98,480,176.417,59.643],action:'upgrade'},
    shop:{node:'10645:7188',rect:[27.7329,165.2212,319.5341,433.7966],close:[299,208,40,42]},
    win:{node:'10660:8334',rect:[3.2813,87.7258,360.4902,512.8196]},
    loss:{node:'10660:8335',rect:[28.8995,166.3643,317.2009,410.5945]},
    album:{node:'10670:8376',rect:[43.3575,164.2727,288.285,483.4546],close:[287,209,40,40]},
    works:{node:'10670:8377',rect:[43.3575,164.2727,288.285,483.4546],close:[287,209,40,40]},
    privacy:{rect:[15,78,345,650],close:[300,215,44,44]},
    daily:{node:'10660:8341',rect:[36.4477,157.0522,302.1047,415.9479],close:[288,261,45,47],button:[96,479,188,60],action:'dailyReward'},
    settings2:{node:'10648:7593',rect:[36.4477,160.4641,302.1047,415.9479],close:[286,219,47,48],asset:'settings/panel-home'},
    settings:{node:'10649:7995',rect:[36.4477,109.3584,302.1047,525.3292],close:[286,169,47,48],asset:'settings/panel-game'}
  };
  function key(name){return name==='settings'&&M3.Game.getState()==='home'?'settings2':name;}
  // Shop cards follow the reference package layout: card background, theme
  // artwork, title label and unlock button are drawn as separate layers.
  var shopItems=[{image:'shop/theme-road',title:'经典公路',button:'shop/btn-owned',action:'selectRoad'},
    {image:'shop/theme-beach',title:'夏日沙滩',button:'shop/btn-owned',action:'selectBeach'},
    {image:'shop/theme-more',title:'更多主题',button:'shop/btn-owned'}];
  function inside(r,x,y){return r&&x>=r[0]&&y>=r[1]&&x<=r[0]+r[2]&&y<=r[1]+r[3];}
  M3.FigmaUI={
    panels:panels,shopItems:shopItems,
    hit:function(name,x,y){
      var k=key(name),p=panels[k];if(!p)return null;
      if(inside(p.close,x,y))return 'close';
      if(inside(p.button,x,y))return p.action;
      if(k==='settings'||k==='settings2'){
        var top=k==='settings'?252.8943:304;
        for(var i=0;i<3;i++)if(inside([230.4545,top+75*i,64,32],x,y))return 'toggle'+i;
        if(k==='settings'){
          if(inside([41.3557,510.4868,59.937,55.228],x,y))return 'home';
          if(inside([111.9629,506.6851,142.85,59.03],x,y))return 'restart';
          if(inside([267.9512,508.6565,69.114,57.059],x,y))return 'skip';
          if(inside([110.4835,577,145.809,57.688],x,y))return 'close';
        }
      }
      if(k==='win'||k==='loss'){
        var y0=k==='win'?504:519;
        if(inside([k==='win'?68:53,y0,60,56],x,y))return 'home';
        if(inside([k==='win'?132:117,y0,k==='win'?113:141,56],x,y))return k==='win'?'next':'restart';
        if(inside([k==='win'?247:266,y0,60,56],x,y))return 'share';
      }
      if(k==='privacy')return null;
      if(k==='works'||k==='album'){
        if(inside([67.698,576,78,30],x,y))return 'previousPage';
        if(inside([229.3,576,78,30],x,y))return 'nextPage';
      }
      if(k==='shop'){
        for(var si=0;si<shopItems.length;si++)if(inside([63.784+(si%3)*83.708,336+Math.floor(si/3)*108,75.708,25],x,y))return shopItems[si].action||null;
      }
      return null;
    },
    draw:function(name,sprite,label,shape,drawLevelPuzzle,clipArtwork){
      var k=key(name),p=panels[k];if(!p)return;
      shape(0,0,375,812,[0,0,0,0.8],0);
      if(k==='privacy'){
        sprite('popup/privacy-panel',p.rect[0],p.rect[1],p.rect[2],p.rect[3]);
        var privacyText='生效日期：2026年9月22日\n\n北京慕远科技有限公司及其关联公司（以下简称“我们”）深知个人信息对您的重要性，我们将按照法律法规的规定，保护您的个人信息及隐私安全。我们制定本《隐私政策》并特别提示：希望您在使用我们的小游戏前仔细阅读并理解本《隐私政策》，以便做出适当的选择。\n\n【特别提示】请您仔细阅读本《隐私政策》，尤其是加粗、划线的内容，以充分理解您的个人信息的处理规则。如您在阅读或使用小游戏过程中有任何疑问，可通过本隐私政策预留的联系方式与我们沟通。如您经沟通后仍不同意本隐私政策的条款，有权立即停止访问和使用。\n\n一、我们如何收集和使用您的个人信息\n\n1. 账号登录\n当您登录我们的小游戏时，我们将申请使用您的快手账号信息（包括快手昵称、头像及您授权的其他信息），以完成账号登录、标识您的游戏身份并展示游戏内个人信息。\n\n2. 支付服务\n当您在游戏内进行充值、购买服务或虚拟资产时，部分支付服务由我们的合作方及第三方支付机构向您提供，我们、我们的合作方及第三方支付机构可能会获取您的订单信息（如订单流水号、支付金额、优惠券信息、商品信息、银行信息等），这些信息是支付功能所必需的信息，拒绝提供将导致您无法使用该功能，但不影响其他功能的正常使用。\n\n3. 分享\n（1）我们支持您将游戏内容分享至快手聊天、朋友圈或外部平台。分享功能由您主动触发，我们不会未经您的操作自动分享您的信息。\n（2）我们在游戏中向您提供榜单功能，如游戏排行榜，在榜单中我们会对信息内容、用户等进行自动化排序展示，您的昵称、头像等账号公开信息、我们根据您在游戏内的行为情况形成统计数据等将在榜单中公开展示。\n\n4. 运营安全保障与统计分析\n（1）为了向用户提供优质而可靠的内容、服务，维护产品及功能的正常稳定运行，更好地预防恶意程序、钓鱼网站、网络漏洞、计算机病毒、网络攻击、网络侵入安全风险，更准确地识别违反法律法规或平台相关规则的情况，我们需收集、使用和整合终端用户的设备信息、操作日志信息、传感器信息以及用户授权的信息，用于分析服务的稳定性、判断账号安全、进行身份验证、识别违法违规情况、检测及防范安全事件，依法采取必要的记录、分析、处置措施。\n（2）设备信息：设备标识信息（OAID、IDFA、IDFV、AndroidID及其他综合设备参数和系统信息形成的设备标识符，不同的标识符在有效期、是否可由用户重置以及获取方式及不同系统方面会有所不同）、网络相关信息（蓝牙、IP地址、网络状态、类型、接入方式、网络质量数据）、设备参数信息（设备名称、设备型号）、硬件操作系统信息（操作系统、语言、分辨率）。\n（3）为了提升运营质量与效率而进行研究、统计分析时，我们可能会收集您在游戏中的游戏行为数据以及其他根据上述场景收集的个人信息，用于优化游戏体验和改进游戏功能。上述数据均为去标识化后的统计数据分析，我们不会将其用于识别您的特定身份。\n\n5. 征得同意的例外\n根据法律法规规定，在下列情形中，处理您的个人信息无需征得您的同意：\n（1）为订立、履行您作为一方当事人的合同所必需，或者按照依法制定的劳动规章制度和依法签订的集体合同实施人力资源管理所必需；\n（2）为履行法定职责或者法定义务所必需；\n（3）为应对突发公共卫生事件，或者紧急情况下为保护自然人的生命健康和财产安全所必需；\n（4）为公共利益实施新闻报道、舆论监督行为，在合理的范围内处理您的个人信息；\n（5）依照《个人信息保护法》规定在合理范围内处理您自行公开或者其他已经合法公开的个人信息；\n（6）法律行政法规规定的其他情形。\n\n二、我们如何委托处理、共享、转移、公开披露您的个人信息\n1. 委托处理\n为了向您提供更完善、更优质的产品和/或服务，某些功能可能由我们的技术服务合作方提供，我们可能会委托合作方处理您的某些个人信息。我们会与受托处理您个人信息的合作方依据法律规定签署相关协议，并对其个人信息处理活动进行约束和监督。\n\n2. 共享\n为实现本隐私政策中声明的目的，我们需与关联公司或第三方合作伙伴共享您的个人信息。我们将遵守合法、正当、必要的原则，审慎评估合作伙伴的处理目的、安全保障能力，并根据法律规定签署相关协议。同时，我们会对合作伙伴进行严格的监督与管理，一旦发现其存在违规违约行为，将立即停止合作并追究其法律责任。\n\n3. 合作场景\n（1）为实现本隐私政策中声明的目的，我们的某些服务将由我们和授权合作伙伴共同提供或者委托处理，如第三方支付机构、活动合作方等。我们可能会与合作伙伴共享您的某些个人信息，以提供更好的客户服务和用户体验。我们仅会出于合法、正当、必要的目的共享您的个人信息，并且只会提供服务所必要的个人信息。\n（2）在法定情形下的共享。我们可能会根据法律法规规定、诉讼争议解决需要，或按行政、司法机关依法提出的强制性要求，共享您的个人信息。\n（3）在获取您同意的情况下共享：获得您的同意后，我们可能与第三方共享您的个人信息；\n（4）为提升相关领域的科研能力，促进科技发展水平，我们在确保数据安全与目的正当的前提下，可能会与合作的科研院所、高校等机构使用去标识化或匿名化的数据。\n（5）为保障游戏功能的实现与应用的稳定运行，我们需与快手平台共享，并从快手平台处使用您快手账号内的相关信息（如基本账号信息、身份认证信息、设备信息、行为数据、支付交易数据等），以实现账号登录、广告、支付等对应功能及目的。关于快手平台如何收集、使用您的个人信息，您可以参考快手平台的服务协议及隐私政策。\n\n4. 转移\n如我们因合并、分立、解散、被宣告破产需要转移个人信息的，会向您告知接收方的名称或者姓名和联系方式。我们会要求接收方继续履行本隐私政策约定义务。接收方变更原先的处理目的、处理方式的，其将重新向您征求同意。\n\n5. 公开披露\n我们不会主动公开您未自行公开的信息，除非遵循国家法律法规规定或者获得您的同意。\n\n三、我们如何存储和保护您的个人信息\n1. 存储地点\n我们会按照法律法规的规定，将在中国境内运营过程中收集和产生的个人信息存储于中国境内。\n\n2. 存储期限\n我们仅在为实现目的所必需的时间及法律法规所规定的保存期限内保留您的个人信息，超出上述存储期限后，我们会对您的个人信息进行删除或匿名化处理。\n\n3. 安全保护措施\n我们已采取符合业界标准、合理可行的安全防护措施保护您的信息，防止个人信息遭到未经授权访问、公开披露、使用、修改、损坏或丢失，包括数据加密传输、访问权限控制、安全审计等。\n\n四、您的权利\n在您使用我们的游戏期间，您可以通过以下方式行使相关权利，我们会在符合法律法规要求的情形下响应您的请求。\n\n1. 查询与更正\n您可以在游戏内【我的】页面查看您的昵称、头像等账户信息。\n如您需要更正您的快手账号信息，您可以通过快手APP-左上角【≡】-【设置】以及APP-【我】更正您的快手昵称等账号信息。\n\n2. 删除\n您可以通过本政策公示的联系方式向我们提出删除您个人信息的请求。\n\n3. 撤回同意\n您可以通过快手APP设置页面关闭相应权限，即视为撤回对相应信息收集的同意。\n\n4. 注销账号\n您可以通过快手APP左上角【≡】-【设置】-【账号与安全】-【注销账号】注销您的快手账号，注销后我们将在合理期限内删除您的个人信息或进行匿名化处理；因适用的法律和安全技术限制必须留存的，我们将停止除存储和采取必要的安全保护措施之外的处理。\n请注意，当您撤回同意或删除信息后，我们可能无法继续为您提供相应的游戏功能和服务。\n\n五、未成年人保护\n我们非常重视对未成年人个人信息的保护。我们的游戏不面向未满14周岁的未成年人。如果您是未满14周岁的未成年人，请勿使用我们的游戏或向我们提供个人信息。\n如果我们发现在未获得监护人同意的情况下收集了未满14周岁未成年人的个人信息，我们将尽快删除相关信息。\n\n六、本政策的更新\n我们可能适时修订本政策。当政策条款发生变更时，我们会在游戏内或以其他适当方式向您展示变更后的政策。对于重大变更，我们会以更为显著的方式通知您。\n\n七、如何联系我们\n如果您对本政策有任何疑问、意见或建议，可以通过【ksxyxpt@kuaishou.com】与我们联系。\n我们将尽快审核所涉问题，并在验证您的身份后及时予以回复。一般情况下，我们将在十五个工作日内回复您的请求。';
        var lines=[],paragraphs=privacyText.split('\n');
        paragraphs.forEach(function(paragraph){
          if(!paragraph){lines.push('');return;}
          while(paragraph.length>19){lines.push(paragraph.slice(0,19));paragraph=paragraph.slice(19);}
          lines.push(paragraph);
        });
        M3.Game.setPrivacyHeight(lines.length*24+16);
        clipArtwork(48,284,279,379,function(){
          var scroll=M3.Game.getPrivacyScroll?M3.Game.getPrivacyScroll():0;
          for(var pi=0;pi<lines.length;pi++){
            var y=288+pi*24-scroll;
            if(lines[pi]&&y+24>284&&y<663)label(lines[pi],48,y,279,24,'#192537',14,/^[一二三四五六七八九]|^[1-5]\.|^【|^生效/.test(lines[pi])?'700':'400',null,null,'left');
          }
        });
        return;
      }
      sprite(p.asset||'popup/panel-'+k,p.rect[0],p.rect[1],p.rect[2],p.rect[3]);
      if(k==='settings'||k==='settings2'){
        var top=k==='settings'?252.8943:304,settings=M3.Game.getProgress().settings;
        for(var i=0;i<3;i++)sprite(settings[i]?'settings/switch-on':'settings/switch-off',230.4545,top+i*75,64,31);
      }
      if(k==='shop'){
        shopItems.forEach(function(item,i){
          var x=63.7839+83.708*(i%3),y=262.8871+Math.floor(i/3)*108;
          sprite('shop/card-bg',x,y,75.7079,98.6339);
          sprite(item.image,x+4,y+4,67,51.333);
          label(item.title,x,y+58,75.7079,16,'#034383',10,'700');
          var themes=M3.Game.getProgress().themes||{};
          // Locked beach card shows the ad-free button art; unlocked skins
          // show the green check (owned) button; the "more themes" card gets
          // the coming-soon button.
          if(i===1&&!themes.road2Unlocked)sprite('shop/btn-ad-free',x+5.35,y+74,65,20);
          else if(i===0||i===1)sprite('shop/btn-owned',x+5.35,y+74,65,20);
          else if(i===2)sprite('shop/btn-soon',x+5.35,y+74,65,20);
        });
      }
      if(k==='upgrade'){
        var speed=M3.Game.getProgress().speed;
        label(String(speed-10),195.83,389.4,24,27.5,'#fd5734',20,'700');
        label(String(speed),197.96,435.9,27.78,24.63,'#fd5734',18,'700');
        M3.FigmaUI.progress(88.6127,421.0103,197.7747,16.84,(speed-10)/10,shape);
        if(speed>=20){shape(98,480,176.417,59.643,[0.1,0.15,0.2,0.7],0);label('已满级',98,491,176.417,36,'#ffffff',20,'700');}
      }
      if(k==='win')drawLevelPuzzle(120.5573,328.9946,134.8207,145.9395,M3.Game.getLevel());
      if(k==='works'||k==='album'){
        var page=M3.Game.getCollectionPage?M3.Game.getCollectionPage():1;
        if(k==='album'){
          var album=M3.Game.getAlbumState();
          var unlocked=['album/card-1','album/card-55','album/card-66','album/card-77','album/card-88','album/card-44'];
          var locked=[null,'album/card-5','album/card-6','album/card-7','album/card-8','album/card-4'];
          function capsule(px,py,pw,ph,color){
            if(pw<=0)return;
            var r=Math.min(ph,pw);
            shape(px+r/2,py,pw-r,ph,color,0);shape(px,py,r,ph,color,2);shape(px+pw-r,py,r,ph,color,2);
          }
          // Cover the baked 1/500 label and render the six-artwork cycle state.
          capsule(116.8,239,141.4,26.6,[1,0.875,0.55]);
          label('解锁进度: '+album.unlocked+'/'+album.total,116.8,239,141.4,26.6,'#95430c',12,'700');
          for(var albumSlot=0;albumSlot<6;albumSlot++){
            var ax=66.5+(albumSlot%3)*82,ay=280+Math.floor(albumSlot/3)*94;
            var available=albumSlot<=album.index;
            sprite(available?unlocked[albumSlot]:locked[albumSlot],ax,ay,78,88.93);
            if(available){
              var value=albumSlot<album.index?1:(album.progress/album.cycle);
              // Component 1 contains an old baked bar. This opaque patch makes
              // every card use the same separately rendered progress bar.
              capsule(ax+8.6,ay+74.4,60.8,10,[1,0.965,0.865]);
              capsule(ax+10,ay+77,58,5.7,[0.49,0.52,0.60]);
              capsule(ax+10,ay+77,58*value,5.7,[1,0.76,0.035]);
            }
          }
          return;
        }
        if(k==='works'){
          var completed=M3.Game.getProgress().completed||[],unique={};
          completed.forEach(function(n){if(n===Math.floor(n)&&n>=1&&n<=600)unique[n]=true;});
          label('解锁进度: '+Object.keys(unique).length+'/600',116.8,239,141.4,26.6,'#95430c',12,'700');
          label('第'+page+'页',153.32,576,68.36,29.076,'#95430c',12,'700');
          var worksScroll=M3.Game.getWorksScroll?M3.Game.getWorksScroll():0;
          function rounded(x,y,w,h,r,color){
            shape(x+r,y,w-2*r,h,color,0);shape(x,y+r,w,h-2*r,color,0);
            shape(x,y,r*2,r*2,color,2);shape(x+w-r*2,y,r*2,r*2,color,2);
            shape(x,y+h-r*2,r*2,r*2,color,2);shape(x+w-r*2,y+h-r*2,r*2,r*2,color,2);
          }
          clipArtwork(65.5,279,244,287,function(){
            for(var slot=0;slot<30;slot++){
              var n=(page-1)*30+slot+1;
              var x=66.5+(slot%3)*82,y=280.01+Math.floor(slot/3)*82-worksScroll;
              if(unique[n]){
                rounded(x,y,78,78,6,[0.824,0.608,0.255]);
                rounded(x+1,y+1,76,76,5,[0.984,0.851,0.522]);
                rounded(x+5,y+5,68,68,6,[1,1,1]);
                rounded(x+6,y+6,66,66,5,[1,0.96,0.86]);
                drawLevelPuzzle(x+9,y+9,60,60,n);
              }else sprite('album/frame-locked',x,y,78,78);
            }
          });
          return;
        }
      }
    },
    progress:function(x,y,w,h,value,shape){
      function capsule(px,py,pw,ph,c){if(pw<=0)return;var r=Math.min(ph,pw);shape(px+r/2,py,pw-r,ph,c,0);shape(px,py,r,ph,c,2);shape(px+pw-r,py,r,ph,c,2);}
      capsule(x+0.6,y+1.4,w-0.6,h-1.4,[0.302,0.325,0.408,0.6]);
      capsule(x,y,w-0.6,h-1.4,[1,1,1]);
      capsule(x+2,y+2,w-4.6,h-5.4,[0.302,0.325,0.408]);
      capsule(x+2,y+2,(w-4.6)*Math.max(0,Math.min(1,value)),h-5.4,[1,0.78,0.04]);
    }
  };
}());
