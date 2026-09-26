import subprocess
import logging
import threading

logger = logging.getLogger(__name__)


class IRCommandError(Exception):
    pass


class IRController:
    def __init__(self, binary_path="/usr/local/bin/bto_advanced_USBIR_cmd", timeout=10):
        self.binary_path = binary_path
        self.timeout = timeout
        self.lock = threading.Lock()

    def _run_command(self, args):
        with self.lock:
            cmd = [self.binary_path] + args
            logger.debug(f"Running command: {cmd[0]} {args[0]}")
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=self.timeout)
            except subprocess.CalledProcessError as e:
                # libusb prints harmless "still referenced" warnings on every call,
                # so stderr is only surfaced when the command actually fails.
                logger.error(f"Command failed with exit code {e.returncode}: {e.stderr.strip()}")
                raise IRCommandError(f"IR command failed: {e.stderr.strip()}") from e
            except subprocess.TimeoutExpired as e:
                logger.error(f"Command timed out after {self.timeout}s")
                raise IRCommandError("IR command timed out") from e
            return result.stdout.strip()

    def send_raw_data(self, raw_data: str):
        """Sends IR data string (e.g., '0x12,0x34...')"""
        return self._run_command(["-d", raw_data])

    def start_recording(self):
        """Starts IR recording (-r)"""
        return self._run_command(["-r"])

    def stop_recording(self):
        """Stops IR recording (-s)"""
        return self._run_command(["-s"])

    def get_recorded_data(self):
        """Gets recorded IR data (-g)"""
        return self._run_command(["-g"])
