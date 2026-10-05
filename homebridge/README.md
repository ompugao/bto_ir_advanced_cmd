# homebridge-ir-remote-hub

Puts the rooms and routines of the IR Remote Hub (the web app in this repo) into
HomeKit. Through two other Homebridge plugins they are also available to Alexa and
Google Home:

| Assistant   | Extra Homebridge plugin |
|-------------|-------------------------|
| Siri / Home | none |
| Alexa       | [`homebridge-alexa`](https://github.com/NorthernMan54/homebridge-alexa) |
| Google Home | [`homebridge-gsh`](https://github.com/oznu/homebridge-gsh) |

```
"Alexa, set Living Room to 40 percent"
  -> homebridge-alexa -> Homebridge -> this plugin
  -> PUT http://<hub>:8000/api/rooms/<id>/light {"brightness": 40}
  -> hub: 3 x Darker, queued with everything else that uses the IR device
```

The plugin never touches the USB device itself. The hub stays the only thing that
sends IR, so HomeKit, the web UI and routines can't send at the same time and
garble each other's codes.

## What shows up

- **One light per room** that has On and Off buttons:
  - On/Off;
  - Brightness, if the room has Brighter and Darker;
  - Colour temperature, if it has White and Warmer.
- **One switch per routine.** Turning it on runs the routine, and the switch turns
  itself off again, so "Alexa, turn on Good Night" works every time.

Rooms and routines come from the hub. Add, rename or delete them in the hub's web
UI and the change appears within one refresh interval. Each accessory keeps its
identity when renamed, so scenes and automations stay attached.

## Brightness and colour

IR is one-way, so the hub estimates each light's state. It counts every role
button it sends, whether from the Home page, a routine, or HomeKit. To set 40%,
it works out the difference from the estimate and presses Brighter or Darker that
many times.

- **Steps:** set the number of presses from one end of the range to the other
  under **Settings → room → Brightness steps / Colour steps** (default 10).
- **Re-syncing:** 0% and 100% press past the end of the range. The same happens
  when the level is unknown, e.g. on first use. This brings the estimate back in
  line after someone used the physical remote. A routine that presses a button at
  least *steps* times in a row (e.g. 12 × Brighter) also re-syncs it.
- **Rapid changes:** dragging a slider sends many values. Values that arrive while
  the hub is still pressing are merged, so only the last one is applied.

## Install

1. Run the hub (see `README_WEB.md`) and set up its rooms, buttons and routines.
2. Install this plugin on the Homebridge host. It is not on npm, so install it
   from a checkout of this repo. With the apt install of Homebridge, run
   `sudo hb-shell` first:
   ```sh
   cd /var/lib/homebridge
   npm install /path/to/bto_ir_advanced_cmd/homebridge
   ```
3. Configure it in the Homebridge UI, or in `config.json`:
   ```json
   {
     "platform": "IrRemoteHub",
     "name": "IR Remote Hub",
     "url": "http://192.168.1.10:8000"
   }
   ```
   Optional settings:
   - `routines` (default `true`): show routines as switches;
   - `pollInterval` (seconds, default 10);
   - `timeout` (seconds, default 5).
4. For Alexa or Google Home, install `homebridge-alexa` or `homebridge-gsh` and
   link your account as their READMEs describe. Then ask Alexa to discover
   devices, or check the Google Home app.

While the hub is unreachable, the accessories show "No Response". They are not
removed, so they stay in your rooms, scenes and automations.

## Development

`npm test` runs the unit tests. For an end-to-end check without hardware, run the
hub against a stand-in binary (see `docs/ir-remote-hub.md`). Then start Homebridge
in insecure mode, with this directory linked as a plugin:

```sh
homebridge -I -U ./hb-storage -P ./plugins
```

Then read and write characteristics with
`curl -H 'Authorization: <pin>' localhost:<port>/characteristics`.
