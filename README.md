# 拼读星球 PhonicsStar 🌟

面向中国小学生的**自然拼读（Phonics）英语学习 App**，杀手场景是 **「AI 听写陪练」**——AI 替爸爸妈妈报听写，孩子随时独立开练；同时内置 **语文默写陪练**，生字词句听默写一键搞定。

核心设计：`Word.graphemes` **音素↔字母对齐数据** 是整个产品的地基，支撑音素切分动画、拼式选择题、逐位批改与错因归类。

---

## ✨ 主要功能模块

| 模块 | 说明 |
|---|---|
| 🏠 **首页** | 问候 + 连续打卡、今日任务（复习/听写直达）、四大模式快捷入口、每日一句 |
| 📖 **学拼读** | 按拼读规则 L0–L8 分级闯关；音素↔字母对齐驱动的拼读讲解与练习 |
| ✏️ **报听写** | 三种出题来源：**教材同步**（人教 PEP、译林版 4–6 年级含 2025 新版四上，8 册 60 单元）、**错词本出发**、**自由选词**（搜索 + 分类勾选）；AI 报读（浏览器 / 服务端双引擎、口音与语速可调）、逐位批改反馈、提示级别（无 / 首字母 / 中文释义 / 音素块）；播放次数、教材/单元选择等全部**随账号持久化** |
| 🀄 **语文默写** | 录入词语/句子 → 防抖自动存草稿（关页不丢）→ 逐词报读 + 书写倒计时；报读设置（语速/节奏/报序号/每条读几遍/书写倒计时）；**家长查看本词密码门禁**（服务端验证、逐词自动上锁、忘记密码可用账号登录密码找回）；**默写广场**展示今日全体学员词单（纯内容签名去重） |
| 🔁 **复习** | 基于 **FSRS 间隔重复算法**（自研实现）调度到期单词，稳定/难度/遗忘次数全量建模 |
| 📕 **错词本** | 错词自动归因（音素 / 切分 / 拼式 / 不规则词 / 后缀 / 记忆 / 书写），按拼式分组重练 |
| 📊 **报告** | 每日听写量、正确率、复习量、学习时长（DailyStat），家长一眼看懂 |
| ⚙️ **设置** | 昵称/年级/口音（美音 en-US / 英音 en-GB）/TTS 引擎切换；第三方服务配置状态面板（`/api/config`） |
| 👤 **账号体系** | 注册登录（scrypt 加盐哈希）、会话双通道（httpOnly Cookie + Bearer Token，兼容 iframe 预览环境）、学习数据全账号隔离 |

视图路由采用 **hash 路由**（`/#/learn`、`/#/zhdictation` 等），刷新 / 后退 / 前进 / 深链接均保持当前视图。

---

## 🛠 技术栈

- **框架**：Next.js 16（App Router）+ React 19 + TypeScript 5
- **UI**：Tailwind CSS 4 + shadcn/ui（New York 风格）+ lucide-react + framer-motion
- **状态**：Zustand（客户端状态）；服务端状态经统一 `api-client` 封装请求
- **数据库**：Prisma ORM + SQLite（零运维，单文件 `db/custom.db`）
- **AI 能力**：内置 z-ai SDK（服务端 TTS / LLM），未配置第三方服务时自动降级可用
- **运行时**：[bun](https://bun.sh)（推荐，也可用 node + npm）

---

## 📁 项目架构

```
my-project/
├── src/
│   ├── app/
│   │   ├── page.tsx            # 唯一页面：按 Zustand currentView 渲染八大视图（hash 路由同步）
│   │   └── api/                # App Router API 路由（全部走 requireUser 鉴权）
│   │       ├── auth/           #   register / login / logout / me
│   │       ├── books/ words/   #   教材单元、词库查询
│   │       ├── curriculum/     #   拼读分级课程
│   │       ├── dictation/      #   听写出词 + 逐词批改
│   │       ├── review/         #   FSRS 到期复习
│   │       ├── errorbook/      #   错词本
│   │       ├── stats/          #   学习统计（今日/连续打卡/报告）
│   │       ├── user/           #   用户资料 + settings 白名单合并
│   │       ├── config/         #   第三方服务配置状态
│   │       ├── tts/            #   服务端 TTS 代理
│   │       └── zh-dictation/   #   语文默写（草稿/词单/广场/密码 pin）
│   ├── components/
│   │   ├── phonics/            # 英语模块视图组件（Home/Learn/Dictation/Review/ErrorBook/Report/Settings/壳层）
│   │   ├── chinese/            # 语文默写视图（ZhDictationView）
│   │   └── ui/                 # shadcn/ui 基础组件
│   ├── hooks/                  # use-speech（TTS 播放）、use-zh-dictation（默写会话状态机）等
│   ├── lib/
│   │   ├── api-client.ts       # 统一请求封装（自动附带 Bearer Token）、全部 DTO 与 API 方法
│   │   ├── store.ts            # Zustand 全局状态 + hash 路由
│   │   ├── fsrs.ts             # FSRS 间隔重复算法
│   │   ├── phonics/            # g2p.ts 字母→音素对齐、diagnose.ts 错因诊断
│   │   ├── zh-dictation.ts     # 默写报读节奏/时长计算、设置归一化
│   │   ├── service-config.ts   # 第三方服务清单（env 探测，新增服务只加一条）
│   │   └── server/             # auth.ts 会话认证、user.ts settings 合并、date.ts 时区等
│   └── db.ts                   # Prisma Client 单例
├── prisma/
│   ├── schema.prisma           # 数据模型（见下）
│   ├── seed.ts                 # 种子入口：基础词库 + 拼读规则（强校验：对齐拼接 === 单词）
│   ├── seed-words.ts / seed-rules.ts
│   └── seed-yilin.ts           # 译林版教材词库（685 词，幂等入库）
├── scripts/
│   ├── gen-yilin-align.ts      # LLM 批量音素对齐流水线（可复现）
│   ├── align-remaining.ts      # 本地确定性对齐（IPA 表 + DP 字母切分）
│   └── validate-seed.ts        # 种子数据校验
├── db/custom.db                # SQLite 数据库文件（部署时需持久化）
├── Caddyfile                   # 网关反代（默认转发 :3000，XTransformPort 查询参数可转发其他端口）
└── dev.log                     # dev 运行日志（bun run dev 自动 tee）
```

### 数据模型概览（Prisma / SQLite）

- **用户域**：`User`（settings JSON 扩展设置）、`Session`（token 会话）、`ZhDoc`（语文默写草稿/历史词单）、`DictationState`（听写选择状态）
- **词库域**：`Word`（音标/音素/graphemes 对齐/音节/释义/难度）、`Rule`（L0–L8 拼读规则）、`WordRule`（词-规则关联）、`Book`/`Unit`/`UnitWord`（教材同步）
- **学习域**：`LearningEvent`（学习事件）、`ErrorLog`（错词归因）、`ReviewCard`（FSRS 状态）、`DailyStat`（每日统计）

所有用户数据均通过 `userId` 外键级联删除，实现账号级数据隔离。

### 关键设计

- **认证双通道**：会话 token 同时支持 httpOnly Cookie（同源直连）与 `Authorization: Bearer` / `X-Session-Token` 请求头（iframe 预览面板会拦截第三方 Cookie，请求头通道保证登录态可用）；前端将 token 持久化在 `localStorage`（键 `ps_session_token`）
- **settings 白名单合并**：`PUT /api/user` 的 settings 经服务端 `mergeSettings` 逐键校验合并，非法值丢弃，防止脏数据与越权改密码
- **语音降级链**：发音引擎可切换，默认浏览器本地发音（`SpeechSynthesis`）；选择服务端引擎时经 `/api/tts` 合成（内置 z-ai SDK，可配 Azure），失败自动降级回浏览器发音

---

## 💻 本地开发调试

### 环境要求

- [bun](https://bun.sh) ≥ 1.1（或 Node.js ≥ 20 + npm）
- 无需外部数据库/缓存，SQLite 单文件即可运行

### 快速开始

```bash
# 1. 安装依赖
bun install

# 2. 配置数据库连接（.env）
echo 'DATABASE_URL=file:./db/custom.db' > .env

# 3. 建表（Prisma 同步 schema）
bun run db:push

# 4. 初始化种子数据（词库 + 拼读规则 + 教材）
bun prisma/seed.ts          # 基础词库 + L0-L8 规则（内置强校验）
bun prisma/seed-yilin.ts    # 译林版教材词库（幂等，可重复执行）

# 5. 启动开发服务器（端口 3000，日志实时写入 dev.log）
bun run dev
```

打开 http://localhost:3000 ，注册一个账号即可开始使用。

### 常用命令

| 命令 | 说明 |
|---|---|
| `bun run dev` | 启动开发服务器（`-p 3000`，日志 tee 到 `dev.log`） |
| `bun run lint` | ESLint 检查（含 react-hooks / Next 规则） |
| `bun run db:push` | schema 变更同步到 SQLite |
| `bun run db:generate` | 重新生成 Prisma Client |
| `bun scripts/validate-seed.ts` | 校验库内种子数据完整性（对齐拼接、音素合法性） |
| `bun scripts/test-diagnose.ts` | 错因诊断逻辑自测 |

### 调试建议

- **看日志**：`tail -f dev.log`（包含每个 API 的状态码与 Prisma 查询）
- **看数据**：临时脚本放项目根目录执行（如 `bun tmp.ts` 内 `new PrismaClient()`），SQLite 也可用任意 SQLite 客户端直接打开 `db/custom.db`
- **时区**：统计/默写广场按 `Asia/Shanghai`（UTC+8）计算"今日"，见 `src/lib/server/date.ts`

---

## 🔌 第三方服务配置（全部为预留项，可零配置运行）

服务端唯一事实来源是 `src/lib/service-config.ts` 的 `SERVICES` 清单：环境变量全部非空才算配置成功，`设置 → 服务配置` 面板实时展示状态（`/api/config`）。未配置的服务自动降级到内置能力（z-ai SDK / 浏览器语音），不影响核心功能。

| 服务 | 环境变量 | 启用后的能力 |
|---|---|---|
| Azure Neural TTS | `AZURE_TTS_KEY` / `AZURE_TTS_REGION` | 服务端发音切换 Azure 神经语音（Jenny / Sonia） |
| Azure 发音评测 | `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | 跟读发音打分（预留） |
| 讯飞语音评测 | `IFLYTEK_APP_ID` / `IFLYTEK_API_KEY` / `IFLYTEK_API_SECRET` | 国内跟读评分备选（预留） |
| 百度手写 OCR | `BAIDU_OCR_API_KEY` / `BAIDU_OCR_SECRET_KEY` | 纸面听写拍照自动批改（预留） |
| 音频存储 OSS | `OSS_ENDPOINT` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET` | 跟读音频云端存储（预留） |
| 内置 AI 能力 | 无需配置 | z-ai SDK TTS / LLM，开箱即用 |

新增服务：在 `SERVICES` 数组加一条 + `.env` 补变量即可，前端面板自动渲染。

---

## 🚀 服务器部署

### 1. 构建

```bash
bun install
bun run db:push        # 确认表结构
bun prisma/seed.ts && bun prisma/seed-yilin.ts   # 首次部署初始化数据
bun run build          # Next.js standalone 产物 + 静态资源拷贝
```

### 2. 启动

```bash
# 生产环境运行（standalone 模式，默认端口 3000）
NODE_ENV=production bun .next/standalone/server.js
# 或使用 npm 脚本：
bun run start
```

> 建议用 `systemd` / `pm2` / `docker` 守护。systemd 示例：
>
> ```ini
> [Unit]
> Description=PhonicsStar
> After=network.target
>
> [Service]
> WorkingDirectory=/opt/my-project
> Environment=NODE_ENV=production
> Environment=DATABASE_URL=file:/opt/my-project/db/custom.db
> ExecStart=/usr/local/bin/bun .next/standalone/server.js
> Restart=always
>
> [Install]
> WantedBy=multi-user.target
> ```

### 3. 反向代理

任选其一：

- **Caddy**（项目根目录已带 `Caddyfile`，默认 81 端口转发 :3000）：

  ```caddy
  your-domain.com {
      reverse_proxy localhost:3000
  }
  ```

- **Nginx**：

  ```nginx
  server {
      listen 80;
      server_name your-domain.com;
      location / {
          proxy_pass http://127.0.0.1:3000;
          proxy_set_header Host $host;
          proxy_set_header X-Forwarded-For $remote_addr;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  ```

### 4. 数据持久化与备份

- 唯一有状态数据是 SQLite 文件：`db/custom.db`（路径由 `DATABASE_URL` 决定，**务必指向持久化磁盘**，容器部署请挂载 volume）
- 定时备份示例：`sqlite3 db/custom.db ".backup '/backup/phonics-$(date +%F).db'"`
- 升级流程：拉代码 → `bun install` → 有 schema 变更则 `bun run db:push` → `bun run build` → 重启进程（SQLite 无需停库迁移窗口，但建议低峰操作并先备份）

### 5. 安全清单

- 生产环境务必走 HTTPS（Caddy 自动证书 / Nginx + certbot）
- 会话 Cookie 为 httpOnly + SameSite=Lax；若嵌入受限环境（如 iframe 预览），系统自动走 Bearer 头通道
- 不要把 `.env` 提交进仓库；第三方密钥仅存服务端环境变量，前端永不下发

---

## 📄 其他

- 开发迭代记录见 [`worklog.md`](./worklog.md)（按 Task ID 追加，含每次改动的根因分析与验证结论）
- 默写广场等"今日"概念统一按 `Asia/Shanghai` 时区
