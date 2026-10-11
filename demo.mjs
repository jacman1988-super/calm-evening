import {analyzeEvening, proposeEveningOptions} from './constraints.mjs';
import {writeFile} from 'node:fs/promises';

// Fictional examples only. No names, real family profile or personal schedule.
const locked = {tasks: [
  {id: 'lesson', start: '17:30', end: '18:30', transitionMinutes: 20, locked: true},
  {id: 'routine', start: '18:30', end: '19:00', transitionMinutes: 0, locked: true}
]};
const movable = {tasks: [locked.tasks[0], {...locked.tasks[1], locked: false, windowStart: '18:30', windowEnd: '19:30'}]};
const output = {notice: 'Fictional local tool execution, not an Alexa or LLM interaction.',
  fixedExample: {input: locked, analysis: analyzeEvening(locked), options: proposeEveningOptions(locked)},
  flexibleExample: {input: movable, analysis: analyzeEvening(movable), options: proposeEveningOptions(movable)}};
await writeFile(new URL('./demo-output.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log('Saved fictional calculations: demo-output.json');
