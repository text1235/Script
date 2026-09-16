# Script

个人使用的图标资源仓库，用于集中保存脚本、代理工具和订阅配置中使用的 PNG 图标。

## 仓库内容

```text
.
├─ icon/                              # PNG 图标
├─ .github/
│  ├─ scripts/
│  │  └─ generate_image_json.py       # 生成图标订阅 JSON
│  └─ workflows/
│     └─ blank.yml                    # GitHub Actions 自动化工作流
└─ README.md
```

## 图标使用方法

单个图标可以通过 GitHub Raw 地址引用：

```text
https://raw.githubusercontent.com/text1235/Script/main/icon/文件名.png
```

例如：

```text
https://raw.githubusercontent.com/text1235/Script/main/icon/WeChat.png
```

如果所在网络无法稳定访问 GitHub Raw，可以自行配置代理或镜像地址。

## 图标订阅生成

仓库内的 `.github/scripts/generate_image_json.py` 会扫描 `icon/` 目录中的所有 `.png` 文件，并生成适合订阅使用的 JSON 数据。生成的数据结构如下：

```json
{
  "name": "半夏图标订阅",
  "description": "收集一些自己脚本用到的图标",
  "icons": [
    {
      "name": "WeChat.png",
      "url": "https://raw.githubusercontent.com/text1235/Script/main/icon/WeChat.png"
    }
  ]
}
```

GitHub Actions 工作流会在 `icon/` 目录发生变化或手动触发时运行生成脚本。

## 添加图标

1. 将 PNG 图片放入 `icon/` 目录。
2. 使用清晰、容易识别的文件名，建议避免空格和特殊字符。
3. 提交并推送到 `main` 分支。
4. 检查 GitHub Actions 的运行结果。

## 本地生成

需要 Python 3：

```bash
python .github/scripts/generate_image_json.py
```

该脚本依赖 GitHub Actions 提供的环境变量。在普通本地环境运行前，需要按实际用途设置相关变量，或调整输出状态文件的处理方式。

## 说明

本仓库主要用于个人学习和资源整理。图标的商标、名称及相关权利归各自权利人所有，请仅在合法合规的范围内使用。
