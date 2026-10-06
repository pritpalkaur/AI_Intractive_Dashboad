const test = require('node:test');
const assert = require('node:assert');
const { applyPriceChanges, mergeChanges, createAgent } = require('../src/agent');

const products = [
  { id: 15, label: 'Wireless Mouse - Black', value: 24.99, savedValue: 24.99 },
  { id: 16, label: 'USB-C Charging Cable 2m', value: 9.5, savedValue: 9.5 },
  { id: 17, label: 'Mechanical Keyboard', value: 89, savedValue: 89 },
];

test('set_prices applies valid changes, rounds to 2 decimals and does not mutate the input', () => {
  const result = applyPriceChanges(products, [{ id: 16, price: 10.456 }, { id: 17, price: 0 }]);
  assert.strictEqual(result.error, undefined);
  assert.deepStrictEqual(result.products.map(p => p.value), [24.99, 10.46, 0]);
  assert.deepStrictEqual(result.applied, [
    { id: 16, name: 'USB-C Charging Cable 2m', oldPrice: 9.5, newPrice: 10.46 },
    { id: 17, name: 'Mechanical Keyboard', oldPrice: 89, newPrice: 0 },
  ]);
  assert.strictEqual(products[1].value, 9.5);
});

test('set_prices rejects the whole call and names the bad item', () => {
  for (const [changes, message] of [
    [undefined, /non-empty array/],
    [[], /non-empty array/],
    [[{ id: 16, price: 10 }, { id: 99, price: 1 }], /changes\[1\]: no product has id 99/],
    [[{ id: '16', price: 1 }], /changes\[0\]: id must be an integer/],
    [[{ id: 16, price: '12' }], /price must be a number/],
    [[{ id: 16, price: NaN }], /price must be a number/],
    [[{ id: 16, price: -1 }], /between 0 and 99999999.99/],
    [[{ id: 16, price: 100000000 }], /between 0 and 99999999.99/],
    [[{ id: 16, price: 1 }, { id: 16, price: 2 }], /appears more than once/],
  ]) {
    const result = applyPriceChanges(products, changes);
    assert.match(result.error, message, JSON.stringify(changes));
    assert.strictEqual(result.products, undefined);
  }
});

test('later set_prices calls see earlier ones and only the final value per product is returned', () => {
  let current = applyPriceChanges(products, [{ id: 15, price: 30 }, { id: 16, price: 11 }]).products;
  current = applyPriceChanges(current, [{ id: 15, price: 31 }]).products;
  current = applyPriceChanges(current, [{ id: 16, price: 9.5 }]).products; // back to where it started
  assert.deepStrictEqual(mergeChanges(products, current), [{ id: 15, value: 31 }]);
});

test('createAgent returns null without an API key', () => {
  assert.strictEqual(createAgent({ apiKey: '' }), null);
  assert.strictEqual(createAgent({ apiKey: undefined }), null);
  assert.strictEqual(typeof createAgent({ apiKey: 'sk-ant-test' }).run, 'function');
});
