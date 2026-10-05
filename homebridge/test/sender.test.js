'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { IrSender, buildArgs } = require('../lib/sender');

const silent = { debug() {}, info() {}, warn() {}, error() {} };

test('buildArgs handles file, inline data and formatted codes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'btoir-'));
  fs.writeFileSync(path.join(dir, 'a.txt'), '0x00,0x85,\n0x00,0x43\n');
  assert.deepStrictEqual(buildArgs({ name: 'a', file: 'a.txt' }, dir), ['-d', '0x00,0x85,0x00,0x43']);
  assert.deepStrictEqual(buildArgs({ name: 'b', data: '0x01,0x02', frequency: 40000 }, dir), ['-f', '40000', '-d', '0x01,0x02']);
  assert.deepStrictEqual(buildArgs({ name: 'c', format: 'nec', code: '0x08F6817E' }, dir), ['-t', 'NEC', '-C', '08F6817E']);
  assert.throws(() => buildArgs({ name: 'd', data: 'rm -rf /' }, dir), /raw data/);
  assert.throws(() => buildArgs({ name: 'e', format: 'FOO', code: '1' }, dir), /format/);
});

test('sequences run serially through the command, with prefix', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'btoir-'));
  const logFile = path.join(dir, 'calls.log');
  const fake = path.join(dir, 'fake.sh');
  // Fake tool: records its args and takes a little time, so overlapping calls would interleave.
  fs.writeFileSync(fake, `#!/bin/sh\necho "start $*" >> ${logFile}\nsleep 0.05\necho "end" >> ${logFile}\n`);
  fs.chmodSync(fake, 0o755);

  const sender = new IrSender(silent, {
    command: 'IRCMD',
    commandPrefix: ['/bin/sh', '-c', `${fake} "$@"`, 'sh'],
    baseDir: dir,
    signals: [{ name: 'x', data: '0x01' }, { name: 'y', format: 'NEC', code: 'AB' }],
  });
  await Promise.all([
    sender.run([{ signal: 'x', repeat: 2, interval: 10 }], 'one'),
    sender.run(['y', { delay: 10 }, 'x'], 'two'),
  ]);
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
  assert.deepStrictEqual(lines, [
    'start IRCMD -d 0x01', 'end',
    'start IRCMD -d 0x01', 'end',
    'start IRCMD -t NEC -C AB', 'end',
    'start IRCMD -d 0x01', 'end',
  ]);
});

test('failures retry, then reject without blocking the queue', async () => {
  const sender = new IrSender(silent, { command: '/bin/false', retries: 1, signals: [{ name: 'x', data: '0x01' }] });
  await assert.rejects(sender.run(['x'], 'fail'));
  const ok = new IrSender(silent, { command: '/bin/true', signals: [{ name: 'x', data: '0x01' }] });
  ok.queue = sender.queue;
  await ok.run(['x'], 'ok');
});

test('validateSteps catches unknown signals at startup', () => {
  const sender = new IrSender(silent, { signals: [{ name: 'x', data: '0x01' }] });
  assert.throws(() => sender.validateSteps(['nope'], 'acc.on'), /unknown signal "nope"/);
  assert.strictEqual(sender.validateSteps(['x'], 'acc.on').length, 1);
});
