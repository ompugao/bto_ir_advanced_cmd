# IR Remote Hub

A containerized web server to control the Bit Trade One Advanced USB IR Remote Controller.

## Features
- **Web UI**: Mobile-friendly dashboard for manual control and recording.
- **Recording Studio**: Easily capture and save new IR commands from your physical remote.
- **Multi-Step Timers**: Create complex sequences (e.g., Turn on TV, wait 2s, switch to HDMI 1).
- **Repeats & Intervals**: Configure how many times a command should be sent and the delay between repeats.
- **Room Mapping**: Associate internal channels with friendly room names.

## Deployment on Synology NAS

1. **Prerequisites**:
   - Install the **Container Manager** (formerly Docker) package.
   - Connect the Bit Trade One USB IR device to a USB port on the NAS.

2. **Project Setup**:
   - SSH into your NAS or use the File Station to upload this project folder.
   - Ensure `web/config.json` exists and is writable.

3. **Running with Docker Compose**:
   ```bash
   docker-compose up --build -d
   ```

4. **USB Access**:
   - The `privileged: true` flag in `docker-compose.yml` is required to access `/dev/bus/usb`.
   - If the device is not detected, ensure your NAS kernel supports USB serial devices (usually built-in).

5. **Accessing the UI**:
   - Open your browser to `http://<NAS_IP>:8000`.

## Advanced Timers
Timers use Cron expressions. Example:
- `0 7 * * *` : Every day at 7:00 AM.
- `*/15 * * * *` : Every 15 minutes.
- `0 22 * * 1-5` : Every weekday at 10:00 PM.

Each timer can have multiple **Steps**. Each step specifies:
- **Command**: Which IR code to send.
- **Repeats**: How many times to send it (useful for "Volume Up" or "Channel Next").
- **Interval**: Milliseconds to wait between repeats.
