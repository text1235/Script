# 什么值得买多账号补签

自动补回漏签日期，支持多个账号，每次随机等待 5–15 秒。

## 青龙使用：5 步

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
