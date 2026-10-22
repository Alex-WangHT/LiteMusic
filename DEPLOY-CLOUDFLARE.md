# Cloudflare 部署

当前云端仅提供 BV 收藏管理，通过 Worker + D1 保存 BV 和分 P。播放由本地 Node 服务完成。

```powershell
npm ci --ignore-scripts
npx wrangler login
npm run db:remote
npm run check:stream
npm run deploy
```

云端 /health 应返回 cloud-library 模式，/api/video 和 /api/audio 应返回 404。云端与本地页面使用相同收藏密钥同步收藏。通过 `npm run dev` 启动本地播放器，请求 B 站和转发音频都发生在本机。

完整说明见 README.md。旧 wrangler.cloud.jsonc 属于历史下载器，不用于当前部署。
