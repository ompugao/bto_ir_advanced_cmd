def test_get_config(client):
    r = client.get("/api/config")
    assert r.status_code == 200 and len(r.json()["commands"]) == 8


def test_send_command(client, fake):
    assert client.post("/api/commands/send/TURN_OFF_LIGHT").status_code == 200
    assert len(fake.sent) == 1
    assert client.post("/api/commands/send/NOPE").status_code == 404


def test_missing_ids_give_404(client):
    assert client.delete("/api/timers/nope").status_code == 404
    assert client.post("/api/timers/nope/execute").status_code == 404
    assert client.delete("/api/commands/nope").status_code == 404
