# 潮汐手记 · Tidal Diary

> 一本可以放在 GitHub Pages 上的加密私人日记。  
> 蓝白渐变、纸页翻动、手机阅读器般的体验。每一页的右下角，都有一枚小小的 **Δ**。

![format](https://img.shields.io/badge/format-AES--256--GCM-2f7fb5)
![host](https://img.shields.io/badge/host-GitHub%20Pages-1b587f)
![license](https://img.shields.io/badge/license-MIT-5da7d4)

> **第一次部署、不太熟悉 GitHub？**  
> 请直接看这份按点击顺序写的中文教程：[DEPLOY.md](./DEPLOY.md)。  
> 里面有创建仓库、上传文件、开启 Pages、生成 Token、运行配置向导和常见错误排查。  
> **已经部署过，只想更新到这一版？** 直接看 [DEPLOY.md 的“更新已有站点”一节](./DEPLOY.md)。

---

## 它是什么

潮汐手记是一个**纯静态**的日记网站：

- 网页本身放在 GitHub Pages，不需要服务器、不需要数据库。
- 用密码在浏览器里加密 / 解密，正文与 GitHub Token 都不会以明文上传。
- 文字与设置的密文保存在你自己的 GitHub 仓库里，换设备也能读；配图不写仓库，默认在本机，也可放 Cloudinary。
- 手机浏览器打开时，会进入类似小说阅读器的全屏分页模式：左右滑动翻页、点按左右两侧翻页、点按中间收起工具栏。
- 桌面端是一张单独的纸页，配键盘方向键阅读。
- 每页右下角都有 `Δ` 小标志，页脚有页码；书本封面、书脊、纸纹、蓝白潮汐光晕都由 CSS / SVG 完成。

### 主要功能

| 功能 | 说明 |
| --- | --- |
| 加密日记 | AES-256-GCM；密码经 PBKDF2-SHA256（310,000 次）派生 |
| GitHub 同步 | 通过 GitHub Contents API 读写 `data/diary.enc.json` |
| 密码解锁 | 密码只用于包裹随机主密钥；修改密码不重加密正文 |
| 每日书写 | 标题、日期、心情、天气、正文；草稿自动加密保存 |
| 加密配图 | 自动压缩、加密；默认存本机 IndexedDB，也可切换 Cloudinary；不写 GitHub 仓库 |
| 配图大图 | 阅读页点击照片查看大图；图片随真实分页排版 |
| 管理员后台 | 管理员密码二次确认；删除日记、查看每篇阅读次数、管理配图存储 |
| 小说式阅读 | 按像素测量真实分页；页码、进度、目录、字号、纸色 |
| 手机优先 | 全屏阅读、滑动手势、安全区适配、字号 15–24px |
| 三种纸色 | 晨光（蓝白）、暖纸、夜航 |
| 离线缓存 | 网络不可用时打开本机密文缓存；恢复后自动合并 |
| 多端合并 | 按条目更新时间合并，支持删除墓碑（tombstone） |
| 备份与迁移 | 加密备份、Markdown、明文 JSON；本机配图需单独保留，Cloudinary 配图限同一本日记换设备 |
| 自动上锁 | 5 / 15 / 30 / 60 分钟或永不 |
| PWA | 可添加到主屏幕，离线打开 |

> 注意：这是「客户端加密」，不是「服务端访问控制」。仓库可以是公开的，但别人看到的是密文。密码强度非常重要。

---

## 三分钟部署

### 1. 把文件放进仓库

把本项目全部文件放进一个 GitHub 仓库。可以放在仓库根目录，也可以放在 `docs/`（取决于你准备怎么发布 Pages）。

建议使用公开仓库。私有仓库也可以，但需要 GitHub Pages 支持，并且同步需要 Token。

### 2. 打开 GitHub Pages

在仓库的 **Settings → Pages** 中：

- **Source** 选择 `Deploy from a branch`
- **Branch** 选择 `main`（或你的分支）与 `/ (root)`，或者 `/docs`
- 保存，等待 Pages 生成站点

假设站点地址是：

```text
https://你的用户名.github.io/仓库名/
```

### 3. 打开配置向导

在站点根路径后加上 `setup.html`：

```text
https://你的用户名.github.io/仓库名/setup.html
```

按向导填写：

1. **日记名字**与**密码**（至少 10 位，建议 12 位以上）
2. **GitHub 用户名、仓库名、分支**
3. **Pages 发布目录**：
   - 从仓库根目录发布：留空
   - 从 `docs/` 发布：填 `docs`
4. **GitHub Token**
5. 勾选忘记密码的确认，点击“生成保险箱并写入仓库”

向导会自动写入两个文件：

```text
config.json                 （若从 docs 发布则是 docs/config.json）
data/diary.enc.json         （若从 docs 发布则是 docs/data/diary.enc.json）
```

写完以后等待 GitHub Pages 重新部署（通常 1–2 分钟），回到首页输入密码即可。

> 如果向导提示“仓库里已经有一份潮汐手记”，说明仓库里已有配置或数据。为了保护旧日记，它不会自动覆盖；请先备份，或者只更新 Token（见下文）。

---

## 创建 GitHub Token

推荐使用 **Fine-grained personal access token**，不要使用权限过大的 classic token。

1. GitHub → 右上角头像 → **Settings**
2. **Developer settings → Personal access tokens → Fine-grained tokens**
3. **Generate new token**
4. **Repository access**：选择 **Only select repositories**，只勾选这个日记仓库
5. **Permissions → Repository permissions**：
   - **Contents: Read and write**（必需）
   - Metadata 会自动获得只读权限
6. 设置过期时间（建议 90 天或 1 年）
7. 生成后复制 Token（只显示一次）

把 Token 填入配置向导。它会被主密钥加密后写入 `config.json`，明文不会出现在仓库里。

### Token 过期了怎么办？

回到日记首页，输入密码解锁，打开 **设置 → 同步 → 同步凭据过期了？更新 Token**：

- 输入新的 Token；
- 应用会验证 Token 与仓库权限；
- 用当前主密钥重新加密 Token，更新 `config.json`；
- **不会重新加密日记正文，也不会重新生成主密钥。**

如果 Token 已经无法写入仓库，这个功能仍然可用：只要新 Token 有 Contents 写权限，就能把新配置写回去。

---

## 密码与安全模型

```text
密码
  └─ PBKDF2-SHA256 (310,000 iterations, 随机 salt)
       └─ 包裹一把随机主密钥
            ├─ 加密日记正文（AES-256-GCM，随机 IV）
            └─ 加密 GitHub Token
```

- 密码本身不会上传，也不会被保存成明文。
- `config.json` 里只有：KDF 参数、salt、被密码包裹的主密钥、被主密钥加密的 Token、仓库路径。
- 日记正文由主密钥加密后写入 `data/diary.enc.json`。即使仓库公开，别人看到的也是 base64 密文。
- 配图会在浏览器里压缩，然后用同一把主密钥单独加密。默认写入当前浏览器的 IndexedDB；也可以在管理员后台切换为 Cloudinary。两种方式都不会把新图片写进 GitHub 仓库。
- 阅读次数按设备记录，先写入加密的本机缓存；下一次保存日记或点击管理员后台的“同步阅读统计”时才会写进云端。
- 修改密码只会重新包裹主密钥，正文不需要重新加密。
- 自动上锁 / 手动上锁会清空页面内存中的主密钥、Token、正文和阅读页。

### 必须知道的限制

- **忘记密码 = 永远无法恢复日记。** 没有任何后门，也没有客服。
- 密码如果太弱，攻击者可以下载 `config.json` 后进行离线暴力尝试。请使用 12 位以上、混合大小写 / 数字 / 符号的密码。
- GitHub 仓库是公开的，提交时间、提交次数、文件大小等元数据是可见的。项目已经使用中性的提交信息，不把日记标题写进 commit message，但 GitHub 元数据本身无法隐藏。
- 项目自带 `robots.txt` 与 `noindex` 标记，尽量降低被搜索引擎收录的概率；但这不能阻止知道网址的人打开页面。好在没有密码时，他们只能看到锁屏或密文。
- 修改密码不会更换主密钥；如果密码曾经泄露，最彻底的做法是导出明文 / 加密备份后建立一本新日记。
- 这是浏览器端加密，网站自身的 JavaScript 必须可信。请不要在页面中注入第三方脚本，也不要把本项目部署到你不信任的域名。
- GitHub Pages 的 CDN 可能有缓存。刚改完配置或密码时，其他设备可能需要等 1–2 分钟。

---

## 日常使用

### 手机

- 打开站点，输入密码。
- 点击任一篇日记 → 全屏阅读。
- **左滑 / 右滑**翻页。
- 点屏幕**左侧 28%** 上一页，**右侧 28%** 下一页，**中间**收起 / 显示工具栏。
- 点右上角 `T` 调整字号与纸色；书本图标打开目录；`⋯` 可编辑、复制链接、立即上锁。
- 从书架点右下角“写一页”进入编辑。

### 桌面

- 方向键 `←` / `→`、`PageUp` / `PageDown`、`Space` 翻页。
- 鼠标滚轮横向滑动（触控板）也可以翻页。
- 阅读时点纸页中间可隐藏工具栏；按 `Esc` 返回书架。

### 写作

- 正文是纯文本，支持三种轻量排版：
  - `# 小标题`
  - `> 引用`
  - `---` 或 `***` 分隔线
- 心情、天气可留空。
- 自动保存加密草稿；`Ctrl / ⌘ + S` 立即保存。
- 日期可以回填过去的日子（受浏览器日期控件限制，最大为今天）。
- 保存后直接在阅读器中打开；网络不可用时会先加密保存在本机并提示“等待同步”。

### 配图（不写入 GitHub 仓库）

- 在编辑器里点 **添加配图**，选择本地图片。
- 图片会先在浏览器里缩放、压缩，然后单独用主密钥加密。
- **默认存本机**：写入当前浏览器的 IndexedDB（`tidal-diary-images`），不占 GitHub 仓库；换设备或清理浏览器数据后看不到。
- **可选 Cloudinary**：在管理员后台切换并填入 Cloud name、Unsigned upload preset。图片作为 raw 文件上传，跨设备可用，也不占 GitHub 仓库。
- 正文里会自动插入 `【图1】` 这样的位置标记；阅读时标记会变成照片。点击照片可以查看大图。
- 支持 JPG、PNG、WebP、GIF；单张压缩后目标不超过约 800KB，单篇最多 24 张。
- 如果 iPhone 的 HEIC 原图无法读取，先在相册里转换为 JPEG 再添加。
- 图片文件使用随机 ID 命名；本机库和 Cloudinary 里都只有密文，看不到原文件名或图片内容。
- **本机配图不会包含在加密备份和 Markdown 导出里**。请在原设备保留，或切换到 Cloudinary 后在那边备份。
- 完全离线冷启动时只保证文字可读；本机配图可以离线读取，Cloudinary 配图需要联网。
- 旧版本曾经写入仓库 `data/images/` 的配图仍能正常读取；新图片不会再增加仓库体积。

### 管理员后台

- 入口：**设置 → 管理员 → 管理员后台**。
- 管理员密码按主人的设定写入页面校验；输入框提示为“我的手机密码”。
- 管理员会话 5 分钟无操作会自动退出；离开后台、上锁也会退出。
- 可以：
  - 删除任意日记（会同时写入删除墓碑，防止其他设备同步回来）；
  - 查看每篇日记的 **总计阅读次数 / 本机阅读次数**；
  - 切换配图存储方式、查看本机配图占用、清理未引用配图；
  - 手动“同步阅读统计”。
- 阅读次数按设备统计，先写本机加密缓存；下一次保存日记或手动同步时写入云端。不同设备的次数会相加。
- 删除日记时，本机配图会一起从 IndexedDB 删除；Cloudinary 文件和旧仓库里的 `data/images/` 文件不会自动删除（Cloudinary 免费 unsigned 上传无法安全删除）。

> 管理员密码只保护页面内的管理操作，不是服务器账号。它是客户端校验，懂技术的人可以直接修改前端；真正的隐私边界仍然是日记密码和加密。

### 可选：Cloudinary 跨设备配图

1. 注册 [Cloudinary](https://cloudinary.com/) 免费账号。
2. 进入 Console → **Settings → Upload → Upload presets → Add upload preset**。
3. **Signing Mode** 选 **Unsigned**。
4. 建议把文件夹设为 `tidal-diary`，并限制单文件大小（例如 2 MB）。
5. 保存后记下 **Cloud name** 和 **Upload preset name**。
6. 回到日记 → 设置 → 管理员后台 → 配图存储，选择 **Cloudinary**，填入这两项并保存。
7. 添加一张新配图，然后在另一台设备登录同一本日记，确认能加载。

注意：

- 图片会先在浏览器里加密，Cloudinary 只保存 raw 密文；URL 虽然是公开的，但没有密码解不开。
- Unsigned preset 意味着持有 preset 名的人也能上传；请限制文件大小，并定期查看 Cloudinary 用量。免费额度以 Cloudinary 官网为准。
- 删除日记不会删除 Cloudinary 文件，需要在 Cloudinary 控制台手动清理。

### 自动上锁

默认 15 分钟无操作后自动上锁。可以在 **设置 → 安静与安全** 中修改或关闭。

---

## 同步、离线与合并

- 阅读时优先从 GitHub API 拉取最新密文；如果 API 不可用，会尝试 public raw 回退，再退回本机缓存。
- 写入时先合并云端与本地：同一条目按 `updatedAt` 取较新版本；删除会写入 tombstone，防止别的设备把已删除条目同步回来。
- 网络失败时，内容会先用密码加密写入 `localStorage`，状态显示“离线 / 待同步”。下次解锁或点击“立即同步”时会重试。
- 每一篇日记都是完整密文中的一条记录；保存时会上传整份密文。普通日记体积很小（几 MB 以内完全够用）。
- 配图不会写进 `data/diary.enc.json` 的内容里，只留下加密的引用；图片密文在本机 IndexedDB 或 Cloudinary，因此不会让 GitHub 仓库随照片增长。
- 阅读统计也保存在加密数据里，但它**不会**单独触发提交；只在保存日记或管理员手动同步时带上去，避免每读一次就产生一个 Git 提交。

---

## 备份与迁移

设置 → **把日记带走**：

1. **加密备份**：下载 `.json`，包含被密码包裹的主密钥、文字密文、配图引用与阅读统计。可以在另一个潮汐手记部署中用备份密码导入；导入后会用当前部署的密钥重新加密并合并。**本机 IndexedDB 里的配图文件不在这个 JSON 里**。Cloudinary 上的图片仍然是用旧日记主密钥加密的：同一本日记换设备可以读取，但导入到一个全新主密钥的日记时会打不开。
2. **Markdown**：明文导出，适合打印、迁移或放入其他笔记软件。**配图不会嵌入 Markdown，而且这是明文，请自己保管。**
3. **导入备份**：支持加密备份、`tidal-diary-backup` 包、明文 JSON 数组或 `{ entries: [...] }`。导入本机配图引用到新设备时，如果没有对应图片文件，会显示“配图暂时打不开”。

> 备份文件和密码请分开保存。忘记密码时，加密备份同样打不开。

---

## 本地预览

不要直接双击 `index.html`：`crypto.subtle` 需要安全上下文，`file://` 下不可用。

```bash
# 在项目目录
python -m http.server 8000
```

打开：

```text
http://localhost:8000/
```

演示模式（不读配置、不写入任何地方）：

```text
http://localhost:8000/?demo=1
http://localhost:8000/?demo=1&locked=1     # 停在全屏锁屏
```

演示内容只存在于当前页面内存，刷新后重置。

---

## 文件结构

```text
.
├── index.html                 # 书架 / 锁屏 / 阅读器 / 编辑器
├── setup.html                 # 配置向导
├── DEPLOY.md                  # 新手部署教程（推荐先看）
├── manifest.webmanifest       # PWA
├── sw.js                      # 离线缓存
├── config.example.json        # 示例，不要当作正式配置
├── assets/
│   ├── favicon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
├── css/
│   ├── style.css              # 主样式（含手机阅读器）
│   └── setup.css              # 配置页样式
├── js/
│   ├── app.js                 # 主程序 / UI / 路由
│   ├── crypto.js              # PBKDF2 / AES-GCM / 密钥包裹
│   ├── reader.js              # 真实分页、翻页、进度、图片页
│   ├── images.js              # 本地图片压缩、配图标记
│   ├── image-store.js         # IndexedDB / Cloudinary 配图存储适配
│   ├── repository.js          # 配置、缓存、GitHub 同步与合并、配图上传/解密
│   ├── github.js              # Contents API 客户端
│   ├── model.js               # 日期、文本、合并工具
│   └── demo.js                # 演示日记
└── tests/
    └── run-tests.mjs          # 加密与同步逻辑测试（Node）
```

配置成功后，仓库里还会出现：

```text
config.json
data/diary.enc.json
```

它们是运行时生成的，不需要手工创建。  
旧版本可能还有 `data/images/`（兼容读取）；新版配图默认不再写入这里。

---

## 自定义

- **站点标题**：配置向导里的“日记名字”，会显示在书架和浏览器标题上。
- **主色 / 纸色 / 字体**：修改 `css/style.css` 顶部的 CSS 变量（如 `--accent`、`--paper`、`--font-serif`）。
- **封面文字**：`index.html` 里的 `.cover-title`、`.cover-sub`、`.cover-foot`。
- **每页的 Δ**：搜索 `.page-delta`；如果想换成别的符号，修改 `reader.js` 中 `finishPage` / `createPage` 附近的 `Δ` 文本。
- **PWA 图标**：替换 `assets/icon-*.png` 和 `favicon.svg` 后，更新 `sw.js` 的 `VERSION`。

---

## 常见问题

### 配置完成后首页还是“尚未配置”

GitHub Pages 需要重新部署，通常 1–2 分钟。确认：

- `config.json` 在站点根路径（若从 `docs/` 发布，则是 `docs/config.json`）；
- Pages 的发布目录与向导中“Pages 发布目录”一致；
- 浏览器缓存 / CDN 缓存：强制刷新一次。

配置地址可以直接访问测试：

```text
https://你的站点/config.json
```

### “密码不对”但确定没输错

- 检查是否用了全角 / 半角混淆字符。密码会做 NFKC 规范化，但仍建议使用普通 ASCII 字符。
- 如果刚在另一台设备上改过密码，等待 Pages 部署后再试；当前设备可能还读到旧的 `config.json`。
- 如果修改过 `config.json` 或 `data/diary.enc.json`，可能已经无法解密；请从备份恢复。

### 忘记密码

无法恢复。请从加密备份 + 当时密码尝试，或从 Markdown / 明文备份重建。

### Token 过期 / 泄露

- 过期：设置 → 更新 Token。
- 泄露：立即到 GitHub 撤销旧 Token，再生成新 Token，用“更新 Token”写回。
- 旧 Token 仍可能存在于 Git 历史中（加密状态），撤销后即失效。

### 私有仓库能用吗

可以，但要求 GitHub Pages 支持私有仓库发布，且必须用 Token 通过 API 读取，raw 回退不可用。建议公开仓库 + 客户端加密，成本更低。

### 数据会不会被 GitHub 看到

GitHub 能看到密文，无法看到正文（除非密码很弱并被离线破解）。提交时间等元数据可见。

### 离线能写吗

可以。离线时内容加密保存在本机，状态显示“离线 / 待同步”，下次联网同步。不要在清除浏览器数据前不备份。

### 换手机 / 换浏览器

只要仓库、`config.json`、密码和 Token 都还在，输入密码即可。阅读进度不会跨设备同步，但正文会。

### 能不能修改密码

可以，设置 → 更改密码。正文不会重新加密，只换钥匙。忘记新密码同样无法恢复。

---

## 开发与测试

需要 Node.js 18+（推荐 24）：

```bash
node tests/run-tests.mjs
```

测试覆盖：

- 密码派生、主密钥包裹 / 解锁、错误密码
- AES-GCM 加密解密、AAD
- 密码更换后主密钥保持不变
- 条目合并、墓碑删除
- 与 GitHub Contents API 的读取 / 写入 / 冲突重试（假客户端）

没有构建步骤。所有前端文件都是原生 ES Module。

---

## 许可

MIT License。见 [LICENSE](./LICENSE)。

---

<p align="center">
  <span style="font-family: Georgia, serif; font-size: 20px;">Δ</span><br />
  每一页，都有一点微小的不同。
</p>
