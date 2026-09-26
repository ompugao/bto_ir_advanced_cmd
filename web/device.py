import glob
import os
from typing import Optional

VENDOR_ID = "22ea"
PRODUCT_ID = "003a"


def device_connected(sysfs: str = "/sys/bus/usb/devices") -> Optional[bool]:
    """Whether the Bit Trade One USB IR device is plugged in (None if unknown)."""
    if not os.path.isdir(sysfs):
        return None
    for dev in glob.glob(os.path.join(sysfs, "*")):
        try:
            with open(os.path.join(dev, "idVendor")) as v, open(os.path.join(dev, "idProduct")) as p:
                if v.read().strip() == VENDOR_ID and p.read().strip() == PRODUCT_ID:
                    return True
        except OSError:
            continue
    return False
