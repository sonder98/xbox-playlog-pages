import test from 'node:test';
import assert from 'node:assert/strict';
import {curated,curatedConfig,presets,defaults} from '../src/components/mythic-particle-presets.ts';
test('all 71 curated game title IDs have valid individual settings',()=>{
 assert.equal(Object.keys(curated).length,71);
 for(const [id,c] of Object.entries(curated)){
  assert.match(id,/^\d+$/);assert.ok(c.kind in presets);assert.match(c.color,/^#[0-9a-f]{6}$/i);assert.match(c.accent!,/^#[0-9a-f]{6}$/i);
  assert.ok(['fall','rise','drift'].includes(c.direction));
  for(const n of [c.density,c.speed,c.opacity,c.size])assert.ok(Number.isFinite(n)&&n>=0&&n<=100);
  assert.ok(c.label&&c.note);
  assert.equal('label' in curatedConfig(id),false);
 }
 assert.equal(curatedConfig('1985701699').kind,'leaves');
 assert.equal(curatedConfig('1712074146').kind,'feathers');
 assert.equal(curatedConfig('1792830437').kind,'cards');
 assert.equal(curatedConfig('1860967704').kind,'mist');
 assert.deepEqual(curatedConfig('unknown-title'),defaults);
 assert.deepEqual(curatedConfig('1623704813'),curatedConfig('1642907564'));
});
