## 我不猜会问你 1.2.3

第一个公开版本。当我在按一种你没明说的理解动手之前，先把推断出来的几种需求摆成选择框让你挑。

### 这一版有什么

- **选择框就是输入区那张提问卡**：一句问题、我猜的那份需求、2–5 个候选理解，推荐项排第一。
- **选完就照做**：其它候选作废，同一个点不会再问第二遍；你也可以自己写一句，覆盖所有候选。
- **跳过和关掉是两件事**：跳过 = 别再问这个点，我按推荐项继续并说明用了这个假设；关掉卡片 = 你另有说法，我停下来在正文里问你这块要怎么做。
- **三档提问频率**：平衡 / 严格 / 轻量，在「设置 → 不猜需求」里切换，下一轮对话立即生效。
- **中英双语界面**，选择框里的问题和选项跟着你用的语言写。
- **安装**：设置 → 插件 → 添加插件，填 `https://github.com/SillyMeo-1/dont-guess-ask`。

### 已知限制

- 子代理里弹不出选择框：它会先把能做的做完，再把没定的点交给上层来问你。
- 没有连着 Web 前端时卡片弹不出来，我会按推荐项继续并说明假设。

MIT License.

---

First public release of the DeepSeek Harness plugin **Ask, don't guess**. When a requirement was never stated, it puts the readings I inferred into the composer's choice card instead of guessing and running ahead. Install from Settings → Plugins → Add plugin with `https://github.com/SillyMeo-1/dont-guess-ask`.
