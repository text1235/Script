# 什么值得买多账号补签

自动补回漏签日期，支持多个账号，每次随机等待 5–15 秒。

## 自动补签与旧日期开关

最近七天是可切换的脚本设置，不是平台补签期限。现在由用户决定是否向前补旧日期，脚本不按收益门槛替用户决定。

先拉取全部相关脚本：

```bash
ql repo https://github.com/text1235/Script.git "smzdm_makeup.*" "" "" "main"
```

设置 `SMZDM_COOKIE`，添加 `SMZDM_MAKEUP_ROOT=/ql/data/smzdm_makeup_auto` 作为持久目录。
在青龙任务页创建以下任务；四个查询/设置任务使用 `@once`，禁止多实例，点击该行「运行」作为按钮。

| 按钮/任务 | 脚本文件 | 作用 |
| --- | --- | --- |
| 查询补签与连签状态 | `smzdm_makeup_detect.js` | 查看当前连签、下一张卡补后天数、可补日期和剩余卡；不用卡 |
| 开启旧日期补签 | `smzdm_makeup_forward.js` | 保存开启设置；最近漏签优先，没有近期漏签则按顺序向前补 |
| 补到指定日期 | `smzdm_makeup_target.js` | 先设 `SMZDM_MAKEUP_TARGET_DATE=YYYY-MM-DD`，再点按钮；包含目标日期 |
| 关闭旧日期，只补最近七天 | `smzdm_makeup_recent.js` | 保存关闭设置；停止继续补七天以前日期 |
| 每周自动补签 | `smzdm_makeup_control.js` | 按保存的模式实际补签；建议周日 09:00：`0 9 * * 0` |

命令要加 `task` 和实际目录，例如 `task text1235_Script_main/smzdm_makeup/smzdm_makeup_forward.js`。**设置按钮只改模式，不立即补签**；实际用卡由自动任务执行。默认关闭旧日期补签。每批结束的 Bark 通知逐账号列出「本批补前 → 已核验补后天数、增加几天、用了几张卡」，用户据此决定下一次是否继续向前补。卡数不等于增加的连签天数，通知分别记录。结果不明时只报最后核验天数，保留 pending，不把预计天数写成已完成。

当前接口只能准确预览下一张卡，不能推算更早多张卡后的连签收益。脚本不通过用卡试探收益、不自动判断是否值得补。指定日期模式达到边界后停止；用户可以切回最近七天。服务端决定下一日期，脚本不能跳过中间日期。

默认所有账号每周各最多 7 张，总量为账号数 × 7，随机间隔 5–15 秒。切换开关、修改目标和再次运行都会累计同周的已尝试额度，未确认请求也计数。保留旧状态、预算和锁；遇到不明结果或异常锁先停下。关闭按钮需要等正在执行的批次结束，避免中途抢写状态。**不要同时运行下方独立批次绕过自动模式预算。**

完整参数和迁移说明见 [详细说明](ADVANCED.md)。

## 独立手动队列：5 步

### 1. 拉取脚本

在青龙订阅中运行：

```bash
ql repo https://github.com/text1235/Script.git "smzdm_makeup.js" "" "" "main"
```

### 2. 安装依赖

在「依赖管理 → NodeJS」安装 `got@11`。Node.js 需 20 或以上。

### 3. 填入 Cookie

在「环境变量」添加 `SMZDM_COOKIE`，填入自己的 App Cookie。
多个账号用 `&` 分隔：

```text
账号1完整Cookie&账号2完整Cookie
```

Cookie 需包含 `sess` 和 `smzdm_id`，不要上传到 GitHub。

### 4. 设置补签数量

添加以下环境变量。这组示例表示：**所有账号合计最多补 20 次**。

| 名称 | 值 |
| --- | --- |
| `SMZDM_BACKFILL_APPLY` | `1` |
| `SMZDM_BACKFILL_ACCOUNTS` | `all` |
| `SMZDM_BACKFILL_MAX_CARDS` | `20` |
| `SMZDM_BACKFILL_BATCH` | `makeup-01` |
| `SMZDM_BACKFILL_LOOP` | `1` |
| `SMZDM_BACKFILL_STATE_DIR` | `/ql/data/smzdm_makeup_state` |

把 `20` 改成你允许使用的补签卡总数；只补指定账号时，把 `all` 改成 `1,2`。
想先查询、不用卡，就把 `SMZDM_BACKFILL_APPLY` 改成 `0`。

### 5. 点运行

在「定时任务」新建任务，命令填写脚本的实际路径，例如：

```bash
task text1235_Script_main/smzdm_makeup/smzdm_makeup.js
```

定时规则填 `@once`（仅运行一次），禁止多实例，然后点「运行」。
它会轮流处理账号，用完上限或遇到异常就停止。**不要每分钟重复启动，也不要反复点运行。**

需要 Bark 通知时，再添加 `BARK_PUSH`，值填自己的 Bark 推送地址。

## 遇到问题

暂停后不要删状态或改批次重新跑，以免重复扣卡。
独立账号上限、恢复方法和普通 Node.js 用法见 [详细说明](ADVANCED.md)。

协议适配参考 [hex-ci/smzdm_script](https://github.com/hex-ci/smzdm_script)，许可证见 [LICENSE](LICENSE)。
