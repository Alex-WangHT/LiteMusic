# LitePlayer：云端收藏，本地播放

云端 Cloudflare Worker + D1 只保存 BV 号、分 P、标题、作者和收藏时间。本地 Node 服务同步云端收藏，并直接请求 B 站解析和播放音频；音频不经过 Cloudflare。

## 本地使用

推荐 Node.js 24。

```powershell
npm ci --ignore-scripts
npm run dev
```

打开 http://127.0.0.1:8787，输入 BV 或 B 站视频链接获取音频。点击“收藏当前分 P”可保存视频信息，或用“直接收藏 BV”先保存编号。收藏列表中的“加载播放”通过本机解析视频。

本地默认同步 https://liteplayer.alexwang010112.workers.dev。页面的“收藏密钥与跨设备同步”可以复制、输入收藏密钥：在云端页面和本地页面使用相同密钥，即可看到同一个收藏库。两者不会自动共享浏览器存储，请手动复制密钥。密钥是访问凭据，请备份并保密。

本地端口、云端地址和云端请求代理可通过环境变量修改：

```powershell
$env:PORT='8789'
$env:CLOUD_LIBRARY_URL='https://liteplayer.alexwang010112.workers.dev'
# 可选：仅用于连接云端收藏，不改变本机对 B 站的直接请求
$env:CLOUD_PROXY_URL='http://127.0.0.1:7897'
npm run dev
```

连接云端时优先使用 CLOUD_PROXY_URL，其次 HTTPS_PROXY / HTTP_PROXY，Windows 下也会读取已启用的系统 HTTP 代理。设置 CLOUD_PROXY_URL=direct 可禁用此代理选择。不修改系统代理设置。

本地不再写入 SQLite 收藏库；以前的 `.wrangler/state/stream-local.sqlite` 文件保留，但不会自动上传旧记录。已有云端 D1 收藏继续可用。不要使用历史 `dev:web` 分离模式。

## 云端部署

```powershell
npx wrangler login
npm run db:remote
npm run check:stream
npm run deploy
```

`wrangler.jsonc` 指向 `src/library-worker.mjs`，绑定已有的 liteplayer D1。新增收藏表的迁移位于 `stream-migrations`，与历史下载器表分开管理。

云端网页只提供添加、查看、删除收藏和跳转 B 站，不提供音频播放。要调试云端收藏服务，可先执行 `npm run db:local`，再执行 `npm run dev:worker`，它使用独立的 Wrangler 本地 D1。

## 接口

- 云端 GET /api/favorites：读取收藏；POST 保存 `{ input }` 或 `{ bvid, page, title?, author?, part_title? }`；DELETE 删除 `{ bvid, page }`。需要 `Authorization: Bearer <收藏密钥>`。
- 收藏按密钥哈希隔离，相同 BV + 分 P 去重；直接收藏只检查格式，不检查视频是否存在。
- 云端 /api/video 和 /api/audio 返回 404，不发起 B 站请求。
- 本地 /api/favorites：通过固定云端地址同步收藏，浏览器无需跨域请求云端。
- 仅本地 GET /api/video?input=BV…：获取视频信息及分 P。
- 仅本地 GET/HEAD /api/audio?bvid=BV…&p=1：获取公开 M4A 独立音轨并流式转发，支持 Range / If-Range / 206 / 416，不保存音频文件。
- /health 和 /api/config：分别检查服务状态和云端/本地模式。

只支持公开且提供 DASH M4A 独立音轨的视频，不支持短链接、需登录或会员的视频。B 站接口可能变化或受本地网络限制。音频只接受固定 CDN 域名的 HTTPS 地址，不跟随重定向。Cloudflare 不承担音频流量。

## 测试

```powershell
npm run test:stream
node test/favorites-live.mjs http://127.0.0.1:8787
# Windows 系统代理网络下的云端测试
./test/favorites-live.ps1 -BaseUrl https://liteplayer.alexwang010112.workers.dev
```

真实收藏测试使用独立测试密钥，结束后清理测试收藏。单元测试覆盖云端收藏、隔离、分 P、播放分段和重定向拒绝；本地音频需用实际 BV 验证。

历史个人库、下载器源码和 wrangler.cloud.jsonc 仍保留，不属于当前默认部署流程。当前服务不使用 R2、FFmpeg、Docker 或 Containers；`--ignore-scripts` 跳过历史 FFmpeg 二进制安装。
