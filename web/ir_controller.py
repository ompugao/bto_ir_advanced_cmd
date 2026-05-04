import subprocess
import logging
import threading

logger = logging.getLogger(__name__)

class IRController:
    def __init__(self, binary_path="/usr/local/bin/bto_advanced_USBIR_cmd"):
        self.binary_path = binary_path
        self.lock = threading.Lock()

    def _run_command(self, args):
        with self.lock:
            cmd = [self.binary_path] + args
            logger.info(f"Running command: {' '.join(cmd)}")
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                logger.info(result.stderr.strip())
                return result.stdout.strip()
            except subprocess.CalledProcessError as e:
                logger.error(f"Command failed with exit code {e.returncode}")
                logger.error(f"Stderr: {e.stderr}")
                raise Exception(f"IR Command failed: {e.stderr}")

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
