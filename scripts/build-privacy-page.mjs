import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Generate a standalone page from the policy; no runtime scripts or external assets.
const source = await readFile(new URL('../docs/publishing/PRIVACY_POLICY.md', import.meta.url), 'utf8');
const email = (process.env.PRIVACY_CONTACT_EMAIL ?? '').trim();
if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
  throw new Error('请设置真实公开联系邮箱 PRIVACY_CONTACT_EMAIL 后重新生成隐私政策网页。');
}
const policy = source.replaceAll('[CONTACT_EMAIL]', email);
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const inline = (value) => escape(value).replace(/`([^`]+)`/g, '<code>$1</code>');
const body = policy.trim().split(/\n\s*\n/).map((block) => {
  const heading = /^(#{1,3}) (.+)$/.exec(block);
  if (heading) {
    const level = heading[1].length;
    const id = heading[2] === '中文' ? 'zh' : heading[2] === 'English' ? 'en' : '';
    return `<h${level}${id ? ` id="${id}"` : ''}>${inline(heading[2])}</h${level}>`;
  }
  if (block.split('\n').every((line) => line.startsWith('- '))) {
    return `<ul>${block.split('\n').map((line) => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
  }
  return `<p>${inline(block)}</p>`;
}).join('\n');
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="流译助手 Flow Translate 隐私政策：翻译数据处理、第三方服务、本地存储和删除方式。">
  <title>流译助手 · Privacy Policy / 隐私政策</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.8; }
    body { max-width: 860px; margin: auto; padding: 32px 20px 64px; overflow-wrap: anywhere; }
    h1 { font-size: 1.8rem; line-height: 1.4; } h2 { margin-top: 2.5rem; }
    h3 { margin-top: 1.8rem; } li { margin: .5rem 0; }
    a { color: #7659de; } code { font-size: .95em; }
    nav { display: flex; gap: 24px; } @media print { nav { display: none; } }
  </style>
</head>
<body><nav aria-label="Language / 语言"><a href="#zh">中文</a><a href="#en" lang="en">English</a></nav>
<main>${body}</main>
</body>
</html>
`;
const directory = new URL('../.output/privacy-site/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('index.html', directory), html);
console.log('已生成 .output/privacy-site/index.html。请公开托管该目录，并将 HTTPS 地址填入商店隐私权政策字段。');
