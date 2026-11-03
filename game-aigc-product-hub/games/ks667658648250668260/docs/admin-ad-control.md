# 管理员广告开关

客户端入口与统一广告回调已接入 v90.9。`package/js/admin-ad-config.js` 的身份接口地址目前为空，因此所有真实账号继续正常广告，管理员悬浮球暂不显示。

用户指定的两个 openid 白名单仅放在 `server/admin-ad-auth.cjs`。服务器通过快手小游戏官方 `jscode2session` 校验登录 code；客户端不接受本地 openid、网址参数或本地管理员标记作为权限。

接入需要将该服务部署为 HTTPS，并配置小游戏 request 合法域名；服务端环境变量使用本游戏 AppID 和 AppSecret，禁止把 AppSecret 放进小游戏包。之后将完整 `POST /admin/ad-auth` 地址填入 `identityEndpoint`。

管理员默认开启广告；关闭后按原成功回调解锁，重新开启恢复 SDK。身份失败、过期、后台或切换为普通账号均不允许 bypass。开关仅保留于当前进程。

agw-work-mode.zip 的 `skills/agw-scaffold/user/login.md` 与 `skills/agw-scaffold/open/user-info.md` 明确说明：ks.login 返回 code；getUserInfo 不含 openid；需要开发者服务器换取身份。压缩包登录模板本身也保留了该服务端 TODO。

统一小游戏包仍含通用客户端实现；只允许管理员使用功能不等于对普通客户端下载隐藏所有相关 JS 字节。服务端白名单与密钥不在小游戏包中。
