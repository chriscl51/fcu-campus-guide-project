import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 5173

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

const VENDOR_MODULES = {
  vue: path.join(__dirname, 'node_modules', 'vue', 'dist', 'vue.esm-browser.js'),
  'vue-router': path.join(__dirname, 'node_modules', 'vue-router', 'dist', 'vue-router.esm-browser.prod.js'),
  pinia: path.join(__dirname, 'node_modules', 'pinia', 'dist', 'pinia.esm-browser.prod.js'),
  'vue-i18n': path.join(__dirname, 'node_modules', 'vue-i18n', 'dist', 'vue-i18n.esm-browser.prod.js'),
}

function resolveImportsInCode(code, sourceFilePath) {
  const fileDir = path.dirname(sourceFilePath)
  return code.replace(
    /(^\s*(?:import|export)\b[\s\S]*?from\s*['"])([^'"]+)(['"])|(^\s*import\s*['"])([^'"]+)(['"])|(\bimport\s*\(\s*['"])([^'"]+)(['"]\s*\))/gm,
    (m, p1, s1, p2, p3, s2, p4, p5, s3, p6) => {
      const prefix = p1 || p3 || p5
      const specifier = s1 || s2 || s3
      const suffix = p2 || p4 || p6

      if (!specifier) return m

      // Bare imports
      if (['vue', 'vue-router', 'pinia', 'vue-i18n', 'html2canvas'].includes(specifier)) {
        return `${prefix}/@modules/${specifier}${suffix}`
      }
      // Relative path imports
      if (specifier.startsWith('.')) {
        let target = path.resolve(fileDir, specifier)
        if (fs.existsSync(target)) {
          if (fs.statSync(target).isDirectory()) {
            if (fs.existsSync(path.join(target, 'index.js'))) target = path.join(target, 'index.js')
            else if (fs.existsSync(path.join(target, 'index.vue'))) target = path.join(target, 'index.vue')
          }
        } else if (fs.existsSync(target + '.js')) {
          target = target + '.js'
        } else if (fs.existsSync(target + '.vue')) {
          target = target + '.vue'
        } else if (fs.existsSync(target + '.json')) {
          target = target + '.json'
        }
        const webPath = '/' + path.relative(__dirname, target).replace(/\\/g, '/')
        return `${prefix}${webPath}${suffix}`
      }
      return m
    }
  )
}

function compileVueFile(filePath, query) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const filename = path.basename(filePath)
  const id = 'v-' + Math.abs(filePath.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)).toString(16)
  const parsed = parse(content, { filename })
  const descriptor = parsed.descriptor

  if (query.get('type') === 'style') {
    const styleIndex = parseInt(query.get('index') || '0', 10)
    const style = descriptor.styles[styleIndex]
    if (!style) {
      return 'export default ""'
    }
    const compiled = compileStyle({
      id: `data-v-${id}`,
      source: style.content,
      filename,
      scoped: style.scoped,
    })
    const css = compiled.code
    return `
const css = ${JSON.stringify(css)};
const styleEl = document.createElement('style');
styleEl.setAttribute('type', 'text/css');
styleEl.setAttribute('data-sfc-id', '${id}-${styleIndex}');
styleEl.textContent = css;
document.head.appendChild(styleEl);
export default css;
`
  }

  const hasScoped = descriptor.styles.some((s) => s.scoped)
  let scriptCode = ''

  if (descriptor.scriptSetup) {
    const compiledScript = compileScript(descriptor, {
      id,
      inlineTemplate: true,
      templateOptions: {
        scoped: hasScoped,
        compilerOptions: {
          scopeId: hasScoped ? `data-v-${id}` : null,
        },
      },
    })
    scriptCode = resolveImportsInCode(compiledScript.content, filePath)
    if (hasScoped) {
      scriptCode = scriptCode.replace(/export\s+default\s+/, 'const _sfc_main = ')
      scriptCode += `\n_sfc_main.__scopeId = 'data-v-${id}'\nexport default _sfc_main`
    }
  } else if (descriptor.script) {
    const compiledScript = compileScript(descriptor, {
      id,
      inlineTemplate: false,
    })
    scriptCode = resolveImportsInCode(compiledScript.content, filePath)
    if (descriptor.template) {
      const compiledTemplate = compileTemplate({
        id,
        source: descriptor.template.content,
        filename,
        scoped: hasScoped,
        compilerOptions: {
          bindingMetadata: compiledScript.bindings,
          scopeId: hasScoped ? `data-v-${id}` : null,
        },
      })
      const templateCode = resolveImportsInCode(compiledTemplate.code, filePath)
      scriptCode = scriptCode.replace(/export\s+default\s+/, 'const _sfc_main = ')
      scriptCode += `\n${templateCode}\n_sfc_main.render = render`
      if (hasScoped) {
        scriptCode += `\n_sfc_main.__scopeId = 'data-v-${id}'`
      }
      scriptCode += `\nexport default _sfc_main`
    }
  } else if (descriptor.template) {
    const compiledTemplate = compileTemplate({
      id,
      source: descriptor.template.content,
      filename,
      scoped: hasScoped,
      compilerOptions: {
        scopeId: hasScoped ? `data-v-${id}` : null,
      },
    })
    const templateCode = resolveImportsInCode(compiledTemplate.code, filePath)
    scriptCode = `${templateCode}\nconst _sfc_main = { render }`
    if (hasScoped) {
      scriptCode += `\n_sfc_main.__scopeId = 'data-v-${id}'`
    }
    scriptCode += `\nexport default _sfc_main`
  } else {
    scriptCode = 'export default {}'
  }

  const relPath = '/' + path.relative(__dirname, filePath).replace(/\\/g, '/')
  const styleImports = descriptor.styles
    .map((_, i) => `import '${relPath}?type=style&index=${i}'`)
    .join('\n')

  let output = `
${styleImports}
${scriptCode}
`

  output = output
    .replace(/import\.meta\.env\.BASE_URL/g, '"/"')
    .replace(/import\.meta\.env\.VITE_API_BASE/g, '"http://localhost:3001"')
    .replace(/import\.meta\.env\.VITE_ADMIN_PATH/g, '"/admin"')
    .replace(/process\.env\.NODE_ENV/g, '"development"')

  return output
}

const server = http.createServer((req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`)
    let pathname = decodeURIComponent(urlObj.pathname)

    // Handle @modules
    if (pathname.startsWith('/@modules/')) {
      const pkg = pathname.slice('/@modules/'.length)
      if (pkg === 'html2canvas') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
        return res.end(`
const html2canvas = window.html2canvas || (async (el, opts) => {
  if (window.html2canvas) return window.html2canvas(el, opts);
  throw new Error("html2canvas not loaded");
});
export default html2canvas;
`)
      }

      if (VENDOR_MODULES[pkg] && fs.existsSync(VENDOR_MODULES[pkg])) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
        let code = fs.readFileSync(VENDOR_MODULES[pkg], 'utf-8')
        code = resolveImportsInCode(code, VENDOR_MODULES[pkg])
        code = code
          .replace(/process\.env\.NODE_ENV/g, '"development"')
          .replace(/__VUE_PROD_DEVTOOLS__/g, 'false')
          .replace(/__VUE_OPTIONS_API__/g, 'true')
        return res.end(code)
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end(`Vendor module ${pkg} not found`)
    }

    // Resolve file path with extensions and directory index
    let filePath = path.join(__dirname, pathname)

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      // direct file match
    } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory() && fs.existsSync(path.join(filePath, 'index.js'))) {
      filePath = path.join(filePath, 'index.js')
    } else if (fs.existsSync(filePath + '.js')) {
      filePath = filePath + '.js'
    } else if (fs.existsSync(filePath + '.vue')) {
      filePath = filePath + '.vue'
    } else if (fs.existsSync(filePath + '.json')) {
      filePath = filePath + '.json'
    } else if (fs.existsSync(path.join(__dirname, 'public', pathname)) && fs.statSync(path.join(__dirname, 'public', pathname)).isFile()) {
      filePath = path.join(__dirname, 'public', pathname)
    } else if (pathname === '/' || pathname === '/admin' || !path.extname(pathname)) {
      filePath = path.join(__dirname, 'index.html')
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end(`File not found: ${pathname}`)
    }

    const ext = path.extname(filePath)

    if (ext === '.vue') {
      const jsOrCss = compileVueFile(filePath, urlObj.searchParams)
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      return res.end(jsOrCss)
    }

    if (ext === '.css') {
      const isDirectCss = req.headers['sec-fetch-dest'] === 'style' || req.headers.accept?.includes('text/css')
      const cssContent = fs.readFileSync(filePath, 'utf-8')
      if (isDirectCss) {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' })
        return res.end(cssContent)
      }
      // JS module import of CSS
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      const jsWrapper = `
const css = ${JSON.stringify(cssContent)};
const styleEl = document.createElement('style');
styleEl.setAttribute('type', 'text/css');
styleEl.textContent = css;
document.head.appendChild(styleEl);
export default css;
`
      return res.end(jsWrapper)
    }

    if (ext === '.json') {
      const isJsonFetch = req.headers.accept?.includes('application/json') && req.headers['sec-fetch-dest'] !== 'script'
      const jsonContent = fs.readFileSync(filePath, 'utf-8')
      if (isJsonFetch) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        return res.end(jsonContent)
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      return res.end(`export default ${jsonContent}`)
    }

    if (ext === '.js' || ext === '.mjs') {
      let jsCode = fs.readFileSync(filePath, 'utf-8')
      jsCode = resolveImportsInCode(jsCode, filePath)
      jsCode = jsCode
        .replace(/import\.meta\.env\.BASE_URL/g, '"/"')
        .replace(/import\.meta\.env\.VITE_API_BASE/g, '"http://localhost:3001"')
        .replace(/import\.meta\.env\.VITE_ADMIN_PATH/g, '"/admin"')
        .replace(/process\.env\.NODE_ENV/g, '"development"')
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      return res.end(jsCode)
    }

    if (ext === '.html') {
      let html = fs.readFileSync(filePath, 'utf-8')
      html = html.replace(
        '</head>',
        `<script>
window.process = { env: { NODE_ENV: 'development' } };
</script>
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<link rel="stylesheet" href="/src/style.css">
</head>`
      )
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(html)
    }

    const mime = MIME_TYPES[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    const stream = fs.createReadStream(filePath)
    stream.on('error', (err) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Stream error')
    })
    stream.pipe(res)
  } catch (err) {
    console.error('Server error:', err)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(err.stack || String(err))
  }
})

server.listen(PORT, () => {
  console.log(`FCU Campus Guide Frontend running at http://localhost:${PORT}`)
})
