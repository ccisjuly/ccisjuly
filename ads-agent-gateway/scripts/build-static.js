// 生成单文件在线预览版：dist/preview.html
// 把 src/ 里的网关逻辑打包进页面，并拦截前端对 /api/* 的请求，在浏览器内直接处理。
// 用法：node scripts/build-static.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const modules = { './store': 'src/store.js', './gateway': 'src/gateway.js', './api': 'src/api.js' };
const moduleCode = Object.entries(modules).map(([name, file]) => `
__defs[${JSON.stringify(name)}] = function (module, exports, require) {
${read(file)}
};`).join('\n');

const shim = `
window.STATIC_DEMO = true;
const __defs = {};
const __cache = {};
function __require(name) {
  if (!__cache[name]) {
    const module = { exports: {} };
    __defs[name](module, module.exports, __require);
    __cache[name] = module.exports;
  }
  return __cache[name];
}
${moduleCode}
(function () {
  const api = __require('./api');
  const app = api.createApp();
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts = {}) {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      let r;
      try {
        r = api.routeApi(app, opts.method || 'GET', url, opts.body ? JSON.parse(opts.body) : {});
      } catch (e) {
        r = { status: 400, body: { error: e.message } };
      }
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, opts);
  };
})();
`;

const safe = (code) => code.replace(/<\/script/gi, '<\\/script');
let html = read('public/index.html');
html = html.replace('<link rel="stylesheet" href="/style.css" />', () => `<style>\n${read('public/style.css')}\n</style>`);
html = html.replace('<script src="/app.js"></script>', () => `<script>\n${safe(shim)}\n</script>\n<script>\n${safe(read('public/app.js'))}\n</script>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/preview.html'), html);
console.log(`已生成 dist/preview.html（${(html.length / 1024).toFixed(0)} KB）`);
