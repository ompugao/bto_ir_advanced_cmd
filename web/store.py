import json
import logging
import os
import shutil
import tempfile
import threading
from contextlib import contextmanager
from typing import Callable, Iterator, Optional

from web.models import Config

logger = logging.getLogger(__name__)


class ConfigError(Exception):
    """Raised when the stored config cannot be read. Never silently replaced."""


class ConfigStore:
    """In-memory config guarded by a lock and persisted with atomic writes.

    Reads return deep copies. Writes go through `transaction()`, which hands out
    a copy, validates it, writes it to disk (temp file + fsync + rename) and only
    then makes it the current config. A failed write leaves both disk and memory
    untouched.
    """

    def __init__(self, path: str, migrate: Optional[Callable[[dict], dict]] = None):
        self.path = path
        self._migrate = migrate
        self._lock = threading.RLock()
        self._config = self._load()

    def _load(self) -> Config:
        if not os.path.exists(self.path):
            logger.info(f"No config at {self.path}; starting with an empty config")
            return Config()
        try:
            with open(self.path, "r") as f:
                data = json.load(f)
            if self._migrate:
                migrated = self._migrate(data)
                if migrated is not data:
                    backup = self.path + ".premigration.bak"
                    shutil.copy2(self.path, backup)
                    logger.info(f"Migrated config; original kept at {backup}")
                    config = Config.model_validate(migrated)
                    self._write(config)
                    return config
            return Config.model_validate(data)
        except Exception as e:
            raise ConfigError(f"Cannot load {self.path}: {e}") from e

    def read(self) -> Config:
        with self._lock:
            return self._config.model_copy(deep=True)

    @contextmanager
    def transaction(self) -> Iterator[Config]:
        with self._lock:
            draft = self._config.model_copy(deep=True)
            yield draft
            # Re-validate the edited draft so cross-reference checks run.
            validated = Config.model_validate(draft.model_dump())
            self._write(validated)
            self._config = validated

    def _write(self, config: Config):
        directory = os.path.dirname(os.path.abspath(self.path))
        os.makedirs(directory, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".config.", suffix=".tmp", dir=directory)
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(config.model_dump(), f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            if os.path.exists(self.path):
                shutil.copy2(self.path, self.path + ".bak")
            os.replace(tmp, self.path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
        dir_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
