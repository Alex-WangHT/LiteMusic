# LiteMusic

本地音乐播放器主模块。BV 列表只通过云端读取、添加和删除，不保存本地副本，也没有离线待同步队列。启动后自动连接已配置的云端；首次使用请在“云端连接设置”填写服务地址和访问密钥。本地只保存连接配置和播放模式，旧 BV 缓存会在启动时清除。音频仍由本地请求 B 站。

```powershell
git clone --recurse-submodules https://github.com/Alex-WangHT/LiteMusic.git
cd LiteMusic
npm ci
npm run pet
# 或仅在浏览器使用
npm run dev
```

桌宠源码位于根目录的 `pet/` Git 子模块。双击 `start-whale.cmd` 可启动桌宠，播放器自带本地服务。只支持公开且提供 M4A 独立音轨的视频。

本地接口：`GET /api/video?input=BV…` 获取视频信息，`GET/HEAD /api/audio?bvid=BV…&p=1` 获取音频并支持 Range，`GET /health` 检查服务状态。列表接口为 GET/POST/DELETE /api/playlist，通过本地服务转发到配置的云端 /api/favorites，使用 Bearer 访问密钥。工程只包含同步客户端，不包含云端服务端和部署代码。

```powershell
npm test
npm run test:pet
```

`npm run build:pet` 可打包免安装程序，输出位于 release/。Windows x64 exe 可从 GitHub Releases 下载。模型署名和非商业许可见 `pet/NOTICE.md` 及 `pet/LITEMUSIC.md`。

工程结构：根目录为主模块（public、src、scripts、test），pet/ 为独立 Git 子模块。所有启动与打包命令均在根目录执行。

下载：https://github.com/Alex-WangHT/LiteMusic/releases

首次连接时填写云端地址和收藏访问密钥（lp_ 加 64 位十六进制字符），此密钥不是 Cloudflare API Token。同一密钥对应同一份云端列表。

pet 子模块为私有仓库 Alex-WangHT/LiteMusic-Pet。源码递归克隆需要该仓库的访问权限；仅运行发布的 exe 无需克隆源码。
