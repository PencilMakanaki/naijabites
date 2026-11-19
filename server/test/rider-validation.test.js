import test from 'node:test';import assert from 'node:assert/strict';import {validateRiderApplication} from '../src/riders/validation.js';
test('accepts valid rider profile details',()=>assert.equal(validateRiderApplication({phone:'+234 801 234 5678',vehicleType:'motorcycle',vehicleRegistration:'ABC-123'}).vehicleType,'motorcycle'));
test('rejects invalid phone',()=>assert.throws(()=>validateRiderApplication({phone:'bad',vehicleType:'motorcycle'}),e=>e.status===422&&Boolean(e.fields.phone)));
test('rejects unsupported vehicle',()=>assert.throws(()=>validateRiderApplication({phone:'+2348012345678',vehicleType:'helicopter'}),e=>e.status===422&&Boolean(e.fields.vehicleType)));
test('normalizes optional registration',()=>assert.equal(validateRiderApplication({phone:'+2348012345678',vehicleType:'bicycle'}).vehicleRegistration,null));
