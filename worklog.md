# 项目工作日志 — 自然拼读 AI 听写陪练 App（拼读星球 PhonicsStar）

> 本文件是所有 Agent 的共享工作日志。每个 Agent 完成任务后必须追加（不得覆盖）。
> 格式：`---` 分隔 + Task ID / Agent / Task / Work Log / Stage Summary
> ⚠️ 2026-09-29 环境事件：沙箱在 Task 13 完成后被重置到 Task 3 时期快照，Task 7~13 磁盘文件全部丢失；
> Task 14 由主控依据对话上下文中的完整源码高保真重建（见 Task 14 Work Log）。

---
Task ID: 0
Agent: 主控 (Z.ai Code)
Task: 项目初始化、架构规划、任务拆分

Work Log:
- 分析用户需求：按《自然拼读 AI 听写陪练 App 产品规划》实现 MVP（P0+部分P1）
- 确定技术栈：Next.js 16 App Router + TypeScript + Tailwind 4 + shadcn/ui + Prisma(SQLite) + z-ai-web-dev-sdk（内置 LLM/TTS）
- 设计 Prisma 数据模型：Word(含 phonemes/graphemes JSON 对齐字段)/Rule/WordRule/Book/Unit/UnitWord/User/LearningEvent/ErrorLog/ReviewCard(FSRS)/DailyStat
- 定义 REST API 契约（dictation/check 错因诊断、review FSRS、tts 代理、config 服务状态等）
- 规划第三方服务配置槽位：Azure TTS/ASR、讯飞评测、百度 OCR、OSS（.env.example + /api/config 状态上报）
- 任务拆分：Task1 种子数据工程 ∥ Task 2-b 前端 UI → Task 2-a 后端 API → Task 3 集成验证

Stage Summary:
- 数据库 SQLite（db/custom.db），关键设计：Word.graphemes=[{g:"sh",p:"ʃ"}] 音素↔字母对齐是全产品地基
- 错因类型枚举：PHONEME(音辨)/SEGMENT(切分)/PATTERN(拼式)/IRREGULAR(不规则)/SUFFIX(后缀双写)/MEMORY(遗忘)/HANDWRITING(书写)
- FSRS-4.5 简化实现；TTS 引擎优先级：Azure(若配置) > z-ai-sdk > 浏览器 Web Speech
- 单页面应用（仅 / 路由），7 个视图：home/learn/dictation/review/errors/report/settings

---
Task ID: 2-b
Agent: 前端工程师
Task: 前端 UI 七大视图

Work Log:
- 主题改造 globals.css：暖色 oklch（primary=orange-500 系）、.nice-scrollbar 工具类；layout lang=zh-CN、Toaster top-center、body min-h-screen flex flex-col
- api-client.ts：30+ 契约接口、CATEGORY/ERROR_TYPE 中文映射、request() 封装（10s 超时、统一 ApiError）、15 个 API 方法、DEFAULT_USER 兜底、pct()/shortDate()
- store.ts：zustand（currentView/user/updateUser 本地乐观合并+静默 PUT）
- use-speech.ts：browser/server 双引擎、speak/speakTimes/stop/speaking、SSR 守卫
- 组件：PhonemeBlocks/LetterFeedback/CheckFeedback/AppHeader/AppFooter/MobileNav/shared/七视图（Home/Learn/Dictation/Review/ErrorBook/Report/Settings）
- page.tsx：'use client'，挂载拉用户、AnimatePresence 视图切换
- 修复：lucide-react 0.525 无 NotebookX→BookX；ReportView 漏 import motion；ServiceConfigCard promise 回调式 setState

Stage Summary:
- 17 个文件全部产出；降级策略全线就位（API 挂→ErrorState/默认用户、server TTS 挂→浏览器回落）
- bun run lint 全绿；SSR 无 Date/random 分歧；未创建新 route、未触碰 prisma/**

---
Task ID: 1
Agent: 主控亲自执行
Task: 拼读种子数据工程（44音素/L0-L8规则/词库对齐/教材单元）

Work Log:
- prisma/seed-rules.ts：56 条规则（L0字母认知~L8构词法），含讲解+口诀+示例词
- prisma/seed-words.ts：274 词逐词音素-字母对齐 + 强校验
- prisma/seed.ts：幂等种子脚本；scripts/validate-seed.ts 独立校验器
- 修复 19 个对齐错误（six/box 的 x→ks、cheese 漏静音e、queen 的 qu 拆分等）
- 写入：274 词 / 56 规则 / 2 册教材 12 单元 88 个单元词 / 演示用户

Stage Summary:
- 难度分布 D1=28 D2=57 D3=116 D4=52 D5=21，Tricky 词 19 个
- 最小对立体词对入库：ship/sheep、short/shirt、walk/work 等
- 校验脚本可随时复跑：bun scripts/validate-seed.ts

---
Task ID: 2-a
Agent: 后端工程师（代理超时，主控接手补完）
Task: 后端 API 全套（听写批改+错因诊断/FSRS复习调度/TTS代理/三方服务配置）

Work Log:
- src/lib/phonics/diagnose.ts（错因诊断）/g2p.ts/fsrs.ts（FSRS-4.5 简化17参数）/service-config.ts/server/{dto,user,lexicon,date,labels,levels}.ts
- 路由：user/words/books/curriculum(+[level])/dictation/{check,words}/review/{today,rate}/errorbook/{,resolve}/stats/config/tts
- FSRS 语义修复：rating=1 → 5 分钟内重现重学
- curl 全量自测 13 接口 200；错因诊断 5 用例精准；TTS 实测 54KB wav + LRU 缓存 300 条
- 清理测试学习数据，重跑种子

Stage Summary:
- 13 个 API 与前端契约对齐；错因 5 类全识别；第三方配置槽位 .env.example + /api/config 实时上报
- check 事务内联动 LearningEvent/ErrorLog/ReviewCard/DailyStat

---
Task ID: 3
Agent: 主控 (Z.ai Code)
Task: 集成验证（Agent Browser 端到端 + 修复）

Work Log:
- 首页/报听写全流程/错词本/FSRS 复习/学拼读/报告/设置/移动端 390×844 全部浏览器实测通过
- 修复 LearnView/DictationView 共 4 处 IPA 显示缺尾部斜杠
- curl 复核 13 API 全 200，console 零错误，lint 全绿

Stage Summary:
- 端到端核心流程全部通过；headless 无法验证真实声音，浏览器 TTS 与服务端 /api/tts 均已实现
- Azure/讯飞/百度OCR/OSS 为预留配置槽位

---
Task ID: 7（环境重置后依据上下文归档重建）
Agent: Z.ai Code (main)
Task: 修复报听写-自由选词 scroll-area-viewport 滚动区无高度

Work Log:
- 根因：Radix ScrollArea Root 高度 auto，Viewport size-full 解析为 auto → 2249px 列表溢出撑破页面
- DictationView.tsx 自由选词词表改原生 div（nice-scrollbar max-h-64 overflow-y-auto），移除 ScrollArea import
- Agent Browser 量测：maxHeight 256 / scrollHeight 2249 / 可滚动、勾选正常

Stage Summary:
- 自由选词限高 16rem 容器内滚动；⚠️ 此修复随沙箱重置丢失，DictationView 回到 Task 2-b 版本，待回归

---
Task ID: 8（环境重置后依据上下文归档重建）
Agent: Z.ai Code (main)
Task: 苏教译林版数据找回 + 4上 2025 新版 + 用户注册登录（数据隔离）+ 全量数据持久化

Work Log:
- 数据：dzkbw.com 核实 2025 秋译林 4上 8 单元 85 词 + 旧版 4B~6B 40 单元；yilin-src.json 481 词 + gen-yilin-align.ts LLM 对齐流水线；seed 幂等 upsert；总量 657 词 / 8 册 48 单元
- 认证：User.username/passwordHash、Session、DictationState、ZhDoc 四表；server/auth.ts（scrypt + 48 字节 token + httpOnly cookie 30 天滑动）；/api/auth/{register,login,logout,me}；业务 API 全量 requireUser + 401
- 前端：AuthView（登录/注册）、page 三态门、AppHeader 用户菜单、SettingsView 账号卡、api-client auth/state/zh 三组 API
- 持久化：/api/dictation/state（听写选择）、/api/zh-dictation（草稿/最近词单）、报读设置存 User.settings.zhDictation
- 双账号端到端验证通过、测试账号清理

Stage Summary:
- 账号体系上线，数据全隔离；⚠️ 译林教材数据/词库对齐产物随沙箱重置丢失（报听写教材回到人教PEP两册），需重新生成

---
Task ID: 9（环境重置后依据上下文归档重建）
Agent: Z.ai Code (main)
Task: AppHeader 导航「语文默写」改用 shortLabel「默写」

Work Log:
- AppHeader.tsx 文案 {item.label} → {item.shortLabel ?? item.label}，aria-label 保持完整 label

Stage Summary:
- 导航短文案配置化（nav.ts 一处维护）；⚠️ 随重置丢失，已在 Task 14 重建

---
Task ID: 10（环境重置后依据上下文归档重建）
Agent: Z.ai Code (main)
Task: 语文默写增加「默写广场」（今日全体学员词单，可直接开默）

Work Log:
- GET /api/zh-dictation/plaza：今日（Asia/Shanghai）history 词单、仅昵称/年级公开字段、跨用户可见
- 前端：广场卡片（Compass+刷新按钮+昵称徽章「我」/年级/时间/预览/直接默写）
- 踩坑：react-hooks/set-state-in-effect → 模块级 requestPlaza() + promise 回调 setState + cancelled flag

Stage Summary:
- "你发词单我来写"闭环上线；草稿不入广场；隐私边界明确

---
Task ID: 11（环境重置后依据上下文归档重建）
Agent: Z.ai Code (main)
Task: 默写广场卡片移到「录入词语或句子」上方

Work Log:
- JSX 块整体搬移，卡片顺序：标题 → 默写广场 → 录入 → 报读设置 → 最近词单 → 操作 → 提示

Stage Summary:
- 广场成为默写页首屏入口；⚠️ Task 10~13 全部随重置丢失，已在 Task 14 重建

---
Task ID: 12（环境重置后依据上下文归档重建）
Agent: Z.ai Code (main)
Task: 默写广场规则：内容相同跨用户只显示一条；广场最多 3 条；每条预览最多 3 条加「等」

Work Log:
- plaza 去重签名改纯内容（去 userId 维度，保最新发布者）；MAX_PLAZA 50→3
- 预览 slice(0,3) + 超出加「等」后缀

Stage Summary:
- 广场按内容展示、首屏信息密度可控；⚠️ 已在 Task 14 重建

---
Task ID: 13（环境重置后依据上下文归档重建）
Agent: Z.ai Code (main)
Task: 报读设置增加「每条读几遍」与「书写倒计时时间」

Work Log:
- zh-dictation.ts：readsPerItem(1~5 默认3) + writeTime("auto"或10~120固定秒)；clamp/normalize 工具；computeGapMs 固定秒直通；estimateSessionMs 按 N 遍
- use-zh-dictation.ts：删除硬编码 READS_PER_ITEM=3，主循环按设置读 N 遍
- server mergeSettings 放行新字段；ZhDictationView 四项设置（语速/遍数/倒计时/节奏）+ 遍数圆点动态化 + 文案去硬编码
- 验证：读2遍+固定10秒全场 1分35秒与理论吻合

Stage Summary:
- 四项报读设置实时联动、随账号持久化；⚠️ 已在 Task 14 重建

---
Task ID: 14
Agent: Z.ai Code (main)
Task: ①默写中「家长查看本词」防孩子偷看方案 ②排查语文默写录入内容跨浏览器不显示问题；同时重建因沙箱重置丢失的 Task 7~13 全部代码

Work Log:
- 环境事件处置：发现沙箱重置（磁盘回到 Task 3 快照，git 无后续提交、.next 为重置后新编译、db 回到 274 词时代）；依据对话上下文中的完整源码重建：zh-dictation.ts（Task13+新增 revealPin）、use-zh-dictation.ts、ZhDictationView.tsx（Task12/13+新功能）、server/user.ts、schema 四表、/api/auth/*、/api/user、7 业务路由 session 化、/api/zh-dictation{,/draft,/plaza}、TTS zh-CN、api-client auth/zh 函数、store authStatus/logout、AuthView、page 三态、nav/AppHeader/MobileNav shortLabel+用户菜单、SettingsView 账号卡；dev server 重启（Prisma Client 缓存）
- ①防偷看方案（多层门禁）：
  · 「家长查看本词」点击不再直接显示，弹出家长验证框：未设密码→引导设置 4~6 位数字密码（存 User.settings.zhDictation.revealPin，服务端 mergeSettings 校验），已设→验证
  · 显示范围锁定到「当前条」：revealedIdx===ss.index 才显示，换到下一条自然失效自动重新上锁（不再出现旧版"显示后跨词常驻"漏洞）
  · 报读设置新增「查看本词密码」管理行：已设置/未设置徽章 + 修改 + 清除
  · 首次保存密码后直接显示当前词（bug 修复：初版 setup 分支漏了 setRevealedIdx）
  · 错误密码提示"密码不对，请再试试"，弹窗不关闭
- ②跨浏览器不显示排查结论：代码链路正常——录入内容防抖 800ms 存 /api/zh-dictation PUT（ZhDoc kind=draft，随账号隔离），挂载时 GET 恢复；实测注册→录入→落库→刷新恢复→退出→全新浏览器会话登录同账号全部恢复成功。"没显示"最可能是另一浏览器未登录同一账号；针对性增强：
  · 录入卡头部新增保存状态指示（保存中…/已自动保存 HH:mm/失败重试提示），让家长看得见"存上了"
  · 新增 pagehide + navigator.sendBeacon("/api/zh-dictation/draft") 补传，输入后 800ms 内关闭页面也不丢
  · 录入区说明文案明确"内容随账号保存在数据库，换个浏览器登录同一账号也在"
- 验证：lint 全绿、tsc src 零错误；Agent Browser 端到端：注册 restore1→录入"春眠不觉晓/处处闻啼鸟"→DB 确认 draft 落库→开默→首次查看引导设密码 1234→错误密码 9999 被拒→1234 显示当前词→跳过换词自动上锁（答案隐藏+重新要求密码）→报读设置徽章"已设置"→最近词单/广场正常→登出→全新 --session b2 登录同账号：草稿/最近词单/广场全部恢复（截图 390×844 确认）；console 与 dev.log 零错误；测试账号已清理

Stage Summary:
- 防偷看三层防线：密码门禁（孩子不知道密码就看不到）+ 逐词自动上锁（解锁只对当前条有效）+ 设置页可管理（随时改/清除）；已知边界：密码明文存本账号设置（JSON 可见），对小学生威胁模型足够，后续可升级为服务端哈希校验
- 跨浏览器数据链路修复确认：草稿/最近词单/广场/报读设置全部随账号走；新增保存状态可见化 + sendBeacon 关页补传
- Task 7~13 磁盘成果全部重建完毕（除苏教译林教材词库数据与 DictationView 自由选词滚动修复/听写选择 DB 化两处，见遗留）

遗留：
- 苏教译林版 6 册 48 单元教材词库（657 词）需重新生成（数据源与对齐流水线已随重置丢失，流程可复现：web-search 核实目录→LLM 对齐→幂等种子）
- DictationView 自由选词 ScrollArea 撑破页面修复（Task 7）与"上次词单选择 DB 化"（Task 8 部分）待回归重建
- 历史演示用户（username=""）无密码不可登录，仅作数据兼容占位

---
Task ID: 15
Agent: Z.ai Code (main)
Task: ①找回苏教译林版教材数据+四上2025新版 ②今日任务/复习/错题本/报告数据拿不到 ③默写广场无今日数据 ④报听写提交失败 ⑤查看本词密码可被孩子随意修改

Work Log:
- 【根因诊断】dev.log 显示登录成功后全部业务 API 401（stats/review/errorbook/zh-dictation/plaza/dictation/check 等）——预览面板以跨站 iframe 运行，浏览器第三方 cookie 策略拦截 SameSite=Lax 会话 cookie，导致"登录成功但接口全 401"；这也是用户感知"换浏览器数据丢失"的真相（数据根本没存进库）
- 【15-a 双通道认证】auth.ts 新增 extractToken()（Authorization: Bearer → X-Session-Token → cookie 三级回退），getSession 走统一提取；login/register 响应体返回 sessionToken；logout 支持头通道删会话；api-client.ts localStorage 持久化 ps_session_token，request() 统一附加 Bearer 头，fetchMe 401 自清失效 token，logoutApi 清本地；flushZhDraftBeacon 由 sendBeacon 改 fetch keepalive+头（sendBeacon 无法带 Authorization）
- 【15-b 译林数据重建】子代理后台产出 yilin-src.json（6册48单元616词，dzkbw.com 核实单元结构）+ gen-yilin-align.ts（LLM 批量对齐流水线，断点续跑）；LLM 对齐至 253 词后进程反复被杀/输出质量下滑，主控接手：修补 prompt（错字 eadword]、高频错误警示 few-shot）、大写 g 自动小写化、加 driver 自动重启；仍不稳定后改走本地确定性方案 align-remaining.ts——手工 IPA 表 158 词 + G2P 映射表 DP 字母切分（静音段 x 标记，13 轮规则迭代修通全部 156 词）+ 音节启发式切分；seed-yilin.ts 幂等入库（修复：DB 已有无对齐产物的基础词直接复用建关联），最终 8 册 60 单元 685 词；四上为 2025 秋新版 8 单元 90 词（Our school subjects/My day/My week/I like sport/Different toys, same fun/Weather/Seasons/What we wear）
- 【15-c 密码管理重构】新路由 POST /api/zh-dictation/pin（verify/set/clear 唯一写通道）：已设密码时 set/clear 必须验证旧家长密码或账号登录密码（二选一，恒时比较）；userToDTO 剥离明文 revealPin 只下发 revealPinSet 布尔（前端永远拿不到密码明文）；mergeSettings 封死 PUT /api/user 通道的 revealPin 字段；默写中验证/首设也走服务端；前端新增 PinManageDialog（报读设置区设置/修改/清除，验证方式可切换"忘了家长密码？改用账号登录密码验证"），PinDialog 加 busy 防重复提交
- 【验证】curl：Bearer 通道 6 接口全 200、无凭据 401、pin API 8 项安全项（明文不泄露/无验证改密 403/错误旧密码 403/PUT 偷改被忽略/登录密码恢复通道/错误登录密码 403/正确清除/未设密码 verify 放行）；Agent Browser 端到端：注册→首页今日任务→报听写选教材单元→听写提交 200（PE/fun）→错词本 pen 拼式分组→复习 FSRS 空态→报告统计图表全加载→语文默写录入→查看本词首设 1234→跳词自动上锁→错误密码 9999 拒绝→1234 显示→PinManageDialog 前端拦截/服务端 403/登录密码通道重置 4321→DB 确认→验证 4321 清除→默写广场跨用户词单+我徽章→登出清 token→重登数据恢复→移动端 390 无横滚；译林 4 上 Unit1 听写 PE 提交 200；测试账号已清理（剩 jimmy+历史占位）

Stage Summary:
- 全部 6 个问题闭环：①译林 6 册 48 单元 + 四上 2025 新版 90 词入库（LLM+本地 DP 混合流水线，yilin-src/aligned.json 与三个脚本保留可复现）②③④统一根因是 iframe cookie 拦截，双通道认证（localStorage token + Bearer 头）根治，报听写提交/今日任务/广场/复习/错题本/报告全部恢复 ⑤查看本词密码三层防线：服务端强制验证（旧密码或登录密码二选一）+ 明文永不下发 + PUT 通道封死；忘记密码用账号登录密码恢复，孩子无登录密码即无法绕过
- ⚠️ 用户需注意：现有已登录的浏览器需退出重新登录一次（旧会话无 token，新登录后自动获得双通道凭据）
- 对齐流水线文件：prisma/yilin-src.json（词表）、prisma/yilin-aligned.json（411 词对齐产物）、prisma/seed-yilin.ts（幂等入库）、scripts/gen-yilin-align.ts（LLM 对齐）、scripts/align-remaining.ts（本地 DP 对齐）

---
Task ID: 16
Agent: Z.ai Code (main)
Task: 首页新增「语文默写」入口，与学拼读/报听写/错题本同级

Work Log:
- HomeView.tsx MODE_CARDS 数组加入 zhdictation 卡片（标题"语文默写"、描述"生字句子听默写，家长轻松陪练"、Languages 图标与导航栏一致、emerald 配色区分英语模块的暖色系）
- 网格布局由 sm:grid-cols-3 调整为 sm:grid-cols-2 lg:grid-cols-4（手机单列/平板 2x2/桌面 4 列），清理无用的 i===1 条件类与未使用的 map 索引
- store 的 View 类型与 page.tsx 渲染分支本就含 zhdictation，无需改动；底部导航/桌面导航已有该项
- 验证：bun run lint 全绿；Agent Browser 端到端——注册临时账号 test_home→首页快照确认 4 张入口卡齐全（进入学拼读/进入报听写/进入语文默写/进入错词本）→点击"进入语文默写"成功切换到语文默写视图（默写广场/录入/报读设置正常渲染，无 console 错误）；1280/640/375 三视口截图确认响应式布局与底部栏正常；dev.log 无错误；测试账号已删除

Stage Summary:
- 首页学习模式入口由 3 卡变 4 卡，语文默写与学拼读/报听写/错题本同级直达；复用既有 setView("zhdictation") 通道与导航图标，零后端改动

---
Task ID: 17
Agent: Z.ai Code (main)
Task: 视图路由改为 hash/history 路由，刷新页面不再回首页

Work Log:
- 项目约定仅暴露 / 单路由页面，故采用 hash 路由（#/learn 等）+ history API：store.ts 新增 viewFromHash()（hash→视图，非法值回 home）、hashForView()（home→"#/"，其余"#/xxx"）、syncViewFromLocation()（从 URL 恢复且不写历史）；setView 在原 set 基础上 history.pushState 写入浏览器历史（pushState 不触发 hashchange，无回环）；logout 时 replaceState 清除 hash 残留
- page.tsx 新增 mount effect：首次进入 syncViewFromLocation() 按 URL 恢复视图，并监听 hashchange+popstate（覆盖后退/前进/手动改 hash），卸载时移除监听
- 全部 setView 调用方（HomeView/MobileNav/AppHeader/ReviewView/DictationView）零改动自动获得路由能力
- 验证：lint 全绿；Agent Browser 端到端——注册 test_route→点击进入语文默写→URL 变 #/zhdictation→reload 后仍停留语文默写→浏览器 back 回首页/forward 再回语文默写→手动改 #/errors 切到错词本→非法 #/badview 安全回退首页→直接深链接打开 /#/report 直达学习报告→退出登录 hash 清回 /；dev.log 无错误；测试账号已删除

Stage Summary:
- 八大视图全部支持 URL 直达与刷新保持（#/home、#/learn、#/dictation、#/zhdictation、#/review、#/errors、#/report、#/settings），浏览器后退/前进可用；非法 hash 自动回首页不白屏；登录门/登出与路由联动无残留

---
Task ID: 18
Agent: Z.ai Code (main)
Task: ①修复报听写自由选词列表滚动区撑破页面 ②教材/单元选择持久化到数据库

Work Log:
- 【18-1 滚动区】自由选词单词列表原用 Radix ScrollArea + max-h-64——Radix 无确定高度时 Viewport 随内容撑开、滚动条永不出现导致页面撑破（Task 7 遗留问题重建）；改为原生 div（max-h-64 overflow-y-auto + 项目已有的 nice-scrollbar 细滚动条样式），内部正常滚动（client 254px / 内容 2249px / scrollable=true），页面高度恢复正常
- 【18-2 持久化根因】SetupStage 的 patchSettings 只调 store.setUser（纯本地状态），从未发 PUT /api/user——教材选择、连同 playCount/speed/hintLevel/autoNext 等听写设置其实一直都没落过库；修复：patchSettings 改为"本地即时 setUser + 累积补丁 600ms 防抖直接调 updateUserApi"（不走 store.updateUser 以避免响应回写覆盖本地较新选择的竞态；失败保留补丁下次重试）；组件卸载时立即 flush 未落库补丁
- 【数据链】UserSettings 新增 dictBookId/dictUnitId（api-client.ts）；server mergeSettings 白名单放行两字段（string/trim/≤64 字符，防脏数据）；SetupStage 的 bookId/unitId 不再是本地 state，直接从 user.settings 派生并在 books 加载后校验（教材下架/换设备时失效 id 自动回退未选）；切教材自动清空已存单元；selectBook/selectUnit 走 patchSettings 落库
- 【验证】lint 全绿；Agent Browser 端到端：注册 test_scroll→自由选词 50 词列表内部滚动正常、页面不撑破（截图）→选译林版4上+Unit 3→DB settings 出现 dictBookId/dictUnitId→刷新页面自动恢复教材+单元→直接点开始听写用恢复的 Unit 3 正常开局→登出重登后仍恢复→切 Unit 6 后 DB 同步更新，PUT /api/user 全 200；dev.log 无错误；测试账号已删除

Stage Summary:
- 自由选词滚动区撑破页面修复（原生溢出滚动替代 Radix ScrollArea，Task 7 遗留清零）；报听写全部设置（含教材/单元选择）随账号落库，刷新/换设备/重登均恢复；教材单元派生校验保证失效 id 不产生非法选择

---
Task ID: 19
Agent: Z.ai Code (main)
Task: 新增项目 README 文档（功能模块/本地开发/部署/架构）

Work Log:
- 梳理 package.json、prisma/schema.prisma、src 目录结构、service-config.ts、Caddyfile、auth.ts 等事实来源后撰写 README.md
- 内容：项目定位与核心设计（graphemes 音素对齐）、九大功能模块表、技术栈、目录架构树 + 数据模型三域概览、关键设计（认证双通道/settings 白名单合并/语音降级链——按 use-speech.ts 实际逻辑修正为默认 browser 引擎）、本地开发快速开始与常用命令、第三方服务预留配置表（6 项）、服务器部署（standalone 构建/systemd 守护/Caddy+Nginx 反代/SQLite 备份/安全清单）
- 纯文档改动，无代码变更；所有命令（dev/lint/db:push/build/start/seed）均与 package.json 实际脚本核对一致

Stage Summary:
- README.md 落地：新人可按文档完成 安装→建库→种子→启动 全流程；部署章节给出可直接套用的 systemd/Caddy/Nginx 配置与数据备份命令
