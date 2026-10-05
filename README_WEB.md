# IR Remote Hub

A containerized web server to control the Bit Trade One Advanced USB IR Remote Controller.

## Features
- **Home**: one remote per room (On/Off, Brighter/Darker, White/Warmer). Hold Brighter, Darker, White or Warmer to keep stepping.
- **Routines**: multi-step sequences run at a fixed time every day (Asia/Tokyo). Pick the room once; switching the
  room moves every step to the same button there. Duplicate a routine to reuse it for another room. Each routine
  shows its next run and last result.
- **Settings**: rooms (name and remote channel CH1–3) and their buttons. "Add button" records from the physical remote;
  the capture is decoded, its function (e.g. "Darker") and channel are recognised, and it can be test-sent before saving.
- **Channel conversion**: for supported lights (Panasonic ceiling lights, maker code `2C 52`), buttons can be copied
  from another room and converted to this room's channel, so each button only has to be recorded once.
- **HomeKit / Alexa / Google Home**: the Homebridge plugin in [`homebridge/`](homebridge/README.md) turns each room into a
  dimmable light and each routine into a switch. The hub keeps an estimate of each light's state, so the web UI,
  routines and voice assistants all stay in step.
- Works on phones and desktops; follows the system's light/dark setting.

## About channels
The channel is part of every IR code: the same "darken" button sends `2C 52 09 2B 22` on CH1 and `2C 52 09 33 3A` on CH2.
That is why commands belong to rooms rather than carrying a channel label. `web/ir_codec.py` knows where the channel sits
in the supported light codes (bits 3–4 of the command byte for power/brightness buttons, bits 2–3 for colour buttons);
other codes are stored and sent exactly as recorded and are never rewritten.

## Deployment on Synology NAS

1. **Prerequisites**:
   - Install the **Container Manager** (formerly Docker) package.
   - Connect the Bit Trade One USB IR device to a USB port on the NAS.

2. **Project Setup**:
   - Copy this project folder to the NAS.
   - Settings live in `data/config.json`; the `data/` directory is mounted into the container.
     When upgrading from a version that used `web/config.json`, copy it once: `mkdir -p data && cp web/config.json data/config.json`.
     Old configs are converted automatically on first start (the original is kept as `data/config.json.premigration.bak`).

3. **Running with Docker Compose**:
   ```bash
   docker-compose up --build -d
   ```

4. **USB Access**:
   - The `privileged: true` flag in `docker-compose.yml` is required to access `/dev/bus/usb`.
   - The header shows "USB device not found" when the receiver isn't detected.

5. **Accessing the UI**:
   - Open your browser to `http://<NAS_IP>:8000`.

## Development

```bash
# Backend (uses a stand-in binary so no device is needed)
uv venv .venv && uv pip install -p .venv/bin/python -r requirements.txt -r requirements-dev.txt
.venv/bin/python -m pytest web/tests
IR_HUB_DATA_DIR=$PWD/data/dev IR_HUB_BINARY=/path/to/fake_binary \
  .venv/bin/uvicorn --factory web.main:app_factory --port 8000

# Frontend (proxies /api to :8000)
cd frontend && npm install && npm run dev
```

Environment variables: `IR_HUB_DATA_DIR` (settings directory, default `./data`), `IR_HUB_BINARY` (path to the IR tool),
`LOG_LEVEL` (default `INFO`).
