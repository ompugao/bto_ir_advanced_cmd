# IR Remote Hub — design notes

Background, decisions and findings behind the web app in `web/` and `frontend/`. For setup and usage see
[`README_WEB.md`](../README_WEB.md).

## What it does

A small web app on a NAS that drives a **Bit Trade One Advanced USB IR Remote Controller**
(USB VID `22ea`, PID `003a`) to control **Panasonic ceiling lights** in three rooms:

| Room | Remote channel |
|---|---|
| Living Room | CH1 |
| Dining Room | CH2 |
| Bed Room | CH3 |

Every room has the same six functions: On, Off, Brighter, Darker, White, Warmer.

It offers:
- **Home**: a remote per room;
- **Routines**: daily sequences at a fixed time, Asia/Tokyo;
- **Settings**: rooms, buttons, recording.

## IR protocol findings

All captures are **AEHA** frames: a leader pulse, 40 pulse-distance bits sent LSB first, then a trailer.

- **Raw data from the tool** (`bto_advanced_USBIR_cmd -g`): comma-separated bytes (`0x00,0x86,…`). Each pair of bytes
  is a big-endian 16-bit duration, and durations alternate on/off.
- **Frame:** `2C 52 <group> <command> <checksum>`.
  - `2C 52` is the maker code.
  - `checksum = group XOR command`, which held on every capture.
- **The channel is inside the command byte**, so the same button sends a different code on each channel. The position
  of the channel field depends on the group:

| Group | Buttons | CH1 | CH2 | CH3 | Step | Channel field |
|---|---|---|---|---|---|---|
| `09` | Darken | `2B` | `33` | `3B` | +8 | bits 3–4 |
| `09` | Off | `2F` | `37` | `3F` | +8 | bits 3–4 |
| `39` | White | `90` | `94` | `98` | +4 | bits 2–3 |
| `39` | Warmer | `91` | `95` | `99` | +4 | bits 2–3 |

- **Button functions on CH1:** `09/2D` on, `09/2F` off, `09/2A` brighter, `09/2B` darker, `39/90` white,
  `39/91` warmer.
- **How this was verified:** the rule was checked against 12 real captures (4 buttons × 3 channels, recorded
  2026-09-26). The captures live in `web/tests/test_ir_codec.py` and the fixtures.
- **Generated buttons:** On and Brighter on CH2/CH3 were never recorded; they are generated from this rule. The other
  buttons are real recordings.
- **Old naming quirk:** the "ORANGE_LIGHT" button from the original setup is the **warmer** button. All rooms now
  call it WARMER_LIGHT.
- **Code:** `web/ir_codec.py` decodes captures, reads and rewrites the channel (keeping the capture's own timing), and
  recognises the function. Codes it doesn't recognise are never rewritten; they are stored and sent exactly as
  recorded.

## Architecture

```
browser (React SPA)  ──HTTP──>  FastAPI (web/main.py)
                                 ├─ ConfigStore   data/config.json (atomic writes)
                                 ├─ TimerScheduler APScheduler cron jobs (Asia/Tokyo)
                                 ├─ IRRunner       single worker thread ──> bto_advanced_USBIR_cmd ──> USB
                                 └─ RecordingSession (auto-stop after 30 s)
```

### Backend modules (`web/`)

| Module | Responsibility |
|---|---|
| `main.py` | `create_app()` wires everything together; `app_factory()` is the uvicorn entry point (`--factory`). Also holds the API routes. |
| `store.py` | In-memory config behind a lock. Writes use temp file + fsync + rename and keep `config.json.bak`. An unreadable config **stops startup**; it is never replaced with an empty one. |
| `models.py` | Config schema (v3), cross-reference validation, the v1 → v2 → v3 migration chain, and `equivalent_command()`. |
| `runner.py` | One worker thread for all device access, so sequences never interleave. Records each timer's last run result. |
| `scheduler.py` | One cron job per enabled timer. 300 s misfire grace (APScheduler's default is 1 s). Jobs are synced incrementally. |
| `recording.py` | Recording state on the server, with a timeout. Flags a capture that is identical to the previous one. |
| `ir_codec.py` | Decoding, channel rewriting, and function detection (see above). |
| `device.py` | Detects the receiver via sysfs. |

### Data model (config v3)

- **Rooms:** `rooms[{id, name, channel}]`.
- **Commands:** `commands[{id, room_id, name, raw_data, derived, role}]`.
  - `role` is one of `on|off|brighter|darker|white|warmer`, or `null`, with at most one per room.
  - `derived` marks a button generated from another room's capture.
- **Timers:** `timers[{id, name, time "HH:MM", enabled, steps[{command_id, repeats, interval_ms, delay_after_ms}]}]`.
- **Matching across rooms:** buttons match by role first, then by name. This drives "copy missing buttons" and
  switching a routine to another room.

### Frontend (`frontend/src/`)

- **Pages:** `components/home`, `components/routines`, `components/settings`.
- **Shared widgets** (`components/ui`): sheet/dialog, switch, stepper, chips, and the Material 3–style `ClockPicker`.
- **Helpers:** `api.ts` checks every response and surfaces FastAPI's error detail. `ui.ts` holds roles, labels, the
  cross-room equivalence and style tokens.
- **Routing and theme:** hash routes (`#home`, `#routines`, `#settings/<room_id>`). There is a bottom tab bar on phones
  and a top bar on desktop, and the app follows the system dark/light setting.
- **Hold to repeat:** holding Brighter/Darker/White/Warmer on Home keeps sending, with a 400 ms delay before
  repeating and 100 ms gaps after that.

## Defects fixed

These were found in the original web app (`80f1626`) and fixed on `feat/webapp`.

**Data safety:**
- The config was truncated before being rewritten, and a load error silently fell back to an empty config. The next
  save would then wipe every command and timer.
- There was no lock, so concurrent requests could lose updates.
- The compose file bind-mounted a single file, which makes atomic rename impossible. The config now lives in a mounted
  `data/` directory.

**Scheduling and device access:**
- The 1 s misfire grace meant a late run was silently skipped.
- All jobs were removed and re-added on every change.
- Sequences could interleave, because the USB lock only covered one subprocess call.
- There was no delay between steps; `delay_after_ms` now exists.

**Logging:**
- DEBUG logging recorded libusb's stderr on every send, and the Synology `db` log driver never rotated.
  Logging is now INFO, and container logs are rotated via `json-file`.

**Validation and API:**
- No validation: `time`, `repeats`, `interval`, `channel` and references were unchecked. Deleting a command left
  broken timer steps.
- IR data was passed in URL query parameters.
- Wrong status codes, e.g. 200 for missing IDs.

**Frontend:**
- It mutated React state directly and ignored `res.ok`.
- It depended on CDNs (time picker, fonts), and there was no feedback while requests were in flight.

**Model:**
- A global channel → room mapping plus a hand-typed channel label per command, even though the channel is encoded in
  the code itself. This was replaced by rooms that own their buttons.

## Tests

`.venv/bin/python -m pytest web/tests` runs 65 tests with a fake controller, so no device is needed. They cover:
- the store (crash safety, concurrency, rejection of invalid edits);
- the runner and scheduler;
- the codec against all real samples;
- migrations of the real v1 and v2 NAS configs (fixtures);
- the API.

Frontend: `cd frontend && npx eslint src && npm run build`.

For manual UI testing without hardware, run the server against a stand-in binary:
- set `IR_HUB_BINARY` to a script that logs its arguments and prints a saved capture for `-g`;
- set `IR_HUB_DATA_DIR` to a scratch directory.

## Deployment

The app runs on the NAS with `docker-compose` and `privileged: true`. The repo is checked out on the NAS, and its
`origin` is the GitHub fork. To deploy:

1. Push the branch to the NAS repo over SSH, e.g.
   `git push --receive-pack=/usr/local/bin/git-receive-pack ssh://<nas>/~/3rdparty/bto_ir_advanced_cmd feat/webapp:refs/heads/webapp-deploy`.
2. On the NAS: `git merge --ff-only webapp-deploy && git branch -d webapp-deploy`.
3. On the NAS: `docker-compose build && docker-compose up -d`.
4. Check `docker ps` shows `(healthy)`, and `/api/status` shows `device_connected: true` with the expected next runs.

Notes:
- `git`/`docker` live in `/usr/local/bin`, which is not on the non-interactive SSH `PATH`.
- A config upgrade runs automatically on first start. It keeps the previous file as `data/config.json.premigration.bak`.

**Backups on the NAS:**
- `data/config.json.before-v3-20260926` — the config before the role (v3) upgrade.
- `web/config.json` and `~/3rdparty/bto_ir_advanced_cmd.bak-20260926` — the original v1 config and code.

## Open points

- Generated On/Brighter codes for CH2/CH3 have not been confirmed on the real lights yet.
- Light mode, and the routine editor at phone width, were not checked visually during development.
- The ClockPicker ring layout (00–11 outer, 12–23 inner) is from memory, not checked against Compose's `TimePicker`.
- The search of the old container logs for missed timer runs never finished; the old logs were too large. New logs
  report missed runs explicitly as warnings.
- `AGENTS.md` is untracked in git but kept up to date locally.
