# 我把 SOLO 的免费模型接入了 Claude Code，然后发现它没法写文件

整个下午的工作量加起来大概四个小时。我逆向了 SOLO 的全部 API 协议，写了一个 OpenAI 兼容网关，解决了 JWT 认证、模型名映射、流式响应、Claude Code SDK 兼容性等所有问题。

三次连续测试全部通过。

然后我让它在本地创建一个文件。

它说：已创建在 `/workspace/todo.js`。

我看了看本地目录。空的。

---

## 起点

Trae SOLO 是字节跳动做的 AI IDE，里面有十三个免费模型：DeepSeek V4 Pro、Kimi K2.6、通义千问 3.6、GLM-5、豆包 Seed Code、MiniMax M2.7……

十三个。免费的。

我用 Claude Code 做开发，每月 Anthropic 账单不轻。如果能把 SOLO 的模型接到 Claude Code 里当后端，等于白嫖十三个大模型。

思路很直接：做一个 API 网关，把 SOLO 的私有协议翻译成 OpenAI 兼容格式，让 Claude Code 以为自己在跟 Anthropic 对话。

## 第一步：搞清楚 SOLO 的 API 长什么样

SOLO 有网页版，`solo.trae.cn`。我用 Playwright 打开浏览器，登录，发一条消息，然后看 DevTools 的 Network 面板。

所有 AI 请求都走 `solo.trae.cn/api/remote/v1/`。认证头是 `Authorization: Cloud-IDE-JWT <token>`。Token 存在 `~/.trae-cn/trae-jwt-token`，RS256 签名，大约八小时过期。

创建会话：

```
POST /api/remote/v1/chat_sessions
```

请求体里有一个 `initial_message` 字段，包含模型名、agent 类型、用户消息。消息格式是 JSON 字符串：

```json
"[{\"type\":\"text\",\"data\":{\"content\":\"用户的问题\"}}]"
```

发送后续消息：

```
POST /api/remote/v1/chat_sessions/:id/messages
```

格式几乎一样。响应用 Server-Sent Events 流式推送，也可以轮询 `/messages` 端点拿到完整结果。

协议不复杂。一下午足够。

## 第二步：写网关

五个文件。`constants.ts`（模型映射表）、`protocol.ts`（格式转换）、`proxy.ts`（API 代理）、`token-manager.ts`（JWT 管理）、`index.ts`（Express 服务器）。

核心逻辑就一件事：把 OpenAI 的 `messages` 数组塞进 SOLO 的 `query` 字段，把 SOLO 的结构化响应提取出纯文本。

SOLO 的响应格式有点特别——不是直接返回文本，而是一棵任务树：

```json
{
  "task_id": "...",
  "messages": [{
    "type": "plan_item",
    "plan_item": {
      "tool_call_info": {
        "name": "finish",
        "params": { "summary": "实际的回答文本" }
      }
    }
  }]
}
```

真正的回答藏在 `tool_call_info.params.summary` 里。我写了个提取器，找到 `name === "finish"` 的节点，取出 `summary`。

网关跑起来了。用 curl 测试，返回干净的 "你好"。流式模式也能用，chunk 正常推送。

到这里，一切顺利。

## 第三步：接入 Claude Code

这才是真正的坑。

Claude Code 用 Anthropic SDK，请求发到 `/v1/messages`。我在网关加了一个 Anthropic 格式的端点，把请求转成 OpenAI 格式发给 SOLO，再把响应包装回 Anthropic 格式返回。

用 curl 测试 Anthropic 端点，完美。

用 Claude Code 测试——

```
API Error: 400 Param Incorrect
```

我以为是模型名不对。换成标准的 `claude-sonnet-4-6`。还是 400。

我以为是 API Key 格式问题。换成 `ANTHROPIC_AUTH_TOKEN`。还是 400。

我在 `/tmp` 目录下用环境变量试了一下——

```
SONNET_TEST_OK
```

成了？

同一个模型名，同一个网关，只是运行目录不同。从 `/tmp` 跑就成功，从有 `.claude/settings.json` 的目录跑就失败。

我盯着终端看了三十秒。

然后我去翻 gateway 的请求日志。发现了一行：

```
POST /v1/v1/messages?beta=true
```

双重路径。`/v1/v1/messages`。

Claude Code 会自动在 `ANTHROPIC_BASE_URL` 后面追加 `/v1/messages`。而我把 `ANTHROPIC_BASE_URL` 设成了 `http://localhost:18080/v1`，多了一个 `/v1`。

从 `/tmp` 跑成功是因为没有 settings.json，用的是环境变量，碰巧没设错。

改成 `http://localhost:18080`（不带 `/v1`），问题解决。

但这还没完。

Claude Code 还会校验模型名。它把请求的模型名跟 API 返回的 `/v1/models` 列表对比，不在列表里的直接拒绝，请求都不会发出来。

我的模型列表只返回了 Anthropic 的三个标准名。SOLO 的原生模型名（`kimi-k2.6`、`DeepSeek-V4-Pro` 等）全都不在。

用户在 settings.json 里写 `"ANTHROPIC_DEFAULT_SONNET_MODEL": "kimi-k2.6"`，Claude Code 查列表找不到，就报 "model may not exist or you may not have access"。

解法：把所有 SOLO 模型名都加进 `/v1/models` 的返回列表。十九个模型名，Anthropic 别名加 SOLO 原生名，全返回。

加完之后，用户可以直接在 settings.json 里写 SOLO 模型名：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:18080",
    "ANTHROPIC_AUTH_TOKEN": "sk-solo-gateway",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "kimi-k2.6"
  }
}
```

Claude Code 查列表，找到了，放行。

三次连续测试，全部通过。

到这里，技术上完全成功。

## 第四步：实测

我让它在本地 test 目录创建一个简单的 Node.js CLI 小工具——一个 todo list，一个文件就够。

它回复了完整的用法说明：

```
node todo.js add "买菜"
node todo.js list
node todo.js done 1
```

看起来不错。我看看本地目录。

```
.claude/
└── settings.json
```

没有 `todo.js`。

模型说"文件已创建在 `/workspace/todo.js`"。`/workspace` 是 SOLO 云端沙箱的路径，不是本地路径。

它确实创建了文件。在字节的服务器上。

---

## 结论

SOLO 的模型运行在云端沙箱里。它们能看到的文件系统、能执行的命令、能写入的文件，全在字节的服务器上，不在你电脑上。

Claude Code 做本地开发，核心能力是：读你的项目文件、改你的代码、在你的终端里跑命令。这些全部依赖模型能触达本地文件系统。

SOLO 模型触达不了。

网关做得很完美。协议转换、认证管理、流式响应、模型校验——所有技术问题都解决了。三次稳定性测试全通过。

然后你发现你做了一个精美的遥控器，对着一堵墙按。

---

## 这个网关还能干什么

说"完全没用"也不对。它确实能用，只是用途跟最初设想的不同：

**能做的：**
- 当智能问答后端——你问它问题，它回答，不需要碰本地文件
- 代码审查——把代码贴进去让它分析
- 文本生成——翻译、总结、格式转换
- 通过 OpenAI 格式给其他工具用

**不能做的：**
- 让它帮你写代码到本地项目
- 让它帮你跑测试
- 让它帮你调试——它看不到你的运行环境
- 任何需要"读本地文件"的操作

换句话说，它是一个纯对话模型的网关，不是一个开发工具的网关。

而 Claude Code 的价值，恰恰在于它是一个开发工具，不只是一个对话机器人。

---

## 后记

四个小时的工程量。逆向协议、写网关、解决兼容性——每一步都走通了。

最后的结论是：SOLO 的模型在架构层面就不适合做本地开发。不是网关的问题，不是协议的问题，不是认证的问题。是模型运行在一个跟你电脑完全隔离的环境里。

你花四个小时造了一把完美的钥匙。

然后发现锁在另一个房间里。

也许这篇文章最大的价值，是让后来的人不用再花这四个小时。
