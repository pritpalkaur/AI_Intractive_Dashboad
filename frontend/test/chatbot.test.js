import test from 'node:test';
import assert from 'node:assert';
import { runCommand } from '../src/chatbot.js';

const base = [
  { id: 15, label: 'Wireless Mouse - Black', value: 24.99 },
  { id: 16, label: 'USB-C Charging Cable 2m', value: 9.5 },
  { id: 17, label: 'Mechanical Keyboard', value: 89 },
];
const val = (data, id) => data.find(d => d.id === id)?.value;

test('set price by full or partial name', () => {
  assert.strictEqual(val(runCommand('set Mechanical Keyboard to 79.99', base).data, 17), 79.99);
  assert.strictEqual(val(runCommand('set keyboard to $70', base).data, 17), 70);
  assert.strictEqual(val(runCommand('mouse = 20', base).data, 15), 20);
  assert.strictEqual(val(runCommand('change usb-c to 12.345', base).data, 16), 12.35);
});

test('increase / decrease by amount and percent', () => {
  assert.strictEqual(val(runCommand('increase cable by 2', base).data, 16), 11.5);
  assert.strictEqual(val(runCommand('decrease keyboard by 10%', base).data, 17), 80.1);
  assert.strictEqual(val(runCommand('add 10% to mouse', base).data, 15), 27.49);
  assert.strictEqual(val(runCommand('subtract 5 from keyboard', base).data, 17), 84);
});

test('rejects invalid prices', () => {
  assert.ok(runCommand('decrease cable by 20', base).error);
  assert.ok(runCommand('set mouse to 100000000', base).error);
});

test('ambiguous and unknown names', () => {
  const dup = [...base, { id: 18, label: 'Gaming Mouse', value: 50 }];
  assert.ok(runCommand('set mouse to 5', dup).error);
  assert.strictEqual(val(runCommand('set gaming mouse to 5', dup).data, 18), 5);
  assert.ok(runCommand('set monitor to 5', base).error);
});

test('does not mutate input', () => {
  runCommand('set keyboard to 1', base);
  assert.strictEqual(val(base, 17), 89);
});

test('actions and errors', () => {
  assert.strictEqual(runCommand('save', base).action, 'save');
  assert.strictEqual(runCommand('discard', base).action, 'discard');
  assert.strictEqual(runCommand('undo', base).action, 'undo');
  assert.ok(runCommand('blah blah', base).error);
});

test('only text no command understands is marked unknown (sent to the AI assistant)', () => {
  const result = runCommand('Which product is the most expensive?', base);
  assert.strictEqual(result.unknown, true);
  assert.strictEqual(result.data, base);
  for (const text of ['set keyboard to 5', 'set monitor to 5', 'decrease cable by 20', 'save', 'undo', 'show', 'help']) {
    assert.ok(!runCommand(text, base).unknown, text);
  }
});
