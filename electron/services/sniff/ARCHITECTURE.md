# 视频嗅探系统架构

## 模块划分

```
sniff/
├── types.ts           # 类型定义：SniffSiteConfig, SniffFilterRule, SniffedCandidate
├── response-sniffer.ts # 核心过滤逻辑：Content-Type、二进制、filterRules、置信度
├── sniff-session.ts   # Electron 会话：webRequest 监听、点击遍历
└── index.ts
```

## 核心流程

1. **解析失败** → 用户点击「尝试嗅探」
2. **SniffSession.start** → 创建独立 partition 的 BrowserWindow，加载页面
3. **webRequest.onResponseStarted** → 拦截所有响应，用 Response Sniffer 过滤
4. **sniffTraverse** → 按 jsSelector 找到集数元素，依次 click，收集 500ms–3s 内的候选
5. **selectBestCandidate** → 置信度排序 + 时间窗口去噪，取最佳
6. **SniffPanel** → 展示候选列表，支持正则过滤、多选、加入下载

## Response Sniffer 过滤逻辑

- **Content-Type 优先**：`application/vnd.apple.mpegurl` 或含 `mpegurl` → +50
- **filterRules 匹配**：URL 符合站点配置的正则/关键词 → +30
- **二进制 #EXTM3U**：响应体前 16 字节含魔数 → +40
- **URL 含 .m3u8**：→ +10
- 置信度 < 20 丢弃；无 HLS 特征且 < 30 丢弃

## 站点配置 (SniffSiteConfig)

- `jsSelector`：集数按钮的 CSS 选择器
- `actionScript`：页面加载后执行脚本
- `filterRules`：URL 过滤，支持 `regex:pattern` 或纯关键词
