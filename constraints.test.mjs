import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeEvening, proposeEveningOptions, InputError} from './constraints.mjs';

const fixed = {tasks: [
  {id: 'lesson', start: '17:30', end: '18:30', transitionMinutes: 20, locked: true},
  {id: 'routine', start: '18:30', end: '19:00', transitionMinutes: 0, locked: true}
]};
test('touching appointments still conflict when transition time is required; locked times stay locked', () => {
  const original = structuredClone(fixed), analysis = analyzeEvening(fixed), options = proposeEveningOptions(fixed);
  assert.deepEqual(analysis.conflicts, [{from: 'lesson', to: 'routine', kind: 'transition_shortfall', shortfallMinutes: 20, bothLocked: true}]);
  assert.equal(options.status, 'needs_coordination'); assert.deepEqual(options.options, []);
  assert.equal(options.externalActionsPerformed, false); assert.deepEqual(fixed, original);
});
test('movable options preserve duration, explicit windows, locked appointments and transition time', () => {
  const input = structuredClone(fixed);
  Object.assign(input.tasks[1], {locked: false, windowStart: '18:30', windowEnd: '19:30'});
  const result = proposeEveningOptions(input);
  assert.equal(result.status, 'options_ready'); assert.equal(result.options[0].shiftMinutes, 20);
  assert.equal(result.options[0].schedule[1].start, '18:50'); assert.equal(result.options[0].schedule[1].end, '19:20');
  for (const option of result.options) {
    assert.deepEqual(option.schedule.find(task => task.id === 'lesson'), fixed.tasks[0]);
    assert.equal(option.requiresUserChoice, true);
    assert.equal(analyzeEvening({tasks: option.schedule}).status, 'clear');
  }
});
test('nested overlaps are detected beyond adjacent tasks, and a narrow window is not treated as a solution', () => {
  const input = {tasks: [
    {id: 'long', start: '09:00', end: '12:00', transitionMinutes: 0, locked: true},
    {id: 'inside1', start: '10:00', end: '10:30', transitionMinutes: 0, locked: true},
    {id: 'inside2', start: '11:00', end: '11:30', transitionMinutes: 0, locked: true}
  ]};
  assert.equal(analyzeEvening(input).conflicts.length, 2);
  const narrow = structuredClone(fixed);
  Object.assign(narrow.tasks[1], {locked: false, windowStart: '18:30', windowEnd: '19:10'});
  assert.equal(proposeEveningOptions(narrow).status, 'needs_coordination');
});
test('invalid times, identifiers, private extra fields and unspecified movable windows are rejected', () => {
  for (const change of [
    task => {task.start = '25:00';}, task => {task.end = '16:00';},
    task => {task.id = 'person@example.com';}, task => {task.email = 'private';},
    task => {task.transitionMinutes = -1;}, task => {task.locked = false;}
  ]) {
    const input = structuredClone(fixed); change(input.tasks[0]);
    assert.throws(() => analyzeEvening(input), InputError);
    assert.throws(() => proposeEveningOptions(input), InputError);
  }
  assert.throws(() => analyzeEvening({...fixed, profile: 'private'}), InputError);
  const duplicate = structuredClone(fixed); duplicate.tasks[1].id = duplicate.tasks[0].id;
  assert.throws(() => analyzeEvening(duplicate), InputError);
});
