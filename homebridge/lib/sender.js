'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FORMATS = ['AEHA', 'NEC', 'SONY', 'MITSUBISHI'];

/**
 * Turns a signal definition from config.json into the argument list for
 * bto_advanced_USBIR_cmd.
 *
 *   { name, file }                 -> -d <contents of file>      (raw data, as saved by `-g`)
 *   { name, data }                 -> -d <data>
 *   { name, format, code }         -> -t <format> -C <code>
 *   any of the raw forms + frequency -> additionally -f <frequency>
 */
function buildArgs(signal, baseDir) {
  if (signal.format || signal.code) {
    const format = String(signal.format || '').toUpperCase();
    if (!FORMATS.includes(format)) {
      throw new Error(`signal "${signal.name}": format must be one of ${FORMATS.join(', ')}`);
    }
    if (!signal.code) {
      throw new Error(`signal "${signal.name}": "code" is required when "format" is set`);
    }
    return ['-t', format, '-C', String(signal.code).replace(/^0x/i, '')];
  }

  let data;
  if (signal.data) {
    data = signal.data;
  } else if (signal.file) {
    const file = path.isAbsolute(signal.file) ? signal.file : path.join(baseDir, signal.file);
    // Read on every send so a re-recorded file is picked up without a restart.
    data = fs.readFileSync(file, 'utf8');
  } else {
    throw new Error(`signal "${signal.name}": one of "file", "data" or "format"+"code" is required`);
  }
  data = data.replace(/\s+/g, '');
  if (!/^(0x[0-9a-fA-F]{1,2},)*0x[0-9a-fA-F]{1,2},?$/.test(data)) {
    throw new Error(`signal "${signal.name}": raw data must look like 0x00,0x85,...`);
  }

  const args = [];
  if (signal.frequency) {
    args.push('-f', String(signal.frequency));
  }
  args.push('-d', data.replace(/,$/, ''));
  return args;
}

/**
 * Normalises a step from config. Accepted shapes:
 *   "darker"                                   -> send once
 *   { "signal": "darker", "repeat": 6, "interval": 100 }
 *   { "delay": 500 }                           -> wait
 */
function normaliseStep(step) {
  if (typeof step === 'string') {
    return { signal: step, repeat: 1, interval: 0 };
  }
  if (step && typeof step.delay === 'number' && !step.signal) {
    return { delay: step.delay };
  }
  if (step && step.signal) {
    return {
      signal: step.signal,
      repeat: Math.max(1, Math.floor(step.repeat || 1)),
      interval: Math.max(0, step.interval === undefined ? 100 : step.interval),
    };
  }
  throw new Error(`invalid step: ${JSON.stringify(step)}`);
}

/**
 * Serialises all IR transmissions: the USB device can only handle one
 * command at a time, and HomeKit/Alexa/Google may fire several requests at once.
 */
class IrSender {
  constructor(log, options) {
    this.log = log;
    this.command = options.command || 'bto_advanced_USBIR_cmd';
    this.commandPrefix = options.commandPrefix || [];
    this.baseDir = options.baseDir;
    this.timeout = options.timeout || 10000;
    this.retries = options.retries === undefined ? 1 : options.retries;
    this.dryRun = !!options.dryRun;
    this.signals = new Map();
    for (const s of options.signals || []) {
      if (!s || !s.name) {
        throw new Error('every signal needs a "name"');
      }
      this.signals.set(s.name, s);
    }
    this.queue = Promise.resolve();
  }

  hasSignal(name) {
    return this.signals.has(name);
  }

  /** Validates every step up front so config errors show at startup, not at "Alexa, ..." time. */
  validateSteps(steps, where) {
    return (steps || []).map((raw) => {
      const step = normaliseStep(raw);
      if (step.signal) {
        const signal = this.signals.get(step.signal);
        if (!signal) {
          throw new Error(`${where}: unknown signal "${step.signal}"`);
        }
        buildArgs(signal, this.baseDir);
      }
      return step;
    });
  }

  /** Queue a sequence of steps. Resolves when it has been fully sent. */
  run(steps, label) {
    const job = this.queue.then(() => this._runNow(steps, label));
    // Keep the queue alive even if this job fails.
    this.queue = job.catch(() => undefined);
    return job;
  }

  async _runNow(steps, label) {
    for (const raw of steps) {
      const step = normaliseStep(raw);
      if (step.delay !== undefined) {
        await sleep(step.delay);
        continue;
      }
      const signal = this.signals.get(step.signal);
      if (!signal) {
        throw new Error(`unknown signal "${step.signal}"`);
      }
      const args = buildArgs(signal, this.baseDir);
      for (let i = 0; i < step.repeat; i++) {
        if (i > 0 && step.interval) {
          await sleep(step.interval);
        }
        await this._exec(args, `${label}: ${step.signal} (${i + 1}/${step.repeat})`);
      }
    }
  }

  async _exec(args, label) {
    const prefix = Array.isArray(this.commandPrefix) ? this.commandPrefix : [];
    const file = prefix.length ? prefix[0] : this.command;
    const argv = prefix.length ? [...prefix.slice(1), this.command, ...args] : args;
    this.log.debug(`[ir] ${label}`);
    if (this.dryRun) {
      this.log.info(`[dry-run] ${file} ${argv.map((a) => (a.length > 40 ? a.slice(0, 37) + '...' : a)).join(' ')}`);
      return;
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          execFile(file, argv, { timeout: this.timeout }, (err, stdout, stderr) => {
            if (err) {
              err.message = `${err.message.trim()}${stderr ? ` | ${String(stderr).trim()}` : ''}`;
              reject(err);
            } else {
              resolve(stdout);
            }
          });
        });
        return;
      } catch (err) {
        if (attempt >= this.retries) {
          throw err;
        }
        this.log.warn(`[ir] ${label} failed, retrying: ${err.message}`);
        await sleep(300);
      }
    }
  }
}

module.exports = { IrSender, buildArgs, normaliseStep };
