export class InputError extends Error {}
const fail = message => { throw new InputError(message); };
const fields = ['id', 'start', 'end', 'transitionMinutes', 'locked', 'windowStart', 'windowEnd'];
function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Only documented schedule fields are accepted.');
}
export function minutes(time) {
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Use same-day times in HH:MM format.');
  const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins;
}
const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
export function validate(input) {
  object(input, ['tasks']);
  if (!Array.isArray(input.tasks) || input.tasks.length < 2 || input.tasks.length > 8) fail('Provide between two and eight tasks.');
  const ids = new Set();
  return input.tasks.map(task => {
    object(task, fields);
    if (typeof task.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(task.id) || ids.has(task.id)) fail('Use unique short task IDs, without names or personal identifiers.');
    ids.add(task.id);
    const start = minutes(task.start), end = minutes(task.end), transition = task.transitionMinutes;
    if (end <= start || !Number.isInteger(transition) || transition < 0 || transition > 180 || end + transition > 1439 || typeof task.locked !== 'boolean') fail('Check task duration, transition time and locked flag. Overnight tasks are not supported.');
    if (task.locked && (task.windowStart !== undefined || task.windowEnd !== undefined)) fail('Locked tasks must not include a movable window.');
    let windowStart, windowEnd;
    if (!task.locked) {
      windowStart = minutes(task.windowStart); windowEnd = minutes(task.windowEnd);
      if (windowEnd <= windowStart || start < windowStart || end > windowEnd) fail('A movable window must contain the whole current task.');
    }
    return {...task, start, end, transition, windowStart, windowEnd};
  });
}
function conflicts(tasks) {
  const sorted = [...tasks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)), found = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const first = sorted[i], second = sorted[j];
      if (second.start >= first.end + first.transition) continue;
      found.push({from: first.id, to: second.id,
        kind: second.start < first.end ? 'overlap' : 'transition_shortfall',
        shortfallMinutes: first.end + first.transition - second.start,
        bothLocked: first.locked && second.locked});
    }
  }
  return found;
}
function serialize(tasks) {
  return [...tasks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)).map(task => ({
    id: task.id, start: time(task.start), end: time(task.end),
    transitionMinutes: task.transition, locked: task.locked,
    ...(!task.locked ? {windowStart: time(task.windowStart), windowEnd: time(task.windowEnd)} : {})
  }));
}
export function analyzeEvening(input) {
  const tasks = validate(input), found = conflicts(tasks);
  return {status: found.length ? 'conflict' : 'clear', conflicts: found,
    schedule: serialize(tasks), source: 'deterministic constraint calculation',
    limitations: ['Same-day times only; no real travel or calendar availability lookup.']};
}
export function proposeEveningOptions(input) {
  const tasks = validate(input), initial = conflicts(tasks);
  if (!initial.length) return {status: 'already_clear', options: [], conflicts: [], externalActionsPerformed: false};
  const options = [];
  for (const [index, task] of tasks.entries()) {
    if (task.locked) continue;
    const duration = task.end - task.start;
    for (let start = task.windowStart; start <= task.windowEnd - duration; start++) {
      if (start === task.start || start + duration + task.transition > 1439) continue;
      const candidate = tasks.map((value, i) => i === index ? {...value, start, end: start + duration} : value);
      if (conflicts(candidate).length) continue;
      options.push({changedTask: task.id, shiftMinutes: start - task.start,
        schedule: serialize(candidate), requiresUserChoice: true});
    }
  }
  options.sort((a, b) => Math.abs(a.shiftMinutes) - Math.abs(b.shiftMinutes) || a.shiftMinutes - b.shiftMinutes || a.changedTask.localeCompare(b.changedTask));
  // Distinct alternatives rather than three almost identical one-minute shifts.
  const selected = [];
  for (const option of options) {
    if (selected.some(other => other.changedTask === option.changedTask && Math.abs(other.shiftMinutes - option.shiftMinutes) < 15)) continue;
    selected.push(option); if (selected.length === 3) break;
  }
  return {status: selected.length ? 'options_ready' : 'needs_coordination', options: selected,
    conflicts: initial, externalActionsPerformed: false,
    explanation: selected.length ? 'These are drafts. Locked tasks and durations are preserved. No calendar has been changed.'
      : 'No single-task move inside the stated windows resolves all conflicts. Ask about an alternative appointment or help; neither is assumed available.',
    limitations: ['Search changes one movable task at a time, within its explicitly supplied window.', 'No messages, bookings or calendar updates are performed.']};
}
