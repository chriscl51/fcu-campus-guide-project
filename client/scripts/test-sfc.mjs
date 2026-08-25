import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import fs from 'node:fs'

const sfcSource = fs.readFileSync('./src/App.vue', 'utf-8')
const parsed = parse(sfcSource)
console.log('Descriptor parsed successfully!')
if (parsed.descriptor.scriptSetup) {
  const script = compileScript(parsed.descriptor, { id: 'app' })
  console.log('Script setup compiled! Length:', script.content.length)
}
if (parsed.descriptor.template) {
  const template = compileTemplate({
    id: 'app',
    source: parsed.descriptor.template.content,
    filename: 'App.vue',
  })
  console.log('Template compiled! Length:', template.code.length)
}
