'use strict';

/** Minimal client for the IR Remote Hub HTTP API (web/main.py). */
class HubClient {
  constructor(baseUrl, timeoutMs = 5000) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, body) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}/api${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(`cannot reach ${this.baseUrl}: ${err.cause?.code || err.message}`);
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const detail = data && data.detail !== undefined ? data.detail : data;
      const message = typeof detail === 'string' ? detail : (detail && detail.message) || JSON.stringify(detail);
      throw new Error(`${method} ${path}: ${res.status} ${message}`);
    }
    return data;
  }

  config() {
    return this.request('GET', '/config');
  }

  lights() {
    return this.request('GET', '/lights');
  }

  /** changes: { on?: boolean, brightness?: 0-100, color?: 0-100 (0 = warmest) } */
  setLight(roomId, changes) {
    return this.request('PUT', `/rooms/${encodeURIComponent(roomId)}/light`, changes);
  }

  runRoutine(timerId) {
    return this.request('POST', `/timers/${encodeURIComponent(timerId)}/execute`);
  }
}

module.exports = { HubClient };
