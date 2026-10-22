# LiteMusic

本地音乐播放器主模块。BV 列表只通过云端读取、添加和删除，不保存本地副本，也没有离线待同步队列。启动后自动连接已配置的云端；首次使用请在“云端连接设置”填写服务地址。支持新建、切换和删除多个云端播放列表，各列表按 ID 独立存储，名称和歌曲均为明文，无需访问密钥。连接同一服务的设备共享读写权限。本地只保存连接配置和播放模式，旧 BV 缓存会在启动时清除。音频仍由本地请求 B 站。

```powershell
git clone --recurse-submodules https://github.com/Alex-WangHT/LiteMusic.git
cd LiteMusic
npm ci
npm run pet
# 或仅在浏览器使用
npm run dev
```

桌宠源码位于根目录的 `pet/` Git 子模块。双击 `start-whale.cmd` 可启动桌宠，播放器自带本地服务。只支持公开且提供 M4A 独立音轨的视频。

本地接口：`GET /api/video?input=BV…` 获取视频信息，`GET/HEAD /api/audio?bvid=BV…&p=1` 获取音频并支持 Range，`GET /health` 检查服务状态。列表接口为 GET/POST/DELETE /api/playlist，通过本地服务转发到配置的云端 /api/favorites；列表管理通过 /api/playlist?resource=playlists 转发到 /api/playlists。Workers 源码位于 LiteMusicServer-bilibili-stream/。

```powershell
npm test
npm run test:pet
```

`npm run build:pet` 可生成 Windows x64 安装向导，输出位于 release/，支持选择安装目录、创建桌面和开始菜单快捷方式，以及通过 Windows 卸载程序。安装包可从 GitHub Releases 下载。模型署名和非商业许可见 `pet/NOTICE.md` 及 `pet/LITEMUSIC.md`。

工程结构：根目录为主模块（public、src、scripts、test），pet/ 为独立 Git 子模块。所有启动与打包命令均在根目录执行。

下载：https://github.com/Alex-WangHT/LiteMusic/releases

Workers 更新时先在服务端目录执行 npm run db:remote，再执行 npm run deploy。新增迁移 0002_playlists.sql 创建公开列表与歌曲表；旧 stream_favorites 数据保留，不自动转入公开列表。客户端只保存云端地址和播放模式，不缓存歌曲列表。

pet 子模块为私有仓库 Alex-WangHT/LiteMusic-Pet。源码递归克隆需要该仓库的访问权限；仅运行发布的 exe 无需克隆源码。
