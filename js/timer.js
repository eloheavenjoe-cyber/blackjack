let intervalId = null;
let deadline = null;
let onTickCb = null;
let onExpireCb = null;

export function startTimer(deadlineTimestamp, onTick, onExpire) {
  stopTimer();
  deadline = deadlineTimestamp;
  onTickCb = onTick;
  onExpireCb = onExpire;

  function tick() {
    const remaining = Math.max(0, deadline - Date.now());
    if (onTickCb) onTickCb(remaining);
    if (remaining <= 0) {
      stopTimer();
      if (onExpireCb) onExpireCb();
    }
  }

  tick();
  intervalId = setInterval(tick, 250);
}

export function stopTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  deadline = null;
}

export function getRemainingMs() {
  if (!deadline) return 0;
  return Math.max(0, deadline - Date.now());
}
