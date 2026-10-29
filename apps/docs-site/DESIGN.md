---
brand: dTax Developer Hub (dtax.dev)
theme: system
---

dTax 开发者文档站的设计规范。基于 Astro Starlight,所有取值来自 `src/styles/custom.css` 和 `src/components/Footer.astro`,改样式先改这两处再回来更新本文件。这里只覆盖文档站,不覆盖产品网页 `apps/web`。

## Color Tokens

颜色只通过 Starlight 的 `--sl-color-*` 变量使用,不在组件里写死十六进制。Starlight 的约定:`--sl-color-white` 是最强的文字色,`--sl-color-black` 是基础表面色(卡片、搜索框、顶部搜索按钮)。浅色主题里两者要反过来,即白色表面加深色文字,二者设成同色会让字看不见。

| 语义           | 变量                     | 深色主题                | 浅色主题  |
| -------------- | ------------------------ | ----------------------- | --------- |
| 主色           | `--sl-color-accent`      | `#818cf8`               | `#4f46e5` |
| 主色浅底       | `--sl-color-accent-low`  | `#2d2060`               | `#eef2ff` |
| 主色强调字     | `--sl-color-accent-high` | `#c7d2fe`               | `#4338ca` |
| 最强文字       | `--sl-color-white`       | `#ffffff`               | `#0f172a` |
| 基础表面       | `--sl-color-black`       | `#030712`               | `#ffffff` |
| 页面背景       | `--sl-color-bg`          | `#0a0e1a`               | `#f8fafc` |
| 顶栏背景       | `--sl-color-bg-nav`      | `#0d1120`               | `#ffffff` |
| 侧栏背景       | `--sl-color-bg-sidebar`  | `#0d1120`               | `#f1f5f9` |
| 分隔线         | `--sl-color-hairline`    | `rgba(99,102,241,0.15)` | `#e2e8f0` |
| 灰一(正文)     | `--sl-color-gray-1`      | `#e2e8f0`               | `#0f172a` |
| 灰二(次要文字) | `--sl-color-gray-2`      | `#94a3b8`               | `#475569` |
| 灰三(弱化文字) | `--sl-color-gray-3`      | `#475569`               | `#64748b` |
| 灰四           | `--sl-color-gray-4`      | `#1e293b`               | `#cbd5e1` |
| 灰五           | `--sl-color-gray-5`      | `#0f172a`               | `#e2e8f0` |
| 灰六           | `--sl-color-gray-6`      | `#070c18`               | `#f8fafc` |

品牌色的半透明变体(两种主题共用,基色是 `rgb(99,102,241)`):

- 侧栏当前页背景:`rgba(99,102,241,0.12)`
- 表头背景:`rgba(99,102,241,0.08)`
- 行内代码背景:`rgba(99,102,241,0.1)`
- 卡片悬停光晕:`0 0 24px rgba(99,102,241,0.15)`

规则:

- 浅色主题的弱化文字不得比 `--sl-color-gray-3`(`#64748b`)更浅,对 `#f8fafc` 要保持 4.5:1 以上。
- 浅色主题里主色文字用 `#4f46e5`,不用 `#6366f1`,后者在白底上只有 4.47:1。

## Typography

- 正文:`--sl-font` = Inter,备选系统无衬线字体。
- 代码:`--sl-font-mono` = JetBrains Mono,备选 Fira Code。
- 字体通过 `custom.css` 第一行的 Google Fonts 引入,Inter 字重 300 到 800,JetBrains Mono 字重 400、500。
- 渲染:`-webkit-font-smoothing: antialiased`。

层级:
| 位置 | 字号 | 字重 | 其他 |
|---|---|---|---|
| 首页大标题 `.hero h1` | `clamp(2rem, 5vw, 3.5rem)` | 800 | 字距 `-0.03em`,行高 1.1 |
| 首页副标题 `.hero .tagline` | `1.15rem` | 默认 | 最大宽度 `42ch`,颜色灰二 |
| 站点标题 `.site-title` | `1.1rem` | 700 | 字距 `-0.02em` |
| 正文 h1、h2、h3 | Starlight 默认 | 700 | 字距 `-0.02em` |
| 表格 | `0.9rem` | 表头 600 | |
| 代码块 | `0.85rem` | | 行高 1.65 |
| 行内代码 | `0.88em` | | |
| 页脚品牌 | `1.25rem` | 800 | 字距 `-0.03em` |
| 页脚分组标题 | `0.75rem` | 600 | 大写,字距 `0.08em` |
| 页脚说明 | `0.8rem` | | |

规则:

- 正文字号不低于 14px,辅助文字不低于 12px。
- 代码相关元素的字体用 `!important` 强制为等宽字体,不要改动这条。

## Spacing System

基础单位 4px(`0.25rem`),常用步长全部是它的倍数。

- 首页 hero 上下内边距:`4rem`。
- 首页按钮内边距:`0.6rem 1.4rem`。
- 表头内边距 `0.5rem 0.75rem`,表格单元格 `0.45rem 0.75rem`。
- h2 下边距的内边距:`0.4rem`。
- 行内代码内边距:`0.1em 0.35em`。
- 页脚:内容区最大宽度 `1200px`,居中;分组间距 `3rem`,链接组内间距 `2.5rem`,链接纵向间距 `0.6rem`,品牌区纵向间距 `0.4rem`。

## Border Radius

| 元素                     | 圆角   |
| ------------------------ | ------ |
| 卡片 `.card`             | `10px` |
| 代码块 `pre`             | `10px` |
| 首页按钮 `.hero .action` | `8px`  |
| 侧栏当前页高亮           | `6px`  |
| 行内代码                 | `4px`  |

同类元素圆角必须一致,新增组件从上表里选一个,不要引入新的圆角值。

## Components

均使用 Starlight 自带组件,只用 `custom.css` 做样式覆盖。

**卡片(首页 `CardGrid` + `Card`)**

- `border: 1px solid var(--sl-color-hairline)`,圆角 10px。
- 悬停:边框变为 `--sl-color-accent`,加主色光晕阴影,过渡 `border-color 0.2s, box-shadow 0.2s`。
- 图标用 Starlight 内置名,例如 `seti:npm`、`document`、`puzzle`、`open-book`。

**按钮(首页 hero 的 `actions`)**

- 圆角 8px,字重 600,字号 `0.95rem`,内边距 `0.6rem 1.4rem`。
- 悬停:透明度 0.9,向上位移 1px,过渡 `opacity 0.15s, transform 0.15s`。
- 主按钮用 `variant: primary`,次按钮用 `variant: minimal`。

**顶栏**:底部分隔线用 `--sl-color-hairline`,背景模糊 `blur(12px)`。

**侧栏**:右侧分隔线 `1px solid var(--sl-color-hairline)`。当前页项:背景 `rgba(99,102,241,0.12)`,文字 `--sl-color-accent-high`,字重 600,圆角 6px。

**表格**:收起边框,宽度 100%,表头有主色浅底和 `2px` 底线,单元格底部 `1px` 分隔线。

**代码块与行内代码**:代码块有 1px 分隔线边框和 10px 圆角。行内代码用主色浅底,文字 `--sl-color-accent-high`。

**页脚**:自定义组件 `src/components/Footer.astro`,品牌文字用主色到强调字色的渐变。

**搜索**:使用 Starlight 自带的 Pagefind。搜索框、弹窗和顶部搜索按钮的底色来自 `--sl-color-black`,所以修改该变量要同时核对这三处。

**品牌渐变文字**:首页大标题和页脚品牌使用渐变文字,属于既定的品牌风格。深色主题 `#ffffff` 到 `#c7d2fe`,浅色主题 `#1e1b4b` 到 `#4f46e5`。除这两处外,不要新增渐变文字。

## Icons

- 站点内图标:使用 Starlight 内置图标集,通过组件的 `icon` 属性引用。
- 社交链接:Starlight `social` 配置的 `github` 图标。
- 不使用 emoji 当图标,不混用第二套图标库。
- 站点标志:`src/assets/logo.png`(顶栏),`logo-light.svg` 和 `logo-dark.svg` 备用。
- 首页插图:`src/assets/hero.png`,必须是透明底 PNG,不能带不透明的浅灰底色。

## Pre-Delivery Checklist

改动文档站样式或组件,提交前逐项核对:

- [ ] 颜色只用 `--sl-color-*` 变量,没有写死十六进制。
- [ ] 浅色和深色两种主题都看过,首页卡片、搜索框、搜索弹窗、侧栏当前页的文字清晰可读。
- [ ] 改了 `--sl-color-black` 或 `--sl-color-white` 时,浅色主题里仍是白色表面加深色文字。
- [ ] 浅色主题的文字对比度不低于 4.5:1(次要文字、主色文字、按钮上的文字都要查)。
- [ ] 新增的圆角取自上面圆角表,间距是 4px 的倍数。
- [ ] 没有新增渐变文字,没有 emoji 图标。
- [ ] 新图片使用透明底,不带不透明底色。
- [ ] 用 `npx impeccable detect https://dtax.dev` 扫线上页面,对比度类问题为 0。该检测器在检查源码时不运行对比度规则,必须扫页面。
- [ ] 手机宽度(375px)下没有横向滚动。
- [ ] `npm run build` 通过。
- [ ] 本站有 7 种语言(英文、简体中文、日文、韩文、德文、法文、西班牙文),新增的界面文字要确认非英文页面的显示。页脚目前只有英文,是已知缺口。
