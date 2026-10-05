'use strict';

const path = require('path');
const { IrSender } = require('./lib/sender');

const PLUGIN_NAME = 'homebridge-bto-ir';
const PLATFORM_NAME = 'BtoIR';

module.exports = (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BtoIrPlatform);
};

class BtoIrPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.cached = new Map();

    const baseDir = this.config.signalDir
      ? path.resolve(api.user.storagePath(), this.config.signalDir)
      : api.user.storagePath();

    try {
      this.sender = new IrSender(log, {
        command: this.config.command,
        commandPrefix: this.config.commandPrefix,
        baseDir,
        timeout: this.config.timeout,
        retries: this.config.retries,
        dryRun: this.config.dryRun,
        signals: this.config.signals,
      });
    } catch (err) {
      this.log.error(`Invalid configuration: ${err.message}`);
      return;
    }

    api.on('didFinishLaunching', () => this.setupAccessories());
  }

  configureAccessory(accessory) {
    this.cached.set(accessory.UUID, accessory);
  }

  setupAccessories() {
    const wanted = new Set();
    for (const def of this.config.accessories || []) {
      if (!def || !def.name) {
        this.log.error('Skipping accessory without "name"');
        continue;
      }
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${def.type || 'switch'}:${def.name}`);
      if (wanted.has(uuid)) {
        this.log.error(`Duplicate accessory name "${def.name}", skipping`);
        continue;
      }

      let accessory = this.cached.get(uuid);
      const isNew = !accessory;
      if (isNew) {
        accessory = new this.api.platformAccessory(def.name, uuid);
      }

      try {
        if ((def.type || 'switch') === 'lightbulb') {
          new IrLightbulb(this, accessory, def);
        } else if ((def.type || 'switch') === 'switch') {
          new IrSwitch(this, accessory, def);
        } else {
          throw new Error(`unknown type "${def.type}" (use "switch" or "lightbulb")`);
        }
      } catch (err) {
        this.log.error(`Accessory "${def.name}": ${err.message}`);
        continue;
      }

      wanted.add(uuid);
      if (isNew) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.log.info(`Added accessory "${def.name}"`);
      } else {
        this.api.updatePlatformAccessories([accessory]);
      }
    }

    const stale = [...this.cached.values()].filter((a) => !wanted.has(a.UUID));
    if (stale.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      stale.forEach((a) => this.log.info(`Removed accessory "${a.displayName}"`));
    }
  }

  setInfo(accessory, model) {
    accessory
      .getService(this.Service.AccessoryInformation)
      .setCharacteristic(this.Characteristic.Manufacturer, 'Bit Trade One')
      .setCharacteristic(this.Characteristic.Model, model)
      .setCharacteristic(this.Characteristic.SerialNumber, accessory.UUID.slice(0, 8));
  }

  /** Keep only the service we want, so changing an accessory's type in config doesn't leave junk behind. */
  primaryService(accessory, ServiceType, name) {
    for (const s of [...accessory.services]) {
      if (s.UUID !== ServiceType.UUID && s.UUID !== this.Service.AccessoryInformation.UUID) {
        accessory.removeService(s);
      }
    }
    return accessory.getService(ServiceType) || accessory.addService(ServiceType, name);
  }
}

/**
 * A switch. With only "on" steps it behaves like a push button: it sends the
 * steps and flips itself back off, so "Alexa, turn on Darken living room"
 * can be said again and again. With "off" steps too, it is a real on/off switch.
 */
class IrSwitch {
  constructor(platform, accessory, def) {
    const { Service, Characteristic, sender, log } = platform;
    this.onSteps = sender.validateSteps(def.on, `${def.name}.on`);
    this.offSteps = def.off ? sender.validateSteps(def.off, `${def.name}.off`) : null;
    if (!this.onSteps.length) {
      throw new Error('"on" needs at least one step');
    }
    this.stateless = !this.offSteps;
    this.resetAfter = def.resetAfter === undefined ? 1000 : def.resetAfter;

    platform.setInfo(accessory, 'IR Switch');
    const service = platform.primaryService(accessory, Service.Switch, def.name);
    service.setCharacteristic(Characteristic.Name, def.name);
    const on = service.getCharacteristic(Characteristic.On);

    let state = this.stateless ? false : !!accessory.context.on;
    on.onGet(() => state);
    on.onSet((value) => {
      value = !!value;
      if (this.stateless) {
        if (!value) {
          return;
        }
        state = true;
        setTimeout(() => {
          state = false;
          on.updateValue(false);
        }, this.resetAfter);
        this.fire(sender, log, this.onSteps, `${def.name} (press)`);
        return;
      }
      if (value === state) {
        return;
      }
      state = value;
      accessory.context.on = value;
      this.fire(sender, log, value ? this.onSteps : this.offSteps, `${def.name} ${value ? 'on' : 'off'}`);
    });
  }

  // Answer HomeKit/Alexa/Google immediately; long IR sequences would otherwise time out the request.
  fire(sender, log, steps, label) {
    log.info(`Sending ${label}`);
    sender.run(steps, label).catch((err) => log.error(`${label} failed: ${err.message}`));
  }
}

/**
 * A dimmable light driven by relative IR buttons (brighter / darker).
 * The current level is tracked in software. Going to 100% or 1% presses the
 * button enough extra times to saturate, which re-syncs the tracked level with
 * the real lamp.
 */
class IrLightbulb {
  constructor(platform, accessory, def) {
    const { Service, Characteristic, sender, log } = platform;
    this.sender = sender;
    this.log = log;
    this.name = def.name;
    this.onSteps = sender.validateSteps(def.on, `${def.name}.on`);
    this.offSteps = sender.validateSteps(def.off, `${def.name}.off`);
    this.levels = Math.max(1, Math.floor(def.levels || 10));
    this.interval = def.interval === undefined ? 150 : def.interval;
    this.debounce = def.debounce === undefined ? 600 : def.debounce;

    for (const key of ['brighter', 'darker']) {
      if (def[key] && !sender.hasSignal(def[key])) {
        throw new Error(`unknown signal "${def[key]}" in "${key}"`);
      }
    }
    this.brighter = def.brighter;
    this.darker = def.darker;
    this.dimmable = !!(this.brighter && this.darker);
    if (!this.onSteps.length && !this.offSteps.length && !this.dimmable) {
      throw new Error('needs "on"/"off" steps and/or both "brighter" and "darker" signals');
    }

    const ctx = accessory.context;
    if (typeof ctx.on !== 'boolean') ctx.on = false;
    if (typeof ctx.brightness !== 'number') ctx.brightness = 100;
    this.ctx = ctx;
    this.sentLevel = this.toLevel(ctx.brightness);

    platform.setInfo(accessory, 'IR Light');
    const service = platform.primaryService(accessory, Service.Lightbulb, def.name);
    service.setCharacteristic(Characteristic.Name, def.name);

    service.getCharacteristic(Characteristic.On)
      .onGet(() => ctx.on)
      .onSet((value) => {
        value = !!value;
        if (value === ctx.on) return;
        ctx.on = value;
        const steps = value ? this.onSteps : this.offSteps;
        if (steps.length) this.fire(steps, `${def.name} ${value ? 'on' : 'off'}`);
      });

    if (this.dimmable) {
      service.getCharacteristic(Characteristic.Brightness)
        .setProps({ minValue: 0, maxValue: 100, minStep: Math.max(1, Math.round(100 / this.levels)) })
        .onGet(() => ctx.brightness)
        .onSet((value) => {
          ctx.brightness = value;
          // Sliders and voice assistants often send several values in a row; only act on the last.
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.applyBrightness(), this.debounce);
        });
    } else if (service.testCharacteristic(Characteristic.Brightness)) {
      service.removeCharacteristic(service.getCharacteristic(Characteristic.Brightness));
    }
  }

  toLevel(brightness) {
    return Math.round((Math.min(100, Math.max(0, brightness)) / 100) * this.levels);
  }

  applyBrightness() {
    const target = this.toLevel(this.ctx.brightness);
    let presses = target - this.sentLevel;
    if (target === this.levels) presses = Math.max(presses, 0) + this.levels;   // saturate up
    if (target === 0) presses = Math.min(presses, 0) - this.levels;             // saturate down
    this.sentLevel = target;
    if (!presses) return;
    const signal = presses > 0 ? this.brighter : this.darker;
    this.fire(
      [{ signal, repeat: Math.abs(presses), interval: this.interval }],
      `${this.name} brightness ${this.ctx.brightness}% (${signal} x${Math.abs(presses)})`,
    );
  }

  fire(steps, label) {
    this.log.info(`Sending ${label}`);
    this.sender.run(steps, label).catch((err) => this.log.error(`${label} failed: ${err.message}`));
  }
}

module.exports.BtoIrPlatform = BtoIrPlatform;
