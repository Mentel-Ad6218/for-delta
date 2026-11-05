# 潮汐手记 · 新手部署指南

这是一份**从零开始、按鼠标点击顺序写**的部署说明。  
不需要会写代码，不需要服务器，不需要数据库。只需要一个 GitHub 账号。

完成后的效果：

```text
https://你的用户名.github.io/你的仓库名/          ← 日记首页
https://你的用户名.github.io/你的仓库名/setup.html ← 配置向导
```

---

## 一、先理解我们要做哪几件事

整个过程只有 3 个阶段：

```text
① 把网页文件放进 GitHub 仓库
        ↓
② 打开 GitHub Pages，让仓库变成一个网站
        ↓
③ 打开网站里的 setup.html，生成密码和同步配置
```

配置向导会帮你自动写入两个文件：

```text
config.json            ← 配置：密码参数、加密后的 GitHub Token
data/diary.enc.json    ← 你的日记密文（一开始是空的）
```

> 这两个文件**不需要你手动创建**，配置向导会通过 GitHub API 自动写进去。

---

## 二、开始前准备

请准备：

- [ ] 一个 GitHub 账号（没有就注册：<https://github.com/signup>）
- [ ] 10–15 分钟
- [ ] 一个**日记密码**，至少 10 位，建议 12 位以上
- [ ] 项目文件夹：`C:\Users\thtth\Documents\tidal-diary`

### 关于密码

这个密码：

- 是**日记密码**，不是 GitHub 登录密码；
- 只在你的浏览器里使用；
- 一旦忘记，**日记无法恢复**；
- 建议先写在纸上或密码管理器里。

### 关于仓库公开与私密

推荐使用**公开仓库（Public）**：

- GitHub Pages 免费、稳定；
- 日记正文上传前已经加密，别人只能看到密文；
- `config.json` 里的 Token 也是加密的。

如果你坚持用私有仓库：

- GitHub Pages 对私有仓库的支持取决于你的 GitHub 套餐；
- 如果开启 Pages 后一直 404，通常是因为免费账号不支持私有仓库 Pages；
- 最简单的解决办法是改成 Public。

---

## 三、第一步：创建仓库

1. 登录 GitHub。
2. 打开 <https://github.com>。
3. 点右上角的 **`+`**，选择 **New repository**。
4. 按下面填写：

| 项目 | 填什么 |
| --- | --- |
| Owner | 你的用户名，保持默认 |
| Repository name | `tidal-diary`（小写，用横线） |
| Description | 可留空 |
| Public / Private | 选 **Public** |
| Add a README file | **不要勾选** |
| Add .gitignore | **不选** |
| Choose a license | **不选** |

5. 点 **Create repository**。

> 仓库名可以换成你喜欢的名字，例如 `my-diary`。  
> 后面所有网址里的“仓库名”都要跟它一致。

---

## 四、第二步：上传网页文件

### 正确目标

仓库首页应该直接看到：

```text
index.html
setup.html
css/
js/
assets/
...
```

也就是说：**`index.html` 必须在仓库最外层**。

### 操作

1. 在刚创建的仓库页面，找到 **uploading an existing file** 链接。  
   如果没有看到，点 **Add file → Upload files**。
2. 打开 Windows 资源管理器，进入：

```text
C:\Users\thtth\Documents\tidal-diary
```

3. 在里面按 **Ctrl + A**，选中所有文件和文件夹。
4. 把这些内容**拖进 GitHub 网页的上传区域**。

> 注意：是把 `tidal-diary` 文件夹**里面的东西**拖进去，  
> 不是把整个 `tidal-diary` 文件夹拖进去。  
> 否则仓库里会多一层 `tidal-diary/`，网址也会变复杂。

5. 等文件列表全部出现。
6. 页面下方拉到 **Commit changes**：
   - 提交说明可以写 `first upload`
   - 点 **Commit changes**

### 上传后检查

回到仓库首页，确认：

- 第一层能看到 `index.html`；
- 能看到 `setup.html`；
- 能看到 `css`、`js`、`assets` 三个文件夹。

如果第一层是一个 `tidal-diary` 文件夹，说明多套了一层。  
处理方式：删掉这一层，重新按上面的方法只拖里面的内容。

### 关于 `.nojekyll`

项目根目录有一个 `.nojekyll` 文件。  
Windows 默认可能隐藏以点开头的文件，网页上传时没有它一般也不影响使用。  
不是必须项，上传失败可以跳过。

---

## 五、第三步：开启 GitHub Pages

1. 进入仓库页面。
2. 点顶部的 **Settings**。
3. 在左侧菜单找到 **Pages**。  
   通常位于 **Code and automation** 分组下。
4. 找到 **Build and deployment**：
   - **Source** 选择 **Deploy from a branch**
   - **Branch** 选择 **main**
   - **Folder** 选择 **/ (root)**
5. 点 **Save**。

稍等 1–2 分钟，刷新当前页面。  
页面顶部会出现类似这样的提示：

```text
Your site is live at https://你的用户名.github.io/你的仓库名/
```

这个地址就是你的日记首页。

### 地址规律

| 仓库情况 | 网站地址 |
| --- | --- |
| 仓库名 `tidal-diary` | `https://用户名.github.io/tidal-diary/` |
| 仓库名 `用户名.github.io` | `https://用户名.github.io/` |
| 配置了自定义域名 | 你设置的域名 |

配置向导的地址就是网站地址后面加 `setup.html`：

```text
https://用户名.github.io/tidal-diary/setup.html
```

> 如果打开这个地址是 404，**不要急着配置**。  
> 先回到 Settings → Pages，确认状态是 “Your site is live”，然后再试。  
> 也可以等 1–2 分钟再刷新。

---

## 六、第四步：生成 GitHub Token

Token 相当于一把“只允许程序写入这个仓库”的临时钥匙。

### 6.1 打开 Token 页面

直接打开：

<https://github.com/settings/tokens?type=beta>

或者手动点：

```text
GitHub 头像 → Settings
→ Developer settings（左侧最下面）
→ Personal access tokens
→ Fine-grained tokens
```

### 6.2 创建 Token

1. 点 **Generate new token**。
2. **Token name**：填 `tidal-diary-sync`。
3. **Expiration**：选 90 天或 1 年。  
   到期后在日记设置里更新即可，不需要重建日记。
4. **Repository access**：
   - 选择 **Only select repositories**
   - 选中你的日记仓库（例如 `tidal-diary`）
5. **Permissions → Repository permissions**：
   - 找到 **Contents**
   - 改成 **Read and write**
   - 其他权限不用给
6. 点 **Generate token**。
7. 复制屏幕上出现的 Token：
   - 通常以 `github_pat_` 开头
   - **只显示这一次**，关掉页面就看不到了

> 如果不小心关掉了，不要慌：重新生成一个即可，旧 Token 可以之后撤销。

### 6.3 更简单的备用方案：Classic Token

如果 Fine-grained 页面让你觉得太复杂，也可以用 Classic Token：

1. 打开 <https://github.com/settings/tokens>
2. **Generate new token (classic)**
3. Note 填 `tidal-diary-sync`
4. 勾选 **repo** 这一项
5. 生成并复制，通常以 `ghp_` 开头

Classic Token 的权限更大，会覆盖你账号下的所有仓库，所以更推荐 Fine-grained。  
两种 Token 配置向导都支持。

---

## 七、第五步：运行配置向导

### 7.1 打开向导

打开：

```text
https://你的用户名.github.io/你的仓库名/setup.html
```

如果尾部没有斜杠，也可以：

```text
https://你的用户名.github.io/你的仓库名/setup.html
```

### 7.2 填写内容

按表格填写：

| 页面字段 | 填什么 | 示例 |
| --- | --- | --- |
| 日记名字 | 你喜欢就好 | 潮汐手记 |
| 密码 | 至少 10 位，建议 12 位以上 | 自己记住的强密码 |
| 再输入一次 | 和上面完全一样 | — |
| GitHub 用户名 | GitHub 个人主页 URL 里的名字 | `alice` |
| 仓库名 | 你创建的仓库名 | `tidal-diary` |
| 分支 | 默认 `main` | `main` |
| Pages 发布目录 | **从仓库根目录发布时留空** | 留空 |
| GitHub Token | 刚才复制的 Token | `github_pat_...` |

> “GitHub 用户名”不是你的显示昵称，也不是邮箱。  
> 打开你的个人主页 `https://github.com/你的名字`，URL 最后那一段就是用户名。

### 7.3 如果从 `docs/` 发布

只有当你把所有网页文件放在仓库的 `docs/` 文件夹里，并且 Pages 设置为 `/docs` 时：

- **Pages 发布目录** 填 `docs`
- 向导会写入 `docs/config.json` 和 `docs/data/diary.enc.json`

如果你不确定，就按本文档推荐的方式：**文件放仓库根目录，发布目录留空**。

### 7.4 验证并生成

1. 点 **验证**：
   - 成功时会显示绿色的“Token 有效 · 已连接 @你的名字 · 仓库名”。
   - 如果失败，先看下面的“常见问题”。
2. 勾选“我明白：如果忘记密码，日记无法恢复。”
3. 点 **生成保险箱并写入仓库**。
4. 等待几秒到十几秒。
5. 看到 **“钥匙已经放好了”** 页面，就说明成功。

配置向导弹出的成功页可以：

- 点“去打开日记”
- 查看 `config.json`
- 下载 `config.json` 和空日记作为备份

### 7.5 向导自动做了什么

它会在仓库中创建：

```text
config.json
data/diary.enc.json
```

并写入一条提交记录。

你不需要手动上传这两个文件。

---

## 八、第六步：等待并打开日记

1. 配置完成后，GitHub Pages 需要重新部署，通常 1–2 分钟。
2. 打开或刷新：

```text
https://你的用户名.github.io/你的仓库名/
```

3. 输入你刚才设置的日记密码。
4. 进入书架，点“写一页”开始写。

### 如果首页还显示“尚未配置”

按顺序检查：

1. **等**：GitHub Pages 有时需要 3–5 分钟。
2. **强制刷新**：`Ctrl + F5`（Mac 用 `Cmd + Shift + R`）。
3. 直接打开配置文件测试：

```text
https://你的用户名.github.io/你的仓库名/config.json
```

- 如果能看到一大段 `{ "format": "tidal-diary-config", ... }`，说明配置已经存在，是页面缓存问题。
- 如果看到 404，说明配置没有写到正确的站点根目录，或者 Pages 发布目录填错了。

4. 检查仓库首页是否能看到 `config.json` 和 `data` 文件夹。  
   如果没有，回到向导重新配置；如果向导提示已有配置，见“Token 过期/重新配置”。
5. 检查 Pages 设置里的 Branch / Folder：
   - 根目录发布：`main` + `/ (root)`，向导的发布目录留空
   - docs 发布：`main` + `/docs`，向导的发布目录填 `docs`
6. 如果仓库是 Private，先确认你的 GitHub 套餐支持私有仓库 Pages；不支持就先改成 Public。

---

## 九、第一次使用

### 写第一篇

1. 进入首页并输入密码。
2. 点“写一页”或“写今天”。
3. 填写：
   - 标题
   - 正文
   - 心情、天气（可选）
4. 点右上角“收好这一页”。
5. 看到成功提示后，文字会同步到 GitHub。

新版已经停用“添加配图”。旧版本写入 `data/images/` 的图片仍会只读显示，但不会再新增图片。

### 手机阅读

- 首页点任意一篇 → 全屏阅读。
- 左滑 / 右滑翻页。
- 点屏幕左侧 28% / 右侧 28% 翻页。
- 点中间显示或隐藏工具栏。
- 右上角：
  - `T`：字号、纸色
  - 书本图标：目录
  - `⋯`：复制链接、立即上锁；编辑已有日记需要先开启管理员模式

### 管理员模式

1. 先解锁日记。
2. 设置 → **管理员模式** → 点击“开启”。
3. 输入管理员密码（输入框提示是“我的手机密码”）。
4. 开启后可以：
   - 编辑已有日记；
   - 删除日记；
   - 打开管理面板，查看每篇日记的总计 / 本机阅读次数；
   - 修改日记密码；
   - 导入备份。
5. 管理员模式在**每次上锁后自动关闭**；刷新页面也会重置。
6. 未开启时这些按钮仍然存在，但点击会提示“只有管理员可以使用该功能”。  
   阅读、初次写新日记、导出和改主题等不受影响。

管理面板里可以逐篇“编辑”或“删除”，也可以手动“同步阅读统计”。

注意：管理员密码只是页面内的管理锁，不是服务器权限；真正的内容保护仍然是日记密码。

### 自动上锁

默认 15 分钟无操作自动上锁。  
可以在 **设置 → 安静与安全** 中修改。

### 添加到手机主屏幕

- iPhone Safari：分享 → 添加到主屏幕
- Android Chrome：⋮ → 添加到主屏幕 / 安装应用

---

## 十、常见问题

### 1. 打开 `setup.html` 是 404

原因通常是：

- Pages 还没启用；
- Pages 还在构建；
- 网址里少了仓库名；
- 文件被上传到了 `tidal-diary/` 子文件夹里，正确地址应该是：

```text
https://用户名.github.io/仓库名/tidal-diary/setup.html
```

如果是最后一种，建议把文件移动到仓库根目录，避免以后路径混乱。

### 2. 配置成功，但首页一直“尚未配置”

按以下顺序排查：

1. 等 2–5 分钟并强制刷新。
2. 访问 `/config.json` 看是否能返回 JSON。
3. 检查 Pages 发布目录与向导里的“Pages 发布目录”是否一致。
4. 检查仓库里是否有 `config.json`。
5. 如果仓库是 Private，检查 GitHub Pages 套餐限制。

### 3. 验证 Token 失败

- **401**：Token 复制不完整或已过期。重新生成。
- **403**：Token 没有这个仓库的 **Contents: Read and write** 权限。
- **404**：用户名 / 仓库名写错，或者 Token 没有勾选这个仓库。

### 4. 向导说“仓库里已经有一份潮汐手记”

说明仓库里已有 `config.json` 或 `data/diary.enc.json`。  
这是保护机制，防止覆盖旧日记。

- 如果只是 **Token 过期**：不要继续运行向导。  
  回到日记首页 → 输入密码 → 设置 → 同步 → **更新 Token**。
- 如果确实要重新开始：先备份，再勾选页面上的覆盖确认。

### 5. 输入密码显示“密码不对”

- 确认没有开大写锁定；
- 确认用的是日记密码，不是 GitHub 密码；
- 如果刚在别的设备上改过密码，等待 Pages 部署后再试；
- 如果手动改过 `config.json`，可能已经无法解密。

### 6. 能读但无法保存

通常是 Token 过期或权限不足：

- 设置 → 同步 → **更新 Token**
- 粘贴新的、有 Contents 读写权限的 Token

### 7. 忘记日记密码

无法恢复。  
请尝试找到当时的加密备份和密码；如果没有，只能用 Markdown/明文备份重建。  
这就是端到端加密的代价。

### 8. 网站显示旧版本

- 强制刷新（Ctrl + F5）
- 等待 GitHub Pages 部署完成
- Service Worker 会优先从网络取 JS/CSS；刷新几次即可

### 9. 仓库是 Private，Pages 打不开

GitHub Pages 对私有仓库的支持需要相应套餐。  
最省事的方案：仓库改为 Public。正文是密文，不会直接暴露。

---

## 十一、后续维护

### 修改网页代码

- 在 GitHub 仓库里直接编辑文件，或重新上传替换；
- Pages 会自动重新部署；
- 不会影响 `config.json` 和加密日记。

### 修改密码

日记首页 → 设置 → 更改密码。

- 只更换打开主密钥的密码；
- 正文不会重新加密；
- 忘记新密码同样无法恢复。

### 更新 Token

设置 → 同步 → 更新 Token。

- 不需要重新生成日记；
- 不会覆盖正文；
- 旧 Token 之后可以在 GitHub 撤销。

### 备份

设置 → 把日记带走：

- **加密备份**：可用备份密码在另一个部署中恢复
- **Markdown**：明文，适合打印/迁移
- **导入备份**：合并已有备份

请把密码和备份分开保存。

### 更新后密码没变但页面提示旧密码

可能是 GitHub Pages CDN 还在发布。等 1–2 分钟，强制刷新。  
其他设备也需要重新获取 `config.json`。

---

## 十二、安全提醒

- 不要在任何聊天、Issue、截图中粘贴你的 GitHub Token。
- 不要在公开场合输入日记密码。
- 推荐 12 位以上密码，不要使用生日、手机号、`5201314` 这类弱密码。
- 公开仓库中，GitHub 能看到提交时间、文件大小等元数据，但正文是 AES-256-GCM 密文。
- 项目自带 `robots.txt` 与 `noindex`，但这不是访问控制，知道网址的人仍然能打开锁屏页。
- 如果网站本身被篡改（例如 GitHub 仓库被他人写入），就可能出现恶意脚本。请保护 GitHub 账号并开启两步验证。

---

## 十三、用命令行部署（可选）

如果你更喜欢命令行：

```bash
cd C:\Users\thtth\Documents\tidal-diary
git init
git add .
git commit -m "first upload"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

然后按第五步启用 Pages。

不会用命令行完全没关系，按前面的网页上传方式即可。

---

## 十四、更新已有站点（管理员模式 + 移除配图 + 启动修复）

**不要重新运行配置向导，也不要删除仓库里的 `config.json` 和 `data/`。**  
旧版本留下的 `data/images/` 可以保留（只读兼容），新版不会再写入图片。

这次新增/修改的文件是：

```text
index.html          （修改：管理员模式、脚本版本）
css/style.css       （修改：管理员模式与启动提示）
js/app.js           （修改：管理员模式、移除新配图）
js/model.js         （修改：阅读统计）
js/crypto.js        （修改：数据载荷）
js/repository.js    （修改：只保留旧配图读取）
js/boot-guard.js    （新增：启动失败提示）
sw.js               （修改：缓存版本 + boot-guard.js）
README.md           （可选）
DEPLOY.md           （可选）
```

如果仓库里之前已经上传过 `js/image-store.js`，它现在已经不再被引用。**先确认所有新文件都上传成功，再删除它**；不删也不影响。

### 用 GitHub 网页更新

1. 打开仓库，点 **Add file → Upload files**。
2. 打开本地 `tidal-diary` 文件夹，按 **Ctrl + A** 选中**里面的内容**。
3. 拖进上传区，覆盖同名文件。
   - 不会删除仓库里已有的 `config.json`、`data/`；
   - 请确认新文件 `js/boot-guard.js` 也在上传列表里；
   - 确认 `js/app.js`、`js/repository.js`、`index.html` 确实被新版本覆盖。
4. Commit changes。
5. 等 1–2 分钟，强制刷新首页（Ctrl + F5）。

### 用 GitHub Desktop 更新

把新的项目文件覆盖到本地克隆目录，提交并 push 即可。  
**不要**把 `.git` 目录也覆盖掉。

### 更新后要检查什么

- 设置 → **管理员模式** 能看到“开启”按钮；
- 点击开启会弹出密码框，输入后显示“管理员模式 · 已开启”；
- 关闭管理员模式后，点“管理面板”、阅读页“编辑”、编辑器“删除”、更改密码，都会提示只有管理员可以使用；
- 打开管理面板能看到每篇阅读次数，逐篇有“编辑 / 删除”；
- 编辑器里不再有“添加配图”按钮；
- 设置页不再出现配图存储说明；
- 设置页底部应显示 `潮汐手记 v1.4.0 · 脚本已加载`；
- 不需要重新设置密码，也不需要重新生成 Token。

> 如果设置页底部一直显示“正在读取脚本版本…”，说明浏览器还在用旧 `app.js`。  
> 请强制刷新，或在浏览器开发者工具里注销 Service Worker 后再打开。  
> 离线缓存版本已经更新到 `tidal-v1.4.0`。

---

## 十五、最短检查清单

部署时按这个清单勾：

- [ ] 创建 Public 仓库
- [ ] 把 `index.html` 放在仓库根目录
- [ ] 上传 `setup.html`、`css/`、`js/`、`assets/`
- [ ] Settings → Pages → Deploy from branch → main → / (root) → Save
- [ ] 等到 “Your site is live”
- [ ] 生成 Fine-grained Token：Contents 读写
- [ ] 打开 `/setup.html`
- [ ] 填密码、用户名、仓库名、main、发布目录留空、Token
- [ ] 验证通过，勾选确认，生成
- [ ] 等 1–2 分钟，打开首页
- [ ] 输入密码，写第一页
- [ ] 把密码和加密备份保存好

---

如果还有一步卡住，把**出错页面上的文字**或**截图**发给主人自己的记录里，再对照上面的“常见问题”排查即可。  
最常出错的只有三个地方：**上传多套了一层文件夹、Pages 发布目录填错、Token 权限不够**。
