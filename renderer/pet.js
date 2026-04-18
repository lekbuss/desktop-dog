(function () {
  'use strict';

  const dogEl = document.getElementById('dog-wrapper');

  // ── State ────────────────────────────────────────────────────────────
  let currentState = 'idle';
  let stats = { hunger: 100, water: 100, mood: 100, energy: 100 };
  let screenSize = { width: 1920, height: 1080 };

  let pos = { x: 0, y: 0 };

  let prevState = 'idle';
  let walkTarget = null;
  let walkIntervalId = null;
  let idleTimerId = null;
  let noInteractTimerId = null;
  let sleepIntervalId = null;
  let currentSpeed = 2;

  const WALK_SPEED = 2;   // px per frame (walk)
  const RUN_SPEED  = 5;   // px per frame (run)
  const WALK_INTERVAL = 16;
  const NO_INTERACT_MS = 30 * 60 * 1000;

  const ALL_STATES = ['state-idle','state-walk','state-run','state-bark',
                      'state-eat','state-drink','state-talk','state-sleep','state-sad','state-pet'];

  // ── Helpers ──────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function syncPosFromWindow() {
    pos.x = window.screenX;
    pos.y = window.screenY;
  }

  // ── State machine ────────────────────────────────────────────────────
  function enterState(s) {
    if (currentState !== 'pet') prevState = currentState;
    currentState = s;
    dogEl.classList.remove(...ALL_STATES);
    dogEl.classList.add('state-' + s);
  }

  function setFacing(dx) {
    if (dx < 0) dogEl.classList.add('facing-left');
    else if (dx > 0) dogEl.classList.remove('facing-left');
  }

  // ── Stats ────────────────────────────────────────────────────────────
  function updateStat(key, value) {
    stats[key] = clamp(value, 0, 100);
    window.dogAPI.setState(key, stats[key]);
  }

  function checkSadState() {
    if (stats.hunger < 20 || stats.water < 20) {
      if (currentState !== 'sad') {
        stopWalk();
        enterState('sad');
      }
    } else if (currentState === 'sad') {
      enterState('idle');
      scheduleNextAction();
    }
  }

  // ── Decay timers ─────────────────────────────────────────────────────
  function startDecayTimers() {
    setInterval(() => { updateStat('hunger', stats.hunger - 3); checkSadState(); }, 15 * 60 * 1000);
    setInterval(() => { updateStat('water',  stats.water  - 3); checkSadState(); }, 10 * 60 * 1000);
    setInterval(() => { updateStat('mood',   stats.mood   - 2); },                  60 * 60 * 1000);
  }

  // ── Sleep ────────────────────────────────────────────────────────────
  function shouldSleep() {
    const h = new Date().getHours();
    return (h >= 22 || h < 7) && stats.energy < 50;
  }

  function enterSleep() {
    stopWalk();
    clearTimeout(idleTimerId);
    if (sleepIntervalId) clearInterval(sleepIntervalId);
    enterState('sleep');

    sleepIntervalId = setInterval(() => {
      updateStat('energy', stats.energy + 2);
      if (!shouldSleep()) {
        clearInterval(sleepIntervalId);
        sleepIntervalId = null;
        enterState('idle');
        scheduleNextAction();
      }
    }, 60 * 1000);
  }

  // ── Walk / Run ────────────────────────────────────────────────────────
  function stopWalk() {
    if (walkIntervalId) { clearInterval(walkIntervalId); walkIntervalId = null; }
    clearTimeout(idleTimerId);
    walkTarget = null;
  }

  // mode: 'walk' | 'run'
  function startWalk(mode) {
    mode = mode || 'walk';
    currentSpeed = mode === 'run' ? RUN_SPEED : WALK_SPEED;

    stopWalk();
    syncPosFromWindow();

    const margin = 20;
    walkTarget = {
      x: clamp(margin + Math.random() * (screenSize.width  - 120 - margin * 2), 0, screenSize.width  - 120),
      y: clamp(margin + Math.random() * (screenSize.height - 120 - margin * 2), 0, screenSize.height - 120)
    };

    enterState(mode);

    walkIntervalId = setInterval(() => {
      const dx   = walkTarget.x - pos.x;
      const dy   = walkTarget.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < currentSpeed + 1) {
        clearInterval(walkIntervalId);
        walkIntervalId = null;
        updateStat('energy', stats.energy - (mode === 'run' ? 10 : 5));
        enterState('idle');
        const pause = (3 + Math.random() * 5) * 1000;
        idleTimerId = setTimeout(scheduleNextAction, pause);
      } else {
        const vx = (dx / dist) * currentSpeed;
        const vy = (dy / dist) * currentSpeed;
        setFacing(vx);
        pos.x = clamp(pos.x + vx, 0, screenSize.width  - 120);
        pos.y = clamp(pos.y + vy, 0, screenSize.height - 120);
        window.dogAPI.setPosition(Math.round(pos.x), Math.round(pos.y));
      }
    }, WALK_INTERVAL);
  }

  // ── Idle scheduling ───────────────────────────────────────────────────
  function scheduleNextAction() {
    clearTimeout(idleTimerId);
    if (['eat', 'drink', 'talk', 'sleep'].includes(currentState)) return;

    if (shouldSleep()) { enterSleep(); return; }
    if (stats.hunger < 20 || stats.water < 20) { checkSadState(); return; }

    const delay = (5 + Math.random() * 10) * 1000;
    idleTimerId = setTimeout(() => {
      if (stats.energy < 20) { enterState('idle'); return; }
      if (shouldSleep()) { enterSleep(); return; }
      // Spontaneous movement: mostly walk, occasionally run
      startWalk(Math.random() < 0.25 ? 'run' : 'walk');
    }, delay);
  }

  // ── No-interaction proactive chat ─────────────────────────────────────
  function resetNoInteractTimer() {
    clearTimeout(noInteractTimerId);
    noInteractTimerId = setTimeout(() => {
      if (currentState !== 'sleep' && window.chat) {
        window.chat.speak(null);
      }
    }, NO_INTERACT_MS);
  }

  // ── Tray actions ──────────────────────────────────────────────────────
  function handleTrayAction(action) {
    resetNoInteractTimer();

    switch (action) {
      case 'feed': {
        stopWalk();
        enterState('eat');
        updateStat('hunger', stats.hunger + 30);
        updateStat('mood',   stats.mood   + 5);
        setTimeout(() => { enterState('idle'); scheduleNextAction(); }, 2000);
        break;
      }
      case 'water': {
        stopWalk();
        enterState('drink');
        updateStat('water', stats.water + 30);
        setTimeout(() => { enterState('idle'); scheduleNextAction(); }, 2000);
        break;
      }
      case 'walk': {
        if (stats.energy >= 20) {
          // Randomly walk or run
          startWalk(Math.random() < 0.5 ? 'run' : 'walk');
        }
        break;
      }
      case 'talk': {
        stopWalk();
        enterState('talk');
        if (window.chat) window.chat.speak(null);
        break;
      }
      case 'update-downloaded': {
        stopWalk();
        enterState('talk');
        if (window.chat) window.chat.showMessage('新版本已经准备好，退出后会自动更新。');
        break;
      }
      case 'quit':
        break;
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────
  async function init() {
    stats      = await window.dogAPI.getState();
    screenSize = await window.dogAPI.getScreenSize();
    syncPosFromWindow();

    window.dogAPI.onTrayAction(handleTrayAction);
    startDecayTimers();

    if (shouldSleep()) {
      enterSleep();
    } else if (stats.hunger < 20 || stats.water < 20) {
      enterState('sad');
    } else {
      enterState('idle');
      scheduleNextAction();
    }

    resetNoInteractTimer();
    setInterval(syncPosFromWindow, 500);
  }

  // ── 状态面板 ─────────────────────────────────────────────────────────
  const statusPanel = document.getElementById('status-panel');
  let statusVisible = false;
  let chatVisible = false;

  function updateWindowLayout() {
    window.dogAPI.setWindowLayout({
      width: chatVisible ? 260 : 160,
      height: Math.max(statusVisible ? 276 : 160, chatVisible ? 280 : 160)
    });
  }

  function updateStatusPanel() {
    const map = { hunger: 'hunger', water: 'water', mood: 'mood', energy: 'energy' };
    for (const [key] of Object.entries(map)) {
      const val = stats[key];
      const bar = document.getElementById('bar-' + key);
      const num = document.getElementById('num-' + key);
      bar.style.width = val + '%';
      bar.classList.toggle('low', val < 30);
      num.textContent = val;
    }
  }

  function showStatusPanel() {
    updateStatusPanel();
    statusPanel.classList.remove('hidden');
    statusVisible = true;
    updateWindowLayout();
  }

  function hideStatusPanel() {
    statusPanel.classList.add('hidden');
    statusVisible = false;
    updateWindowLayout();
  }

  function toggleStatusPanel() {
    if (statusVisible) hideStatusPanel();
    else showStatusPanel();
  }

  // ── 鼠标抚摸、单击状态面板、右键菜单、双击奔跑 ─────────────────────
  let singleClickTimer = null;

  dogEl.addEventListener('mouseenter', () => {
    window.dogAPI.setIgnoreMouse(false);
    if (currentState === 'sleep' || currentState === 'sad') return;
    enterState('pet');
    updateStat('mood', stats.mood + 2);
    resetNoInteractTimer();
  });

  dogEl.addEventListener('mouseleave', () => {
    window.dogAPI.setIgnoreMouse(true, { forward: true });
    if (currentState === 'pet') enterState(prevState || 'idle');
  });

  // 左键单击：呼出状态面板（等 250ms 确认不是双击）
  dogEl.addEventListener('click', () => {
    clearTimeout(singleClickTimer);
    singleClickTimer = setTimeout(() => {
      singleClickTimer = null;
      toggleStatusPanel();
      resetNoInteractTimer();
    }, 250);
  });

  // 右键：原生互动菜单
  dogEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.dogAPI.showContextMenu();
    resetNoInteractTimer();
  });

  // 双击：奔跑（取消单击计时器）
  dogEl.addEventListener('dblclick', () => {
    clearTimeout(singleClickTimer);
    singleClickTimer = null;
    if (currentState === 'sleep') return;
    if (stats.energy >= 20) startWalk('run');
    resetNoInteractTimer();
  });

  // 状态面板也需要鼠标不穿透
  statusPanel.addEventListener('mouseenter', () => window.dogAPI.setIgnoreMouse(false));
  statusPanel.addEventListener('mouseleave', () => window.dogAPI.setIgnoreMouse(true, { forward: true }));

  // ── Public API for chat.js ─────────────────────────────────────────────
  window.pet = {
    getStats: () => ({ ...stats }),
    enterState,
    resetNoInteractTimer,
    scheduleNextAction,
    stopWalk,
    setChatVisible: (visible) => {
      chatVisible = Boolean(visible);
      updateWindowLayout();
    }
  };

  init();
})();
