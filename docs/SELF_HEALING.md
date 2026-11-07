# Self-healing：Sloth-Python 分析与 TypeScript 移植

本实现来自本机 `sloth-python/pytest_demo/self_healing/` 的代码分析。它是基于规则和 DOM 字符串相似度的定位器恢复，不调用 LLM、远程 AI 服务，也不需要 API key。Python 项目没有被修改。

## Python 原实现

| 文件 | 实际行为 |
|---|---|
| `locator_store.py` | 读取按页面拆分的 JSON，兼容旧的 `locators.json`；按 key 找到所属文件，更新 `primary` |
| `element_finder.py` | 按 `primary → fallbacks` 顺序尝试 id、CSS、XPath、text；默认每个策略等待 1500 ms，返回 `.first` |
| `dom_similarity.py` | BeautifulSoup/lxml 解析 `page.content()`，遍历所有标签，使用 `difflib.SequenceMatcher` 计算相似度 |
| `self_healing.py` | 常规定位失败后扫描 DOM，最高分达到 0.45 就生成定位器；默认立即写回 JSON |
| `self_healing.py:click` | 正常点击失败后按 Escape，再以 `force=True` 点击 |

Python 的评分公式：

```text
score = text × 0.35 + id × 0.25 + class × 0.15
      + name × 0.10 + aria-label × 0.10 + tag × 0.05
```

字符串先去除首尾空白、转小写。标签名一致得 1，否则得 0。新定位器优先级是 `id → data-testid → name → 首个 class → 绝对 XPath`。普通 fallback 成功不会写回；只有 DOM 相似度恢复才写回。Robot 调用处显式设置了 `auto_update=False`，与 Python helper 的默认值不同。

发现的风险：

- `SequenceMatcher('', '').ratio()` 等于 1。若 expected 只配置 text/tag，候选也没有 id/class/name/aria-label，这四项就能贡献 **0.60**，已经超过 0.45 阈值，即使文字完全不同。
- 所有标签都参加竞争，包括隐藏元素和父容器；第一名与第二名接近时仍直接选第一名。
- `.first` 会掩盖定位器匹配多个元素的问题，class 生成的选择器也不保证唯一。
- 新定位器在点击成功之前写回；强制点击可能绕过遮挡检查。找到相似元素不等于业务测试正确。
- 捕获所有异常后尝试恢复，可能把语法错误或浏览器关闭也当成定位器变化。

## TypeScript 版本

| Python 模块 | 本项目对应文件 |
|---|---|
| JSON 结构 | [`types.ts`](../utils/self-healing/types.ts)、[`locators/challenging-dom.json`](../locators/challenging-dom.json) |
| locator_store | [`locator-store.ts`](../utils/self-healing/locator-store.ts) |
| element_finder / self_healing | [`self-healing.ts`](../utils/self-healing/self-healing.ts) |
| dom_similarity | [`dom-similarity.ts`](../utils/self-healing/dom-similarity.ts) |
| 测试与报告接入 | [`test-fixtures.ts`](../fixtures/test-fixtures.ts)、[`ChallengingDomPage.ts`](../pages/internet/ChallengingDomPage.ts) |

流程仍然是主定位器、备用定位器、DOM 相似度扫描，但以下行为有意调整：

1. **保留严格定位。** 不用 `.first()`；仅在等待可见元素超时时尝试下一策略。多匹配、无效选择器、浏览器关闭等错误直接失败。
2. **明确预期特征。** 相似度恢复需要显式 `expected`；至少配置一个非空的非 tag 特征。只给 tag 不足以识别目标。不把 CSS 表达式猜成元素文字。
3. **减少误匹配。** 保留六项权重，但只对已配置且非空的字段评分并按有效权重归一化。指定 tag 时必须一致。默认 `minScore=0.8`，第一名须领先第二名至少 `minMargin=0.1`。这些是启发式分数，不是正确率或概率。
4. **在指定范围扫描。** 从浏览器读取可见 DOM，不依赖 HTML 解析库。接受 Page 或 Locator；`editRow()` 传入精确匹配的行，仅在该行内恢复。
5. **验证新定位器。** 依次尝试 `data-test → data-testid → id → name → aria-label → 完整 class 组合`，必须在当前范围唯一且可见。没有唯一属性选择器就失败，不生成绝对 XPath。
6. **保留点击检查。** 不自动按 Escape，不强制点击。被遮挡或禁用仍失败。与 Playwright 的[严格定位](https://playwright.dev/docs/locators#strictness)和[可操作性检查](https://playwright.dev/docs/actionability)保持一致。
7. **默认只读。** `autoUpdate=false`。启用后，仅 DOM 恢复且 `click()` 成功才更新 `primary`；`findElement()` 和普通 fallback 不写回。更新保留 fallbacks/expected，只改所属 JSON，使用排他锁和原子重命名，遇到并发写入明确失败。
8. **恢复可见。** fixture 添加 `self-healing` annotation，并在报告中附加 `self-healing.json`，记录 key、恢复方式、原定位器、新定位器及相似度分数。直接构造 helper 时默认输出日志，也可传入 `onRecovery`。

字符串相似度采用匹配连续字符块的算法，保留 SequenceMatcher 的核心思路；额外合并连续空白、按 Unicode code point 处理字符，不实现 Python 的 autojunk 热门字符过滤。因此它是经过调整的移植，不承诺与 Python 对所有输入逐位相同。

## 使用

当前 `ChallengingDomPage.editRow()` 已通过 fixture 接入，无须修改调用代码：

```ts
await challengingDomPage.editRow('Iuvaret7');
await expect(page).toHaveURL(/#edit$/);
```

配置：

```json
{
  "challengingDom.edit": {
    "primary": { "by": "role", "value": "link", "name": "edit" },
    "fallbacks": [{ "by": "css", "value": "a[href='#edit']" }],
    "expected": { "tag": "a", "text": "edit" }
  }
}
```

表格行仍由原来的精确单元格文字匹配获得。随机变化的彩色按钮 id/text 没有进入恢复配置，因为缺少足够的稳定特征；原来的 `a.button` 集合定位保留。

新增页面时，为每个页面创建 JSON，并把文件传入 store。Python 的 `primary`、`fallbacks`、`expected` 和 `aria_label` 字段格式保留；增加 role、label、testId 策略，text 改为精确匹配。`testId` 使用 Playwright 当前配置的 `data-test`。

```ts
import { LocatorStore } from './utils/self-healing/locator-store';
import { SelfHealing } from './utils/self-healing/self-healing';

const store = new LocatorStore(['locators/signin.json', 'locators/signup.json']);
const healing = new SelfHealing(store, {
  timeoutMs: 1500, // 每个 primary/fallback 的可见性等待预算
  minScore: 0.8,
  minMargin: 0.1,
  autoUpdate: false,
});

await healing.click(page, 'account.login');
// 需要 fill 等操作时：
const input = await healing.findElement(page, 'account.username');
await input.fill('example');
```

启用 `autoUpdate: true` 是显式的文件修改选择。建议对恢复后的 diff 做代码审查；即使点击成功，仍需要业务断言确认结果。并行测试保持默认只读；写回运行可以使用 `--workers=1`。进程异常退出可能留下 `.lock` 文件，确认没有写入进程后再移除，不自动抢占锁。

## 验证

```bash
npm run typecheck
npm run lint
npm run test:healing
# 或只运行 Chrome：
npm run test:healing -- --project=chrome
npx playwright show-report playwright-report/healing
```

独立配置 [`playwright.healing.config.ts`](../playwright.healing.config.ts) 在已安装的 Chrome 和 Edge 中运行本地 `page.setContent()` 场景，无须 `.env`、登录或外部站点。常规 `npm test` 也会在 UI 项目中包含这些测试。

覆盖主定位器、按序 fallback、id/文字改变、写回与复用、只读行为、候选歧义与分差、低分、隐藏元素、禁用/遮挡、语法错误、多匹配、行级范围、特殊字符转义、拆分 JSON、非法定义及写入冲突。

边界：这不是全局 monkey patch，只对显式调用 helper 的操作启用。扫描是主/备用等待结束后的一次 DOM 快照，晚于此时出现的元素可能仍然失败；大 DOM 扫描也有开销。当前不跨 iframe 自动搜索、不为无唯一属性的元素构造位置选择器。恢复本身无法证明业务行为正确，现有断言仍应保留。
