import json
import threading

import pytest

from web.models import Command, Config, Room, migrate
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
    store = ConfigStore(seeded_path, migrate=migrate)
    before = open(seeded_path).read()
    with store.transaction() as config:
        config.rooms[1].name = "Dining"
    assert json.load(open(seeded_path))["rooms"][1]["name"] == "Dining"
    assert open(seeded_path + ".bak").read() == before
    assert ConfigStore(seeded_path).read().rooms[1].name == "Dining"


def test_failed_write_leaves_disk_and_memory_untouched(seeded_path, monkeypatch):
    store = ConfigStore(seeded_path, migrate=migrate)
    before = open(seeded_path).read()

    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr("web.store.os.replace", boom)
    with pytest.raises(OSError):
        with store.transaction() as config:
            config.rooms[1].name = "Dining"
    assert open(seeded_path).read() == before
    assert store.read().rooms[1].name == "Channel 2"


def test_invalid_edit_is_rejected_and_not_saved(seeded_path):
    store = ConfigStore(seeded_path, migrate=migrate)
    before = open(seeded_path).read()
    with pytest.raises(ValueError):
        with store.transaction() as config:
            config.rooms = []  # commands would point at missing rooms
    assert open(seeded_path).read() == before
    assert len(store.read().rooms) == 2


def test_exception_inside_transaction_discards_changes(seeded_path):
    store = ConfigStore(seeded_path, migrate=migrate)
    with pytest.raises(RuntimeError):
        with store.transaction() as config:
            config.commands.clear()
            raise RuntimeError("abort")
    assert len(store.read().commands) == 8


def test_concurrent_transactions_do_not_lose_updates(config_path):
    store = ConfigStore(config_path)
    with store.transaction() as config:
        config.rooms.append(Room(id="r", name="R", channel=1))

    def add(i):
        with store.transaction() as config:
            config.commands.append(Command(room_id="r", name=f"C{i}", raw_data="0x00,0x01,0x00,0x02"))

    threads = [threading.Thread(target=add, args=(i,)) for i in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(ConfigStore(config_path).read().commands) == 20


def test_read_returns_copy(seeded_path):
    store = ConfigStore(seeded_path, migrate=migrate)
    store.read().commands.clear()
    assert len(store.read().commands) == 8


def test_migration_keeps_backup_and_is_written_once(seeded_path):
    original = open(seeded_path).read()
    ConfigStore(seeded_path, migrate=migrate)
    assert open(seeded_path + ".premigration.bak").read() == original
    assert json.load(open(seeded_path))["version"] == 3
    migrated = open(seeded_path).read()
    ConfigStore(seeded_path, migrate=migrate)
    assert open(seeded_path).read() == migrated
