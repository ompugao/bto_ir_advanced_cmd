import json
import threading

import pytest

from web.models import Config, IRCommand, migrate
from web.store import ConfigError, ConfigStore


def test_missing_file_starts_empty(config_path):
    store = ConfigStore(config_path)
    assert store.read() == Config()


def test_corrupt_file_refuses_to_load_and_is_left_alone(config_path, tmp_path):
    (tmp_path / "data").mkdir()
    with open(config_path, "w") as f:
        f.write('{"commands": {"A": {"raw_')
    with pytest.raises(ConfigError):
        ConfigStore(config_path)
    with open(config_path) as f:
        assert f.read() == '{"commands": {"A": {"raw_'


def test_transaction_persists_and_keeps_backup(seeded_path):
    store = ConfigStore(seeded_path)
    before = open(seeded_path).read()
    with store.transaction() as config:
        config.mappings["2"] = "Dining"
    assert json.load(open(seeded_path))["mappings"]["2"] == "Dining"
    assert open(seeded_path + ".bak").read() == before
    assert ConfigStore(seeded_path).read().mappings["2"] == "Dining"


def test_failed_write_leaves_disk_and_memory_untouched(seeded_path, monkeypatch):
    store = ConfigStore(seeded_path)
    before = open(seeded_path).read()

    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr("web.store.os.replace", boom)
    with pytest.raises(OSError):
        with store.transaction() as config:
            config.mappings["2"] = "Dining"
    assert open(seeded_path).read() == before
    assert store.read().mappings.get("2") == ""


def test_exception_inside_transaction_discards_changes(seeded_path):
    store = ConfigStore(seeded_path)
    with pytest.raises(RuntimeError):
        with store.transaction() as config:
            config.commands.clear()
            raise RuntimeError("abort")
    assert len(store.read().commands) == 8


def test_concurrent_transactions_do_not_lose_updates(config_path):
    store = ConfigStore(config_path)

    def add(i):
        with store.transaction() as config:
            config.commands[f"C{i}"] = IRCommand(raw_data="0x00", channel=1)

    threads = [threading.Thread(target=add, args=(i,)) for i in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(ConfigStore(config_path).read().commands) == 20


def test_read_returns_copy(seeded_path):
    store = ConfigStore(seeded_path)
    store.read().commands.clear()
    assert len(store.read().commands) == 8


def test_legacy_string_commands_are_migrated_with_backup(config_path, tmp_path):
    (tmp_path / "data").mkdir()
    with open(config_path, "w") as f:
        json.dump({"commands": {"A": "0x01,0x02"}}, f)
    store = ConfigStore(config_path, migrate=migrate)
    assert store.read().commands["A"].raw_data == "0x01,0x02"
    assert json.load(open(config_path + ".premigration.bak")) == {"commands": {"A": "0x01,0x02"}}
