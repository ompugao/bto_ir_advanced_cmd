'use strict';

const { HubClient } = require('./lib/hub');
const { MIRED_MAX, MIRED_MIN, homekitValues, miredToColor } = require('./lib/mapping');

const PLUGIN_NAME = 'homebridge-ir-remote-hub';
const PLATFORM_NAME = 'IrRemoteHub';

// HomeKit writes On and Brightness of one request as separate calls; gather them into one change.
const BATCH_MS = 150;
// After we change a light, polls briefly show the hub part-way through its presses; don't
// let those move the Home app's slider back and forth.
const HOLD_AFTER_SET_MS = 8000;

module.exports = (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, IrRemoteHubPlatform);
};

/**
 * Mirrors the hub: one Lightbulb per room that has On/Off buttons (with
 * Brightness / Color Temperature when the room has Brighter+Darker / White+Warmer),
 * and one push-button Switch per routine. Everything is discovered from the hub,
 * so rooms and routines edited in its web UI show up here on the next poll.
 */
class IrRemoteHubPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.hap = api.hap;
    this.accessories = new Map(); // UUID -> PlatformAccessory (cached or created)
    this.handlers = new Map(); // UUID -> RoomLight | RoutineSwitch
    this.reachable = false;

    if (!this.config.url) {
      log.error('Set "url" to the IR Remote Hub address, e.g. http://192.168.1.10:8000');
      return;
    }
    this.hub = new HubClient(this.config.url, (this.config.timeout || 5) * 1000);
    this.pollMs = Math.max(2, this.config.pollInterval || 10) * 1000;
    this.exposeRoutines = this.config.routines !== false;

    api.on('didFinishLaunching', () => {
      this.refresh();
      this.timer = setInterval(() => this.refresh(), this.pollMs);
    });
    api.on('shutdown', () => clearInterval(this.timer));
  }

  configureAccessory(accessory) {
    this.accessories.set(accessory.UUID, accessory);
  }

  async refresh() {
    let config;
    let lights;
    try {
      [config, lights] = await Promise.all([this.hub.config(), this.hub.lights()]);
    } catch (err) {
      // Keep the accessories (removing them would drop them from scenes and automations);
      // they report "No Response" until the hub is back.
      if (!this.warned) {
        this.log.warn(`IR Remote Hub unreachable, will keep retrying: ${err.message}`);
        this.warned = true; // once per outage, not every poll
      }
      this.reachable = false;
      return;
    }
    if (!this.reachable) {
      this.log.info(`Connected to IR Remote Hub at ${this.config.url}`);
    }
    this.reachable = true;
    this.warned = false;
    this.sync(config, lights);
  }

  sync(config, lights) {
    const wanted = new Map(); // UUID -> { kind, data }
    for (const light of lights) {
      if (light.supports && light.supports.power) {
        wanted.set(this.hap.uuid.generate(`room:${light.room_id}`), { kind: 'light', data: light });
      }
    }
    if (this.exposeRoutines) {
      for (const timer of config.timers || []) {
        if (timer.id) {
          wanted.set(this.hap.uuid.generate(`routine:${timer.id}`), { kind: 'routine', data: timer });
        }
      }
    }

    const added = [];
    for (const [uuid, { kind, data }] of wanted) {
      let accessory = this.accessories.get(uuid);
      if (!accessory) {
        accessory = new this.api.platformAccessory(data.name, uuid);
        accessory.context.kind = kind;
        this.accessories.set(uuid, accessory);
        added.push(accessory);
        this.log.info(`Adding ${kind === 'light' ? 'light' : 'routine'} "${data.name}"`);
      }
      let handler = this.handlers.get(uuid);
      if (!handler) {
        handler = kind === 'light' ? new RoomLight(this, accessory) : new RoutineSwitch(this, accessory);
        this.handlers.set(uuid, handler);
      }
      if (handler.update(data)) {
        this.api.updatePlatformAccessories([accessory]);
      }
    }
    if (added.length) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, added);
    }

    const stale = [...this.accessories.values()].filter((a) => !wanted.has(a.UUID));
    if (stale.length) {
      stale.forEach((a) => {
        this.log.info(`Removing "${a.displayName}" (no longer on the hub)`);
        this.accessories.delete(a.UUID);
        this.handlers.delete(a.UUID);
      });
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }
  }

  /** Throw from onGet/onSet so the Home app shows "No Response" instead of stale values. */
  assertReachable() {
    if (!this.reachable) {
      throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  setInfo(accessory, model) {
    const { Service, Characteristic } = this.hap;
    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, 'IR Remote Hub')
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(Characteristic.SerialNumber, accessory.UUID.slice(0, 8));
  }

  /** Returns the accessory's only service of `ServiceType`, removing any others. */
  onlyService(accessory, ServiceType, name) {
    const { Service } = this.hap;
    for (const s of [...accessory.services]) {
      if (s.UUID !== ServiceType.UUID && s.UUID !== Service.AccessoryInformation.UUID) {
        accessory.removeService(s);
      }
    }
    return accessory.getService(ServiceType) || accessory.addService(ServiceType, name);
  }

  /** Keeps the accessory's name in step with the hub. Returns true if it changed. */
  rename(accessory, service, name) {
    if (accessory.displayName === name) {
      return false;
    }
    this.log.info(`Renaming "${accessory.displayName}" to "${name}"`);
    accessory.displayName = name;
    service.updateCharacteristic(this.hap.Characteristic.Name, name);
    if (this.hap.Characteristic.ConfiguredName) {
      service.updateCharacteristic(this.hap.Characteristic.ConfiguredName, name);
    }
    return true;
  }
}

class RoomLight {
  constructor(platform, accessory) {
    const { Service, Characteristic } = platform.hap;
    this.platform = platform;
    this.accessory = accessory;
    this.C = Characteristic;
    this.pending = {};
    this.holdUntil = 0;
    this.values = { on: false, brightness: 100, mired: 320 };

    platform.setInfo(accessory, 'Ceiling light');
    this.service = platform.onlyService(accessory, Service.Lightbulb, accessory.displayName);
    this.service.getCharacteristic(Characteristic.On)
      .onGet(() => this.get('on'))
      .onSet((v) => this.set({ on: !!v }, { on: !!v }));
  }

  get(key) {
    this.platform.assertReachable();
    return this.values[key];
  }

  /** Called on every poll with the room's entry from GET /api/lights. */
  update(light) {
    this.roomId = light.room_id;
    const changed = this.platform.rename(this.accessory, this.service, light.name);
    this.setSupported(this.C.Brightness, light.supports.brightness, (c) => c
      .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
      .onGet(() => this.get('brightness'))
      .onSet((v) => this.set({ brightness: v }, { brightness: v })));
    this.setSupported(this.C.ColorTemperature, light.supports.color, (c) => c
      .setProps({ minValue: MIRED_MIN, maxValue: MIRED_MAX, minStep: 1 })
      .onGet(() => this.get('mired'))
      .onSet((v) => this.set({ color: miredToColor(v) }, { mired: v })));

    if (Date.now() >= this.holdUntil) {
      this.values = homekitValues(light);
      this.service.updateCharacteristic(this.C.On, this.values.on);
      if (light.supports.brightness) this.service.updateCharacteristic(this.C.Brightness, this.values.brightness);
      if (light.supports.color) this.service.updateCharacteristic(this.C.ColorTemperature, this.values.mired);
    }
    return changed;
  }

  setSupported(Type, supported, setup) {
    const has = this.service.testCharacteristic(Type);
    if (supported && !this.wired?.has(Type.UUID)) {
      setup(this.service.getCharacteristic(Type));
      (this.wired ||= new Set()).add(Type.UUID);
    } else if (!supported && has) {
      this.service.removeCharacteristic(this.service.getCharacteristic(Type));
      this.wired?.delete(Type.UUID);
    }
  }

  set(change, values) {
    this.platform.assertReachable();
    Object.assign(this.values, values);
    Object.assign(this.pending, change);
    this.holdUntil = Date.now() + HOLD_AFTER_SET_MS;
    clearTimeout(this.batch);
    // Answer HomeKit at once; the hub queues the presses and returns immediately too.
    this.batch = setTimeout(() => this.flush(), BATCH_MS);
  }

  async flush() {
    const change = this.pending;
    this.pending = {};
    // HomeKit sends Brightness 0 instead of Off from some sliders.
    if (change.brightness === 0 && change.on === undefined) {
      change.on = false;
      delete change.brightness;
    }
    const label = `${this.accessory.displayName} ${JSON.stringify(change)}`;
    this.platform.log.info(`Setting ${label}`);
    try {
      await this.platform.hub.setLight(this.roomId, change);
    } catch (err) {
      this.platform.log.error(`Failed to set ${label}: ${err.message}`);
      this.holdUntil = 0; // let the next poll show what the hub really has
    }
  }
}

/**
 * A routine as a push button: switching it on runs the routine and the switch
 * flips back off, so "Alexa, turn on Good Night" works every time.
 */
class RoutineSwitch {
  constructor(platform, accessory) {
    const { Service, Characteristic } = platform.hap;
    this.platform = platform;
    this.accessory = accessory;
    platform.setInfo(accessory, 'Routine');
    this.service = platform.onlyService(accessory, Service.Switch, accessory.displayName);
    this.on = this.service.getCharacteristic(Characteristic.On);
    this.on
      .onGet(() => {
        platform.assertReachable();
        return false;
      })
      .onSet((value) => {
        platform.assertReachable();
        if (!value) return;
        setTimeout(() => this.on.updateValue(false), 1000);
        platform.log.info(`Running routine "${accessory.displayName}"`);
        platform.hub.runRoutine(this.timerId)
          .catch((err) => platform.log.error(`Routine "${accessory.displayName}" failed: ${err.message}`));
      });
  }

  update(timer) {
    this.timerId = timer.id;
    return this.platform.rename(this.accessory, this.service, timer.name);
  }
}
