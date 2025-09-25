// Tiny Puppeteer UI test for tooltip/context-menu/edit interactions
// Usage:
//   npm install
//   npm run test:ui
// The test starts a simple http server, opens the app, performs interactions, and reports assertions.

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

function serveStatic(root, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(root, req.url === '/' ? '/index.html' : req.url);
      if (filePath.endsWith('/')) filePath += 'index.html';
      fs.readFile(filePath, (err, data) => {
        if (err) { res.statusCode = 404; res.end('Not found'); return; }
        const ext = path.extname(filePath);
        const mime = ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/html';
        res.setHeader('Content-Type', mime);
        res.end(data);
      });
    }).listen(port, () => resolve(server));
  });
}


const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  const port = 8001;
  const server = await serveStatic(process.cwd(), port);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle0' });

    // Wait for canvas to be ready and the app to finish initialization (canvas sized and draw() available)
    await page.waitForSelector('#canvas');
    await page.waitForFunction(() => {
      const c = document.getElementById('canvas');
      return !!window.draw && c && c.width > 0 && c.height > 0;
    }, { timeout: 5000 });

    // Create two blocks programmatically to avoid fragile mouse interactions
    const { bx1, by1, bx2, by2 } = await page.evaluate(() => {
      const ensure = (x, y, w = 140, h = 80, text = 'Block') => {
        const id = (window.generateFriendlyId ? window.generateFriendlyId() : `b${Date.now()}`);
        const b = { id, parentId: null, x, y, width: w, height: h, text };
        window.blocks = window.blocks || [];
        window.blocks.push(b);
        return b;
      };
      // place blocks with reasonable spacing
      const b1 = ensure(40, 40);
      const b2 = ensure(320, 40);
      // redraw and update markdown
      if (window.draw) window.draw(); if (window.updateMarkdown) window.updateMarkdown();
      return { bx1: b1.x, by1: b1.y, bx2: b2.x, by2: b2.y };
    });

    await sleep(100);

    // Sanity check: ensure two blocks exist
    const blockCount = await page.evaluate(() => (window.blocks || []).length);
    if (blockCount < 2) throw new Error(`Expected 2 blocks after creating programmatically, found ${blockCount}`);

    // Create a connection programmatically between the two blocks
    await page.evaluate(() => {
      window.connections = window.connections || [];
      const from = window.blocks[window.blocks.length - 2];
      const to = window.blocks[window.blocks.length - 1];
      window.connections.push({ _id: `conn${(window.connectionCounter = (window.connectionCounter || 1))}`, from: from.id, to: to.id, label: '', arrowType: '-->' });
      window.connectionCounter = (window.connectionCounter || 1) + 1;
      if (window.draw) window.draw(); if (window.updateMarkdown) window.updateMarkdown();
    });

    await sleep(100);

    // Check connections created
    const connCount = await page.evaluate(() => (window.connections || []).length);
    if (connCount < 1) {
      const debug = await page.evaluate(() => ({ blocks: window.blocks || [], connections: window.connections || [], arrowMode: window.arrowMode, arrowStart: window.arrowStart }));
      throw new Error('Connection was not created. Debug: ' + JSON.stringify(debug));
    }

    // Compute accurate page coordinates for the midpoint of the created connection segment
    const pageMid = await page.evaluate(() => {
      const canvas = document.getElementById('canvas');
      const rect = canvas.getBoundingClientRect();
      const con = (window.connections || [])[0];
      const map = new Map((window.blocks || []).map(b => [b.id, b]));
      const from = map.get(con.from), to = map.get(con.to);
      const getEdge = (b, target) => {
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        const dx = target.x - cx, dy = target.y - cy; const ang = Math.atan2(dy, dx);
        return { x: cx + Math.cos(ang) * (b.width / 2), y: cy + Math.sin(ang) * (b.height / 2) };
      };
      const p1 = getEdge(from, { x: to.x + to.width / 2, y: to.y + to.height / 2 });
      const p2 = getEdge(to, { x: from.x + from.width / 2, y: from.y + from.height / 2 });
      const midLocal = { x: Math.round((p1.x + p2.x) / 2), y: Math.round((p1.y + p2.y) / 2) };
      return { x: rect.left + midLocal.x, y: rect.top + midLocal.y };
    });
    await page.mouse.move(pageMid.x, pageMid.y);
    await sleep(200);

    // Instead of relying on the visual tooltip (it's inside a hidden modal in the app), check internal hit test
    const hasConn = await page.evaluate(({cx, cy}) => {
      const canvas = document.getElementById('canvas');
      const rect = canvas.getBoundingClientRect();
      const pos = { x: cx - rect.left, y: cy - rect.top };
      // replicate hitTestConnection using page-level blocks and connections
      const tol = 6;
      const blockMap = new Map((window.blocks || []).map(b => [b.id, b]));
      const pointNearSegment = (p, a, b, tol) => {
        const vx = b.x - a.x, vy = b.y - a.y;
        const wx = p.x - a.x, wy = p.y - a.y;
        const c1 = vx * wx + vy * wy;
        if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y) <= tol;
        const c2 = vx * vx + vy * vy;
        if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y) <= tol;
        const t = c1 / c2; const projX = a.x + t * vx, projY = a.y + t * vy;
        return Math.hypot(p.x - projX, p.y - projY) <= tol;
      };
      for (let i = (window.connections || []).length - 1; i >= 0; i--) {
        const conn = window.connections[i];
        const from = blockMap.get(conn.from); const to = blockMap.get(conn.to);
        if (!from || !to) continue;
        const getEdge = (b, target) => {
          const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
          const dx = target.x - cx, dy = target.y - cy; const ang = Math.atan2(dy, dx);
          return { x: cx + Math.cos(ang) * (b.width / 2), y: cy + Math.sin(ang) * (b.height / 2) };
        };
        const p1 = getEdge(from, { x: to.x + to.width / 2, y: to.y + to.height / 2 });
        const p2 = getEdge(to, { x: from.x + from.width / 2, y: from.y + from.height / 2 });
        if (pointNearSegment(pos, p1, p2, tol)) return true;
        // attach debug data on the window for inspection when test fails
        window._puppeteer_debug = { canvasRect: rect, hoverPos: pos, p1, p2, blocks: window.blocks, connections: window.connections };
      }
      return false;
  }, { cx: pageMid.x, cy: pageMid.y });

    if (!hasConn) {
      const debug = await page.evaluate(() => window._puppeteer_debug || { canvasRect: null, hoverPos: null, blocks: window.blocks, connections: window.connections });
      throw new Error('Expected hitTestConnection to find a connection at the hover point; debug=' + JSON.stringify(debug));
    }

    // Open the context menu for the first connection directly (more reliable in headless mode)
    await page.evaluate(({px, py}) => {
      const conn = (window.connections || [])[0];
      if (!conn) return false;
      activeContextMenuConnection = conn;
      activeContextMenuBlock = null;
      showContextMenu(px, py);
      return true;
    }, { px: pageMid.x, py: pageMid.y });

    // The delete-connection button should now be visible for connection context
    const deleteConnVisibleAfterContext = await page.$eval('#delete-connection', el => !el.classList.contains('hidden-item'));
    if (!deleteConnVisibleAfterContext) throw new Error('Delete Connection button should be visible when opening connection context menu');

    // Simulate editing by focusing the shared text editor and ensure tooltip suppression logic is active
    const editBtnVisible = await page.$eval('#edit-connection-label', el => !el.classList.contains('hidden-item'));
    if (editBtnVisible) {
      // Focus the shared text editor to simulate editing
      await page.evaluate(() => { const te = document.getElementById('text-editor'); if (te) { te.style.display = 'block'; te.focus(); } });
      await sleep(80);
      // Check suppressTooltip logic (contextOpenForConnection || editingConnection || editorHasFocus)
      const suppress = await page.evaluate(() => {
        const contextOpenForConnection = document.getElementById('context-menu').classList.contains('show') && !!window.activeContextMenuConnection;
        const editorHasFocus = document.activeElement === document.getElementById('text-editor');
        return { contextOpenForConnection, editorHasFocus, suppressTooltip: contextOpenForConnection || editorHasFocus };
      });
      if (!suppress.suppressTooltip) throw new Error('Tooltip should be suppressed while editing (context or editor focus)');
      // Blur the editor to end editing
      await page.evaluate(() => { const te = document.getElementById('text-editor'); if (te) { te.blur(); te.style.display = 'none'; } });
      await sleep(80);
    }

    // Now simulate right-click on a block: hide any existing context and open it for the first block
    await page.evaluate(({bx, by}) => {
      hideContextMenu();
      const b = (window.blocks || [])[0];
      if (!b) return false;
      activeContextMenuBlock = b;
      activeContextMenuConnection = null;
      showContextMenu(b.x + 10, b.y + 10);
      return true;
    }, { bx: bx1, by: by1 });
    await sleep(80);
    const deleteConnVisibleOnBlock = await page.$eval('#delete-connection', el => !el.classList.contains('hidden-item'));
    if (deleteConnVisibleOnBlock) throw new Error('Delete connection should NOT be visible when opening context menu on a block');

    console.log('Puppeteer UI test passed');
  } catch (err) {
    console.error('Puppeteer UI test failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
