const statuses = new Set(['running', 'waiting', 'completed', 'blocked', 'cancelled']);
const stepStatuses = new Set(['pending', 'active', 'done', 'blocked', 'skipped']);
export const terminal = status => ['completed', 'blocked', 'cancelled'].includes(status);

export function validSnapshot(value) {
  return value?.schema_version === 1 && value.panel_kind === 'relayforge_product' && value.source === 'agent_declared'
    && /^[a-f0-9-]{36}$/.test(value.run_id) && Number.isInteger(value.revision)
    && value.revision > 0 && statuses.has(value.status)
    && typeof value.title === 'string' && typeof value.summary === 'string'
    && Array.isArray(value.steps) && value.steps.length > 0 && value.steps.length <= 12
    && value.steps.every(step => typeof step.label === 'string' && stepStatuses.has(step.status));
}

export class PanelPoller {
  constructor({callTool, onSnapshot, onState,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = timer => clearTimeout(timer)}) {
    Object.assign(this, {callTool, onSnapshot, onState, schedule, cancel});
    this.runId = null;
    this.snapshot = null;
    this.timer = null;
    this.ready = false;
    this.paused = false;
    this.closed = false;
    this.generation = 0;
    this.errors = 0;
    this.hidden = false;
    this.unavailable = false;
    this.refreshPending = false;
    this.inFlight = false;
  }

  bind(value, {replace = false} = {}) {
    if (!validSnapshot(value) || this.closed) return false;
    if (this.runId && value.run_id !== this.runId) {
      if (!replace) return false;
      // Hosts may reuse the resource's panel for a new explicit render result.
      // Old reads remain fenced by generation and can never change the new task.
      this.generation += 1;
      this.cancel(this.timer);
      this.timer = null;
      this.snapshot = null;
      this.errors = 0;
      this.paused = false;
      this.unavailable = false;
    }
    if (this.snapshot && value.revision < this.snapshot.revision) return false;
    const changed = !this.snapshot || value.revision > this.snapshot.revision;
    this.runId = value.run_id;
    if (changed) this.snapshot = value;
    if (terminal(this.snapshot.status)) {
      this.cancel(this.timer);
      this.timer = null;
      this.generation += 1;
    }
    if (changed) this.onSnapshot(value);
    if (this.canPoll() && !this.timer && !this.inFlight) this.poll();
    return true;
  }

  connected() {
    this.ready = true;
    if (this.canPoll()) this.poll();
  }

  pause() {
    this.paused = true;
    this.generation += 1;
    this.cancel(this.timer);
    this.timer = null;
    this.onState('paused');
  }

  resume() {
    if (this.closed) return;
    this.paused = false;
    if (this.canPoll()) {
      this.onState('connecting');
      if (this.inFlight) this.refreshPending = true;
      else this.poll();
    }
  }

  /** Visibility is independent of a user pause; restoring one must not undo the other. */
  setVisible(visible) {
    if (this.hidden === !visible) return;
    this.hidden = !visible;
    this.generation += 1;
    this.cancel(this.timer);
    this.timer = null;
    if (this.canPoll()) {
      if (this.inFlight) this.refreshPending = true;
      else this.poll();
    }
  }

  canPoll() {
    return this.ready && !this.paused && !this.hidden && !this.closed && !this.unavailable
      && this.runId && this.snapshot && !terminal(this.snapshot.status);
  }

  close() {
    this.pause();
    this.closed = true;
  }

  async poll() {
    if (!this.canPoll() || this.inFlight) return;
    const generation = this.generation;
    this.inFlight = true;
    this.timer = null;
    try {
      const result = await this.callTool({name: 'read_product_progress', arguments: {run_id: this.runId}});
      if (generation !== this.generation || this.closed) return;
      const next = result.structuredContent;
      if (result.isError && ['unknown_run', 'invalid_run_id'].includes(next?.error)) {
        this.unavailable = true;
        this.onState('unavailable');
        return;
      }
      if (result.isError || !validSnapshot(next) || next.run_id !== this.runId) throw new Error('invalid_snapshot');
      if (next.revision < this.snapshot.revision) throw new Error('stale_snapshot');
      this.errors = 0;
      if (next.revision > this.snapshot.revision) {
        this.snapshot = next;
        this.onSnapshot(next);
      }
      this.onState('synced');
    } catch {
      if (generation === this.generation && !this.closed) {
        this.errors += 1;
        this.onState('disconnected');
      }
    } finally {
      this.inFlight = false;
      if (this.canPoll()) {
        const delay = this.refreshPending ? 0 : Math.min(30000, 2000 * 2 ** Math.min(this.errors, 4));
        this.refreshPending = false;
        this.timer = this.schedule(() => this.poll(), delay);
      }
    }
  }
}
