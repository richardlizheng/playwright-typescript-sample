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
| JSON 结构 | [`types.ts`](../utils/self-healing/types.ts)、[`locators/`](../locators/) |
| locator_store | [`locator-store.ts`](../utils/self-healing/locator-store.ts) |
| element_finder / self_healing | [`self-healing.ts`](../utils/self-healing/self-healing.ts) |
| dom_similarity | [`dom-similarity.ts`](../utils/self-healing/dom-similarity.ts) |
| 写回 JSON | [`healing-reporter.ts`](../utils/self-healing/healing-reporter.ts)、[`suggestions.ts`](../utils/self-healing/suggestions.ts)、[`scripts/apply-healing.ts`](../scripts/apply-healing.ts) |
| 测试接入 | [`test-fixtures.ts`](../fixtures/test-fixtures.ts) 的 `selfHealing` 与 `selfHealingMode` |

流程仍然是主定位器、备用定位器、DOM 相似度扫描，但以下行为有意调整：

1. **慢不等于坏。** primary 与全部 fallback 用 `locator.or()` 在同一个等待预算（默认 5000 ms）内竞争，按配置顺序取第一个可见匹配。页面渲染慢时会像普通定位器一样等待；已存在的 fallback 立即命中，不再逐个等待超时。只有整个预算用完仍找不到，才做 DOM 扫描。
2. **保留严格定位。** 不用 `.first()` 选择结果；获胜策略若匹配多个元素，直接报 strict mode violation。无效选择器、浏览器关闭等非超时错误原样抛出。
3. **明确预期特征。** 相似度恢复需要显式 `expected`，且至少配置一个非 tag 特征。只配置了 text 时要求归一化后完全相同：`Accept` 和 `Accepted` 的字符串相似度是 0.86，但它们是不同的控件。
4. **减少误匹配。** 六项权重不变，只对已配置字段评分并归一化。指定 tag 时必须一致，并且在浏览器端先按 tag 过滤，文本截断到 200 字符。默认 `minScore=0.8`，第一名需领先第二名至少 `minMargin=0.1`。这些是启发式分数，不是概率。
5. **在指定范围扫描。** 接受 Page 或 Locator，例如传入表格的一行，恢复就不会跑到另一行。
6. **生成稳定的定位器。** 候选优先级为 `data-test/data-testid → role + 可访问名称 → name / aria-label → class 组合 → id`。看起来是自动生成的 id 和 class（连续数字、hex 哈希、React `:r1:`、CSS Modules 哈希）会被排除，因为它们这次能恢复，下次就会失效。新定位器必须在范围内唯一、可见，并且通过 `and()` 确认指向得分最高的那个元素，而不只是一个长得像的元素。找不到这样的定位器就失败，不生成 XPath。
7. **保留点击检查。** 不自动按 Escape，不强制点击；被遮挡或禁用仍然失败。与 Playwright 的[严格定位](https://playwright.dev/docs/locators#strictness)和[可操作性检查](https://playwright.dev/docs/actionability)一致。
8. **测试进程从不写文件。** fixture 把恢复记录作为 `self-healing.json` 附件挂到测试上，同时加 annotation。[`healing-reporter.ts`](../utils/self-healing/healing-reporter.ts) 在运行结束时汇总成 `reports/self-healing.json` 并打印摘要。`npm run healing:apply` 读取汇总：所有运行一致的 DOM 恢复才成为更新；Chrome 和 Edge 选择不同时列为冲突，交给人决定；fallback 命中只提示 primary 已失效。默认 dry run，加 `-- --write` 才改 JSON，改完用 git diff 审查。因为只有一个写入者，不再需要文件锁。
9. **恢复不能悄悄放过。** `SELF_HEALING` 环境变量控制模式：

   | 模式 | 行为 | 适用 |
   |---|---|---|
   | `off` | 只用 primary，与普通定位器相同 | 排查问题、证明测试不依赖恢复 |
   | `report`（默认） | 恢复、记录，测试照常通过 | 本地、`main` 分支 |
   | `fail` | 恢复后继续执行并记录，测试结束时 fixture 报错使测试失败 | Pull request |

   `fail` 模式下测试仍然跑完，业务断言照样检查，建议也照样写入报告，所以一次运行就能拿到修复材料。[GitHub Actions](../.github/workflows/playwright.yml) 和 [Azure Pipelines](../azure-pipelines.yml) 对 PR 使用 `fail`，对 `main` 使用 `report`。单个文件可以用 `test.use({ selfHealingMode: 'report' })` 覆盖，[`recovery.spec.ts`](../tests/self-healing/recovery.spec.ts) 就是这样，因为它故意触发恢复。

字符串相似度采用匹配连续字符块的算法，保留 SequenceMatcher 的核心思路；额外合并连续空白、按 Unicode code point 处理字符，不实现 Python 的 autojunk 热门字符过滤。因此它是经过调整的移植，不保证与 Python 在所有输入上逐位相同。

## 定位：演示模块，不进 page object

本项目的原则是写稳定的定位器，再用 ESLint 禁止脆弱写法。`ChallengingDomPage.editRow()` 的 role 定位本身已经足够稳定，所以 page object 保持原生定位，self-healing 只在 [`tests/self-healing/`](../tests/self-healing/) 中通过 fixture 显式调用。这样它不会改变现有测试的行为，也便于单独评估。

## 使用

```ts
test('edit a row', async ({ challengingDomPage, selfHealing }) => {
  await challengingDomPage.goto();
  // 恢复只在这一行内进行
  await selfHealing.click(challengingDomPage.row('Iuvaret7'), 'challengingDom.edit');
});
```

fixture 会加载 [`locators/`](../locators/) 下的所有 `*.json`，新增页面只需新增文件，同一个 key 不能出现在两个文件里。文件按修改时间缓存，编辑后会重新读取。

```json
{
  "challengingDom.edit": {
    "primary": { "by": "role", "value": "link", "name": "edit" },
    "fallbacks": [{ "by": "css", "value": "a[href='#edit']" }],
    "expected": { "tag": "a", "text": "edit" }
  }
}
```

Python 的 `primary`、`fallbacks`、`expected` 和 `aria_label` 字段格式保留；新增 role、label、testId 策略，text 改为精确匹配。`testId` 使用 Playwright 当前配置的 `data-test`。`expected.tag` 必须是普通元素名，因为它会进入 CSS 选择器。

不经过 fixture 直接使用：

```ts
const healing = new SelfHealing(LocatorStore.fromDir('locators'), {
  timeoutMs: 5000, // primary 与 fallback 共享的等待预算
  minScore: 0.8,
  minMargin: 0.1,
  heal: true,      // false 等同于 SELF_HEALING=off
});
const input = await healing.findElement(page, 'account.username');
await input.fill('example');
```

运行后处理建议：

```bash
npm run healing:apply                 # dry run，读取 reports/self-healing.json
npm run healing:apply -- --write      # 更新 locators/*.json，然后审查 git diff
npm run healing:apply -- reports/healing/self-healing.json   # test:healing 的汇总
```

CI 中，汇总文件在 `reports` 制品里（GitHub 的 `playwright-report`，Azure DevOps 的 `reports-<attempt>`）。下载到本地 `reports/` 后运行上面的命令即可。

## 验证

```bash
npm run typecheck
npm run lint
npm run test:healing
# 或只运行 Chrome：
npm run test:healing -- --project=chrome
npx playwright show-report playwright-report/healing
```

独立配置 [`playwright.healing.config.ts`](../playwright.healing.config.ts) 在已安装的 Chrome 和 Edge 中运行本地 `page.setContent()` 场景，不需要 `.env`、登录或外部站点。常规 `npm test` 的 UI 项目也会包含这些测试。

覆盖的场景：主定位器、按序 fallback、慢渲染的 primary、`heal: false`、`fail` 模式、id 与文字改变、近似文本、随机 id、候选歧义与分差、低分、隐藏元素、禁用与遮挡、语法错误、多匹配、行级范围、特殊字符转义、目录加载与缓存、非法定义、建议合并与冲突。

边界：这不是全局 monkey patch，只对显式调用 helper 的操作生效。DOM 扫描是等待预算结束后的一次快照。当前不跨 iframe 搜索，也不为没有稳定属性的元素生成位置选择器。role 推断只覆盖显式 `role`、button 和带 `href` 的链接，其他元素退回属性选择器。恢复本身不能证明业务行为正确，现有断言仍应保留。
