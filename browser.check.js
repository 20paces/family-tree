// Opens the practice tree in headless Chrome and checks the desktop chart,
// the phone layout, details for both parents, and the document lightbox.
// Run from the repository root: node browser.check.js
// Screenshots are written to the paths passed as DESKTOP_PNG and MOBILE_PNG,
// or to /tmp/family-tree-desktop.png and /tmp/family-tree-mobile.png.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = 8765;
const DESKTOP = process.env.DESKTOP_PNG || '/tmp/family-tree-desktop.png';
const MOBILE = process.env.MOBILE_PNG || '/tmp/family-tree-mobile.png';
const DOCS_DESKTOP = process.env.DOCS_DESKTOP_PNG || '/tmp/family-tree-docs-desktop.png';
const DOCS_MOBILE = process.env.DOCS_MOBILE_PNG || '/tmp/family-tree-docs-mobile.png';
const URL = 'http://127.0.0.1:' + PORT + '/';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function startServer() {
  const child = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT, stdio: 'ignore'
  });
  return child;
}

async function startChrome() {
  const userDir = fs.mkdtempSync('/tmp/ft-chrome-');
  const child = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=9333',
    '--user-data-dir=' + userDir,
    '--window-size=1900,1680',
    'about:blank'
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9333/json/version');
      if (res.ok) return child;
    } catch (err) { /* chrome still starting */ }
    await wait(150);
  }
  throw new Error('Chrome did not open a debugging port');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  const waits = [];
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    } else {
      waits.slice().forEach(w => {
        if (w.method === msg.method) {
          w.resolve(msg.params);
          waits.splice(waits.indexOf(w), 1);
        }
      });
    }
  });
  return {
    ws,
    opened: new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', () => reject(new Error('devtools socket failed')));
    }),
    send(method, params) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    },
    until(method) {
      return new Promise(resolve => waits.push({ method, resolve }));
    }
  };
}

async function pageSocket() {
  const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('No Chrome page');
  return page.webSocketDebuggerUrl;
}

async function evalJson(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text + ' ' + (result.exceptionDetails.exception && result.exceptionDetails.exception.description || ''));
  }
  return result.result.value;
}

async function shot(client, file) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

async function main() {
  const server = startServer();
  const chrome = await startChrome();
  try {
    await wait(200);
    const client = cdp(await pageSocket());
    await client.opened;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    const loaded = client.until('Page.loadEventFired');
    await client.send('Page.navigate', { url: URL });
    await loaded;
    await wait(400);

    const desktop = await evalJson(client, `(() => {
      const cards = [...document.querySelectorAll('#world .p')];
      const ids = cards.map(el => el.dataset.id);
      const labels = [...document.querySelectorAll('.treelabel')].map(el => el.textContent);
      const jumps = [...document.querySelectorAll('#jumps button')].map(el => el.textContent);
      const stackDisplay = getComputedStyle(document.getElementById('stack')).display;
      return {
        count: cards.length,
        unique: new Set(ids).size,
        labels,
        jumps,
        stackDisplay,
        names: cards.map(el => el.innerText)
      };
    })()`);
    if (desktop.count !== 32 || desktop.unique !== 32) {
      throw new Error('Desktop chart should show each of 32 people once, got ' + desktop.count);
    }
    ['Ashworth · paternal', 'Hale · maternal', 'Doyle · maternal', 'Pryce · partner', 'Iyer · partner', 'Chen · partner']
      .forEach(label => {
        if (!desktop.labels.includes(label) || !desktop.jumps.includes(label)) {
          throw new Error('Missing branch label ' + label);
        }
      });
    if (desktop.stackDisplay !== 'none') throw new Error('Phone stack should be hidden on a wide screen');
    const joined = desktop.names.join('\n').toLowerCase();
    ['edith ashworth', 'margaret ashworth', 'priya ashworth', 'mei pryce', 'albert hale', 'patrick doyle', 'owen pryce', 'arun iyer', 'wei chen', 'sample']
      .forEach(bit => {
        if (!joined.includes(bit)) throw new Error('Desktop chart missing ' + bit);
      });

    const focused = await evalJson(client, `(() => {
      const el = document.querySelector('#world .p[data-id="3"]');
      el.focus();
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const pop = document.getElementById('pop');
      const box = pop.getBoundingClientRect();
      return {
        hidden: pop.hidden,
        active: document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id,
        src: document.getElementById('popimg').getAttribute('src'),
        cap: document.getElementById('popcap').textContent,
        left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        vw: window.innerWidth, vh: window.innerHeight,
        pe: getComputedStyle(pop).pointerEvents
      };
    })()`);
    if (focused.hidden) throw new Error('Focus should show the portrait popover ' + JSON.stringify(focused));
    if (!String(focused.src).includes('portraits/3.svg')) throw new Error('Focus portrait src ' + focused.src);
    if (!/example portrait/i.test(focused.cap) || !/not a real person/i.test(focused.cap)) {
      throw new Error('Popover caption ' + focused.cap);
    }
    if (focused.left < 0 || focused.top < 0 || focused.right > focused.vw || focused.bottom > focused.vh) {
      throw new Error('Popover outside viewport ' + JSON.stringify(focused));
    }
    if (focused.pe !== 'none') throw new Error('Popover should not block the chart');
    await evalJson(client, `document.querySelector('#world .p[data-id="3"]').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))`);
    await wait(40);
    const blurred = await evalJson(client, `document.getElementById('pop').hidden`);
    if (!blurred) throw new Error('Blur should hide the portrait popover');
    await evalJson(client, `document.querySelector('#world .p[data-id="3"]').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }))`);
    await wait(40);
    const touched = await evalJson(client, `document.getElementById('pop').hidden`);
    if (!touched) throw new Error('Touch should not leave a hover popover; the portrait belongs in the details');
    await evalJson(client, `(() => {
      const vp = document.getElementById('viewport');
      const el = document.querySelector('#world .p[data-id="3"]');
      const center = () => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      for (let i = 0; i < 4; i++) {
        const c = center();
        vp.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -140, clientX: c.x, clientY: c.y }));
      }
      return true;
    })()`);
    await wait(80);
    await evalJson(client, `document.querySelector('#world .p[data-id="3"]').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))`);
    await wait(80);
    const hovered = await evalJson(client, `document.getElementById('pop').hidden === false && document.getElementById('popimg').getAttribute('src').includes('portraits/3.svg')`);
    if (!hovered) throw new Error('Mouse hover should show Harold’s example portrait');

    await shot(client, DESKTOP);

    await evalJson(client, `document.getElementById('zfit').click()`);
    await wait(200);
    await evalJson(client, `document.querySelector('#world .p[data-id="1"]').click()`);
    await wait(200);
    const walterDocs = await evalJson(client, `(() => {
      const panel = document.getElementById('d');
      const pr = panel.getBoundingClientRect();
      const links = [...document.querySelectorAll('#dc .docblock a')].map(a => {
        const r = a.getBoundingClientRect();
        return {
          text: a.textContent.replace(/\\s+/g, ' ').trim(),
          href: a.getAttribute('href'),
          doc: a.getAttribute('data-doc'),
          target: a.getAttribute('target'),
          top: r.top, bottom: r.bottom, height: r.height,
          visible: r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1 && r.height > 20
        };
      });
      return { links, panelTop: pr.top, panelBottom: pr.bottom, scroll: panel.scrollTop };
    })()`);
    const want = ['Birth certificate', 'Marriage certificate', 'Will (PDF)'];
    want.forEach(title => {
      const link = walterDocs.links.find(l => l.text.includes(title));
      if (!link) throw new Error('Walter details missing visible link ' + title + ' ' + JSON.stringify(walterDocs));
      if (!link.visible) throw new Error(title + ' is in the panel markup but not on screen ' + JSON.stringify(link));
    });
    if (walterDocs.scroll !== 0) throw new Error('Documents should be visible without scrolling the panel');
    const will = walterDocs.links.find(l => l.href === 'docs/will-walter-1990.pdf');
    if (!will || will.target !== '_blank') throw new Error('Walter will should be a new-tab PDF link');

    await shot(client, DOCS_DESKTOP);

    await evalJson(client, `document.querySelector('#dc .docblock a[data-doc="1:0"]').click()`);
    await wait(250);
    const light = await evalJson(client, `({
      display: getComputedStyle(document.getElementById('lb')).display,
      src: document.getElementById('lbi').getAttribute('src')
    })`);
    if (light.display !== 'flex') throw new Error('Clicking Walter’s birth certificate did not open the lightbox');
    if (!String(light.src).includes('birth-walter-1921.svg')) throw new Error('Lightbox src ' + light.src);

    await evalJson(client, `document.getElementById('lb').style.display='none'; document.getElementById('close').click();`);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true
    });
    await evalJson(client, `window.dispatchEvent(new Event('resize'))`);
    await wait(250);
    const phone = await evalJson(client, `(() => {
      const stack = document.getElementById('stack');
      const cards = [...stack.querySelectorAll('.p')];
      const text = stack.innerText;
      return {
        stack: getComputedStyle(stack).display,
        canvas: getComputedStyle(document.getElementById('viewport')).display,
        count: cards.length,
        unique: new Set(cards.map(el => el.dataset.id)).size,
        text
      };
    })()`);
    if (phone.stack === 'none' || phone.canvas !== 'none') {
      throw new Error('Phone layout did not switch. stack=' + phone.stack + ' canvas=' + phone.canvas);
    }
    if (phone.count !== 32 || phone.unique !== 32) throw new Error('Phone omitted people: ' + phone.count);
    const phoneText = phone.text.toLowerCase();
    ['hale · maternal', 'doyle · maternal', 'pryce · partner', 'iyer · partner', 'chen · partner', 'married to walter ashworth', 'sample']
      .forEach(bit => { if (!phoneText.includes(bit)) throw new Error('Phone page missing ' + bit); });

    await evalJson(client, `document.querySelector('#stack .p[data-id="1"]').click()`);
    await wait(200);
    const phoneDocs = await evalJson(client, `(() => {
      const panel = document.getElementById('d');
      const pr = panel.getBoundingClientRect();
      const links = [...document.querySelectorAll('#dc .docblock a')].map(a => {
        const r = a.getBoundingClientRect();
        return {
          text: a.textContent.replace(/\\s+/g, ' ').trim(),
          visible: r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1 && r.height > 20,
          bottom: r.bottom, panelBottom: pr.bottom
        };
      });
      return { links, scroll: panel.scrollTop, text: document.getElementById('dc').innerText.toLowerCase() };
    })()`);
    ['birth certificate', 'marriage certificate', 'will (pdf)', 'example portrait', 'father', 'edith ashworth'].forEach(bit => {
      if (!phoneDocs.text.includes(bit)) throw new Error('Phone Walter details missing ' + bit);
    });
    if (phoneDocs.scroll !== 0) throw new Error('Phone panel was already scrolled');
    phoneDocs.links.forEach(link => {
      if (!link.visible) throw new Error('Phone document not on screen: ' + JSON.stringify(link));
    });
    await shot(client, DOCS_MOBILE);
    await evalJson(client, `document.querySelector('#dc .docblock a[data-doc="1:1"]').click()`);
    await wait(250);
    const phoneLight = await evalJson(client, `({
      display: getComputedStyle(document.getElementById('lb')).display,
      src: document.getElementById('lbi').getAttribute('src')
    })`);
    if (phoneLight.display !== 'flex' || !String(phoneLight.src).includes('marriage-walter-edith-1946.svg')) {
      throw new Error('Phone click did not open the marriage certificate ' + JSON.stringify(phoneLight));
    }
    console.log(JSON.stringify({ ok: true, desktop: DESKTOP, mobile: MOBILE, docsDesktop: DOCS_DESKTOP, docsMobile: DOCS_MOBILE }));
  } finally {
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
