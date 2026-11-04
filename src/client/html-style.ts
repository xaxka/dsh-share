/**
 * 独立 HTML 导出样式：逐条对照 DSH 0.2.0-rc.2 客户端源码，让离线文档与宿主界面观感一致。
 * 来源（全部取自运行时实际加载的官方样式）：
 * - dsh-client-ui-primitives/lib/markdown/MarkdownText.module.css（正文、标题、列表、引用、表格、行内代码）
 * - dsh-client-ui-primitives/lib/markdown/CodeBlock.module.css（代码块横幅与正文）
 * - dsh-client-ui-chat MessageItem.module.css（用户气泡 .Sixlwa_bubble、内容列 .EvIC1a_column）
 * - dsh-client-ui-chat ReasoningRow.module.css（思考块折叠行与正文）
 * - dsh-client-ui-theme 默认主题令牌（颜色、圆角、字号行高的真实数值）
 * 可缩放尺寸全部挂在 --dsh-content-font-size/--dsh-content-font-delta 上，镜像官方字号档位机制；
 * 主题快照（export-theme.ts）会在导出时用宿主实际值覆盖 :root 的浅色默认值。
 */
export const HTML_STYLE = `
:root{
color-scheme:light;
--dsw-font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Helvetica,Arial,sans-serif;
--ds-font-family-code:"SF Mono","JetBrains Mono","Fira Code",Consolas,"Liberation Mono",Menlo,Courier,"PingFang SC","Microsoft YaHei";
--dsw-alias-bg-base:#fff;
--dsw-alias-label-primary:#0f1115;
--dsw-alias-label-secondary:#61666b;
--dsw-alias-label-caption:#adb2b8;
--dsw-alias-label-tertiary:#adb2b8;
--dsw-alias-border-l1:#0000000a;
--dsw-alias-border-l2:#0000001a;
--dsw-alias-border-l3:#0000001f;
--dsw-alias-link:#4176e6;
--dsw-specific-bubble:#edf3fe;
--dsw-alias-markdown-inline-code:#fafafa;
--dsw-alias-markdown-code-block:#f9fafb;
--dsw-alias-markdown-code-block-banner:#f9fafb;
--dsw-radius-sm:8px;
--dsw-radius-md:12px;
--dsw-radius-lg:16px;
--dsw-radius-xl:20px;
--dsh-chat-content-width:clamp(680px,64vw,920px);
--dsh-content-font-size:14px;
--dsh-content-font-delta:0px;
--dsh-content-font-size-secondary:13px;
--dsh-content-font-delta-secondary:0px;
--dsh-code-font-size:11px;
--dsh-code-font-delta:0px;
--dsw-font-markdown-base:var(--dsh-content-font-size)/calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family);
--dsw-font-markdown-h1:700 calc(21px + var(--dsh-content-font-delta))/calc(30px + var(--dsh-content-font-delta)) var(--dsw-font-family);
--dsw-font-markdown-h2:700 calc(19px + var(--dsh-content-font-delta))/calc(28px + var(--dsh-content-font-delta)) var(--dsw-font-family);
--dsw-font-markdown-h3:700 calc(18px + var(--dsh-content-font-delta))/calc(26px + var(--dsh-content-font-delta)) var(--dsw-font-family);
--dsw-font-markdown-h4:600 var(--dsh-content-font-size)/calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family);
--dsw-font-markdown-base-strong:600 var(--dsh-content-font-size)/calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family);
--dsw-font-markdown-code:calc(12px + var(--dsh-code-font-delta))/calc(19px + var(--dsh-code-font-delta)) var(--ds-font-family-code);
--dsw-font-markdown-code-block:var(--dsh-code-font-size)/calc(19px + var(--dsh-code-font-delta)) var(--ds-font-family-code);
--dsw-font-markdown-table:var(--dsh-content-font-size-secondary)/calc(22px + var(--dsh-content-font-delta-secondary)) var(--dsw-font-family);
--dsw-font-markdown-table-head:500 var(--dsh-content-font-size-secondary)/calc(22px + var(--dsh-content-font-delta-secondary)) var(--dsw-font-family);
--dsh-scrollbar-width:5px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);min-width:0;overflow-wrap:anywhere;font:var(--dsw-font-markdown-base)}
main{max-width:var(--dsh-chat-content-width);margin:0 auto;padding:16px 24px 48px}
main>.notice{margin:24px 0}
.markdown{min-width:0;overflow-wrap:anywhere;font:var(--dsw-font-markdown-base);color:var(--dsw-alias-label-primary)}
.markdown strong{font-weight:600}
.markdown h1{font:var(--dsw-font-markdown-h1);margin:32px 0 16px}
.markdown h2{font:var(--dsw-font-markdown-h2);margin:32px 0 16px}
.markdown h3{font:var(--dsw-font-markdown-h3);margin:32px 0 16px}
.markdown h4{font:var(--dsw-font-markdown-h4);margin:16px 0}
.markdown :where(h5,h6){font:var(--dsw-font-markdown-base-strong);margin:16px 0}
.markdown :where(h1,h2,h3,h4,h5,h6) strong{font-weight:inherit}
.markdown p{margin:16px 0}
.markdown :where(h4,h5,h6)+:where(ul,ol){margin-top:8px}
.markdown :where(h4,h5,h6):has(+:where(ul,ol)){margin-bottom:8px}
.markdown a{color:var(--dsw-alias-link);font-weight:500;position:relative;text-decoration:none}
.markdown a:hover,.markdown a:focus{text-decoration:underline dotted var(--dsw-alias-link);text-underline-offset:3px}
.markdown :where(ul,ol){margin:16px 0;padding-left:18px}
.markdown li:not(:first-child){margin-top:6px}
.markdown li>:where(ul,ol){margin-top:4px}
.markdown li::marker{line-height:24px;color:var(--dsw-alias-label-secondary)}
.markdown :where(ul,ol) ol{list-style-position:inside;padding-left:0}
.markdown :where(ul,ol) ol li p{display:inline}
.markdown li>p{margin:8px 0}
.markdown li>*:first-child{margin-top:0}
.markdown hr{display:block;border:none;height:.5px;margin:32px 0;background:var(--dsw-alias-border-l2)}
.markdown blockquote{border-left:2px solid var(--dsw-alias-label-caption);margin:16px 0 0;padding-left:14px}
.markdown pre{margin:16px 0;font-family:var(--ds-font-family-code);overflow:auto}
.markdown :not(pre)>code{display:inline-flex;align-items:center;box-sizing:border-box;font:var(--dsw-font-markdown-code);font-family:var(--ds-font-family-code);font-size:.875em!important;background-color:var(--dsw-alias-markdown-inline-code);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);padding:0 5px}
.markdown :where(h1,h2,h3,h4,h5,h6) code{font:inherit;font-family:var(--ds-font-family-code)}
.markdown input[type=checkbox]{margin:0 8px 0 0;accent-color:var(--dsw-alias-label-secondary)}
/* 表格：官方 tableScroll/tableFill 语义（≤3 列铺满，多列按内容宽滚动）。 */
.table-scroll{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain}
.table-scroll.table-wide{overflow-x:hidden;padding-bottom:var(--dsh-scrollbar-width)}
.table-scroll.table-wide:hover,.table-scroll.table-wide:focus-visible{overflow-x:scroll;padding-bottom:0}
.table-scroll table{border-collapse:collapse;width:max-content;max-width:max-content}
.table-scroll.table-fill table{width:100%;max-width:none}
.table-scroll th{text-align:start;padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l3);font:var(--dsw-font-markdown-table-head);max-width:min(30vw,320px);min-width:100px}
.table-scroll td{text-align:start;padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2);font:var(--dsw-font-markdown-table);max-width:min(30vw,320px);min-width:100px}
.table-scroll th:first-child,.table-scroll td:first-child{padding-left:0}
.table-scroll td:last-child{padding-right:0}
.table-scroll table code{font-size:11px}
.markdown>:first-child,.markdown p:first-child{margin-top:0!important}
.markdown>:last-child,.markdown p:last-child{margin-bottom:0!important}
/* 会话流：用户气泡与助手座位，官方 MessageItem / ChatView 布局。
   座位间距镜像官方 --dsh-chat-flow-gap：提问之后 6px，回答（response）之后 12px。 */
section{margin:0;min-width:0}
section.user{margin-bottom:6px}
section.assistant{margin-bottom:12px}
.user{display:flex;justify-content:flex-end}
.user>.content{width:fit-content;max-width:min(calc(var(--dsh-chat-content-width)*.702),82%);padding:10px 16px;border-radius:var(--dsw-radius-xl);background:var(--dsw-specific-bubble);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}
.user>.content>:first-child{margin-top:0}
.user>.content>:last-child{margin-bottom:0}
.assistant>.content{min-width:0}
.content>div+div{margin-top:16px}
/* 代码块：官方 CodeBlock（.md-code-block 容器 + 横幅 + pre）。 */
.md-code-block,.code-block{--dsl-code-block-border-radius:var(--dsw-radius-lg);position:relative;margin:16px 0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-markdown-code-block);border-radius:var(--dsl-code-block-border-radius)}
.md-code-block:not(:last-child),.code-block:not(:last-child){margin-bottom:11px}
.code-banner{background:var(--dsw-alias-markdown-code-block-banner);padding:9px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px;font:11px/18px var(--dsw-font-family);border-top-left-radius:var(--dsl-code-block-border-radius);border-top-right-radius:var(--dsl-code-block-border-radius)}
.md-code-block pre,.code-block pre{font:var(--dsw-font-markdown-code-block);padding:16px;margin:0!important;overflow-x:auto;white-space:pre-wrap;word-break:break-all;background:var(--dsw-alias-markdown-code-block);border-bottom-left-radius:var(--dsl-code-block-border-radius);border-bottom-right-radius:var(--dsl-code-block-border-radius)}
.md-code-block pre code,.code-block pre code{font:inherit;background:none;padding:0}
/* 思考块：官方 ReasoningRow 展开正文（13px/20px 次级灰字，左缩进 22px）。 */
.reasoning{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));color:var(--dsw-alias-label-secondary);padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px))}
.reasoning :is(h1,h2,h3,h4,h5,h6){margin:8px 0 4px;font:inherit;font-weight:600;color:inherit}
.reasoning :is(p,ul,ol,blockquote){margin:4px 0}
.reasoning li:not(:first-child){margin-top:2px}
.reasoning li>p{margin:4px 0}
.reasoning :not(pre)>code{display:inline;font:inherit;font-family:var(--ds-font-family-code);font-size:1em!important;border-radius:var(--dsw-radius-sm);padding:0 3px}
.reasoning :is(pre,pre :is(code,span)){color:inherit!important}
.reasoning pre{margin:4px 0;padding:6px 10px}
/* 图片：官方 image 规则 + 表情与 GenUI 静态图。 */
img{display:block;width:auto;max-width:100%;height:auto;margin:0;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-base);object-fit:contain}
img.emoji{display:inline-block;height:1.5em;width:auto;vertical-align:middle;border-radius:0;background:none}
img.genui{display:block;margin:16px auto;border-radius:var(--dsw-radius-md)}
.notice{margin:16px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));font-style:italic}
/* 非人类触发器卡片：保留官方卡片轮廓（圆角、边框、代码块底色）。 */
.turn-trigger{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-markdown-code-block);margin:0 0 8px}
.trigger-header{display:flex;align-items:center;gap:8px;padding:10px 14px}
.trigger-title{font-weight:500}
.trigger-time{margin-left:auto;color:var(--dsw-alias-label-caption);font-size:12px}
.trigger-body{padding:0 14px 10px;color:var(--dsw-alias-label-secondary);font-size:.92em}
.trigger-explanation{padding:0 14px;color:var(--dsw-alias-label-secondary);font-size:.92em}
@media(max-width:680px){main{padding:16px 16px 32px}.user>.content{max-width:82%}}
@media print{main{max-width:none}pre{white-space:pre-wrap;overflow-wrap:anywhere}}
`
