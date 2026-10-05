# homebridge-bto-ir

A Homebridge plugin that sends IR signals through `bto_advanced_USBIR_cmd`
(Bit Trade One USB IR Remote Controller Advance). IR signals become HomeKit
accessories, and other Homebridge plugins can pass those accessories on to
voice assistants:

| Assistant   | Extra Homebridge plugin |
|-------------|-------------------------|
| Siri / Home | none (Homebridge itself) |
| Alexa       | [`homebridge-alexa`](https://github.com/NorthernMan54/homebridge-alexa) |
| Google Home | [`homebridge-gsh`](https://github.com/oznu/homebridge-gsh) |

```
"Alexa, turn on Dim Living Room"
  -> homebridge-alexa -> Homebridge -> homebridge-bto-ir
  -> bto_advanced_USBIR_cmd -d `cat darker.txt` (x6), orange (x5)
```

## Install

1. Build and install the command-line tool on the Homebridge host. `make install`
   makes the tool setuid root, so the `homebridge` user can open the USB device:

   ```sh
   sudo apt install build-essential libusb-1.0-0-dev
   make && sudo make install
   ```

2. Copy your recorded signals into the Homebridge storage directory (for the
   official Raspberry Pi / apt install this is `/var/lib/homebridge`):

   ```sh
   sudo mkdir -p /var/lib/homebridge/bto-ir
   sudo cp darker.txt brighter.txt orange.txt whiter.txt /var/lib/homebridge/bto-ir/
   ```

   To record a new button: `bto_advanced_USBIR_cmd -r`, press the button on the
   remote while pointing it at the device, `bto_advanced_USBIR_cmd -s`, then
   `bto_advanced_USBIR_cmd -g > newbutton.txt`.

3. Install the plugin. It is not on npm, so install it from this checkout. With
   the apt install of Homebridge, open a shell with `sudo hb-shell` first:

   ```sh
   cd /var/lib/homebridge
   npm install /path/to/bto_ir_advanced_cmd/homebridge
   ```

4. Add the platform to `config.json` (or use the settings form in the
   Homebridge UI). [`example-config.json`](example-config.json) reproduces
   `darken_living_room.sh` and `darken_living_room_completely.sh`, and adds a
   dimmable light. Restart Homebridge.

5. For Alexa / Google Home, install `homebridge-alexa` and/or `homebridge-gsh`
   from the Homebridge UI and link your account as their READMEs describe.
   Then ask Alexa to "discover devices", or the Google Home app should list the
   new devices once linked.

## Configuration

```jsonc
{
  "platform": "BtoIR",
  "name": "BTO IR",
  "command": "bto_advanced_USBIR_cmd",   // or an absolute path
  "signalDir": "bto-ir",                  // relative paths resolve against the Homebridge storage dir
  "signals": [
    { "name": "darker",  "file": "darker.txt" },        // raw data saved with -g
    { "name": "tv-power", "format": "NEC", "code": "08F6817E" },
    { "name": "inline",  "data": "0x00,0x85,..." , "frequency": 38000 }
  ],
  "accessories": [ ... ]
}
```

### Accessory types

**`switch`**: sends the `on` steps when switched on.
- With only `on`, it acts as a push button: it switches itself back off after
  `resetAfter` ms (default 1000), so the same voice command can be repeated.
- With `off` steps too, it is an ordinary on/off switch (state is remembered
  across restarts).

**`lightbulb`**: `on` / `off` steps, plus optional brightness driven by
relative buttons (`brighter` / `darker` signal names).
- `levels` is the number of button presses from dimmest to brightest. The
  plugin keeps track of the current level and sends the difference.
- Setting 100% (or 0%) sends `levels` extra presses so the lamp hits its limit.
  This brings the tracked level back in sync if someone used the physical remote.
- Several brightness changes in quick succession (dragging a slider) are
  merged into one, after `debounce` ms (default 600).

### Steps

A step is one of:

```jsonc
"darker"                                           // send once
{ "signal": "darker", "repeat": 6, "interval": 100 } // send 6 times, 100 ms apart
{ "delay": 500 }                                   // wait 500 ms
```

All sends go through a single queue, because the USB device handles one
command at a time. Each command is retried once on failure (`retries`).
Homebridge/Alexa/Google get an answer right away, without waiting for the IR
sequence to finish.

### Running the tool through Docker

If you only have the Docker image (`run.sh`), point the plugin at it:

```json
"commandPrefix": ["docker", "run", "--rm", "--privileged", "ompugao/bto_ir_advanced_cmd"]
```

The `homebridge` user then needs access to Docker. Each press starts a
container (roughly a second), so long sequences are much slower than with a
native install.

### Testing without the device

Set `"dryRun": true` to log the commands instead of running them.
`npm test` runs the unit tests.
