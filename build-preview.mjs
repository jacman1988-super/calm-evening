import {readFile,writeFile} from 'node:fs/promises';
import {Script} from 'node:vm';
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
const [html,css,engine,client,ui]=await Promise.all(['preview.html','preview.css','constraints.mjs','agent-browser.js','preview.js'].map(read));
const script=`(() => {\n${engine.replace(/^export /gm,'')}\n${client.replace(/^export /gm,'')}\n${ui.replace(/^import .*?;\r?\n/gm,'')}\n})();`;
new Script(script);
await writeFile(new URL('browser-runtime.js',import.meta.url),script+'\n');
for(const id of [...(ui+client).matchAll(/\$\('([^']+)'\)/g)].map(match=>match[1])){
 if(!html.includes(`id="${id}"`))throw new Error(`Missing preview element: ${id}`);
}
const bundle=html.replace('<link rel="stylesheet" href="preview.css">',`<style>${css}</style>`)
 .replace('<script defer src="browser-runtime.js"></script>',()=>`<script>${script.replace(/<\/script/gi,'<\\/script')}</script>`);
await writeFile(new URL('../Calm-Evening-demo.html',import.meta.url),bundle);
console.log('Saved self-contained Calm-Evening-demo.html; JavaScript syntax and literal DOM targets checked. Visual rendering not checked.');
