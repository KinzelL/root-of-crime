/* ROOT OF CRIME – monitoring minigame
   Prevent (so it cannot flap) → fix the noise → Clear on mon.precinct. */

var Mon = {
  idleHosts() {
    return [
      { host: 'closet', check: 'PING' },
      { host: 'precinct-13', check: 'PING' },
      { host: 'booking-vm', check: 'PING' },
      { host: 'coffee.lan', check: 'PING' }
    ];
  },

  mission() {
    if (typeof Missions === 'undefined') return null;
    const env = typeof Game !== 'undefined' && Game.ticketEnv ? Game.ticketEnv() : null;
    const liveId = (env && env.id) || (typeof Game !== 'undefined' && Game.state && Game.state.currentMissionId);
    const live = liveId ? Missions.get(liveId) : null;
    if (live && live.monitor) return live;
    if (typeof Game === 'undefined' || !Game.state) return null;
    const done = Game.state.completed || [];
    const day = Game.state.shiftDay || 0;
    return Missions.list().find((m) => (
      m.monitor &&
      !done.includes(m.id) &&
      Missions.isUnlocked(m, done) &&
      Missions.shiftDayOf(m) <= day
    )) || null;
  },

  env() {
    const mission = this.mission();
    if (!mission) return { mission: null, ctx: null, vfs: null, live: false };
    const env = typeof Game !== 'undefined' && Game.ticketEnv ? Game.ticketEnv() : null;
    const live = !!(env && env.id === mission.id && env.ctx && env.vfs);
    return {
      mission,
      ctx: live ? env.ctx : null,
      vfs: live ? env.vfs : null,
      live
    };
  },

  snapshot() {
    if (typeof Roc !== 'undefined' && Roc.usesKernel()) {
      return Roc.monSnapshot();
    }
    const { mission, ctx, vfs, live } = this.env();
    const idle = this.idleHosts().map((h) => ({
      host: h.host,
      check: h.check,
      status: 'OK',
      color: 'OK',
      alert: false
    }));
    if (!mission || !mission.monitor) {
      return { rows: idle, red: false, warn: false, mission: null, live: false, prevent: false, fix: false, cleared: false };
    }
    const mon = mission.monitor;
    const prevent = !!(live && mon.prevent(ctx, vfs));
    const fix = !!(live && mon.fix(ctx, vfs));
    const cleared = !!(ctx && ctx.monCleared);
    const flap = !!(ctx && ctx.monFlap);
    let color = 'CRIT';
    let status = live ? (flap ? 'FLAP' : 'CRIT') : 'CRIT';
    if (prevent && fix && cleared) {
      color = 'OK';
      status = 'OK';
    } else if (prevent && fix) {
      color = 'WARN';
      status = 'UNACK';
    }
    const rows = idle.map((h) => {
      if (h.host !== mon.host) return h;
      return {
        host: mon.host,
        check: mon.check,
        status,
        color,
        alert: color !== 'OK',
        missionId: mission.id
      };
    });
    return { rows, red: color === 'CRIT', warn: color === 'WARN', mission, live, prevent, fix, cleared };
  },

  hasRed() {
    return this.snapshot().red;
  },

  hasWarn() {
    return this.snapshot().warn;
  },

  tick(ctx, vfs, mission) {
    const m = mission || (this.env().live ? this.env().mission : null);
    if (!m || !m.monitor || !ctx || !vfs) return;
    const mon = m.monitor;
    if (mon.prevent(ctx, vfs)) {
      ctx.monQuietTicks = 0;
      return;
    }
    if (typeof mon.fix === 'function' && mon.fix(ctx, vfs) && typeof mon.respawn === 'function') {
      ctx.monQuietTicks = (ctx.monQuietTicks || 0) + 1;
      if (ctx.monQuietTicks >= 2) {
        mon.respawn(ctx, vfs);
        ctx.monCleared = false;
        ctx.monFlap = true;
        ctx.monQuietTicks = 0;
      }
    }
  },

  clear(host) {
    if (typeof Roc !== 'undefined' && Roc.usesKernel()) {
      try {
        const held = Roc.monClear(host);
        if (typeof Game !== 'undefined') {
          if (Game._syncFromKernel) Game._syncFromKernel();
          if (Game.toast) Game.toast(Roc.toast());
          if (Game.refreshMissionHud) Game.refreshMissionHud();
          if (Game._paintConsole) Game._paintConsole();
          if (Game._updateChrome) Game._updateChrome();
        }
        return !!held;
      } catch (err) {
        if (typeof Game !== 'undefined' && Game.toast) {
          Game.toast(String(err && err.message ? err.message : err));
        }
        return false;
      }
    }
    const snap = this.snapshot();
    const mission = snap.mission;
    if (!mission || mission.monitor.host !== host) {
      if (typeof Game !== 'undefined' && Game.toast) Game.toast('Nothing to clear on ' + host);
      return false;
    }
    if (!snap.live) {
      if (typeof Game !== 'undefined' && Game.workTicket) Game.workTicket(mission.id);
    }
    const env = typeof Game !== 'undefined' && Game.ticketEnv ? Game.ticketEnv() : null;
    if (!env || env.id !== mission.id || !env.ctx || !env.vfs) {
      if (typeof Game !== 'undefined' && Game.toast) {
        Game.toast('ssh ' + mission.monitor.host + ' first. Then prevent, then fix, then Clear.');
      }
      return false;
    }
    const prevent = mission.monitor.prevent(env.ctx, env.vfs);
    const fix = mission.monitor.fix(env.ctx, env.vfs);
    if (prevent && fix) {
      env.ctx.monCleared = true;
      env.ctx.monFlap = false;
      if (typeof Game !== 'undefined' && Game.toast) Game.toast(host + ' OK — it held');
    } else {
      env.ctx.monCleared = false;
      env.ctx.monFlap = true;
      if (!prevent && typeof mission.monitor.respawn === 'function') {
        mission.monitor.respawn(env.ctx, env.vfs);
      }
      if (typeof Game !== 'undefined' && Game.toast) {
        Game.toast(host + ' FLAP — it came back. Stop it coming back, then the noise, then Clear.');
      }
    }
    if (typeof Game !== 'undefined') {
      if (Game.refreshMissionHud) Game.refreshMissionHud();
      if (Game._paintConsole) Game._paintConsole();
      if (Game._updateChrome) Game._updateChrome();
    }
    return !!(prevent && fix);
  },

  work(host) {
    const snap = this.snapshot();
    const mission = snap.mission;
    if (!mission || mission.monitor.host !== host) return;
    if (typeof Game !== 'undefined' && Game.workTicket) Game.workTicket(mission.id);
  }
};
