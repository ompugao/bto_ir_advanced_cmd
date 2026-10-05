'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { HubClient } = require('../lib/hub');
const { colorToMired, miredToColor, homekitValues } = require('../lib/mapping');

test('colour maps to mireds and back', () => {
  assert.strictEqual(colorToMired(100), 140); // whitest
  assert.strictEqual(colorToMired(0), 500); // warmest
  for (const c of [0, 25, 50, 75, 100]) assert.strictEqual(miredToColor(colorToMired(c)), c);
  assert.strictEqual(miredToColor(50), 100); // clamped
});

test('unknown hub state gets HomeKit defaults', () => {
  assert.deepStrictEqual(homekitValues({ on: null, brightness: null, color: null }), { on: false, brightness: 100, mired: 320 });
  assert.deepStrictEqual(homekitValues({ on: true, brightness: 40, color: 100 }), { on: true, brightness: 40, mired: 140 });
});

test('client sends JSON and surfaces the hub error detail', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c)).on('end', () => {
      seen.push([req.method, req.url, body]);
      if (req.url.endsWith('/light')) {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Room has no buttons for: color' }));
      } else {
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end('{"status":"queued"}');
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const hub = new HubClient(`http://127.0.0.1:${server.address().port}/`);
  try {
    assert.deepStrictEqual(await hub.runRoutine('t 1'), { status: 'queued' });
    await assert.rejects(hub.setLight('r1', { color: 10 }), /422 Room has no buttons for: color/);
    assert.deepStrictEqual(seen, [
      ['POST', '/api/timers/t%201/execute', ''],
      ['PUT', '/api/rooms/r1/light', '{"color":10}'],
    ]);
  } finally {
    server.close();
  }
  await assert.rejects(new HubClient('http://127.0.0.1:1', 500).lights(), /cannot reach/);
});
