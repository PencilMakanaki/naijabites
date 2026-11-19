import test from 'node:test';
import assert from 'node:assert/strict';
import {canApplyDeliveryAction,DELIVERY_TRANSITIONS} from '../src/deliveries/transitions.js';
test('rider can accept an assigned delivery',()=>assert.equal(canApplyDeliveryAction('assigned','accept'),true));
test('rider can decline before pickup',()=>{assert.equal(canApplyDeliveryAction('assigned','reject'),true);assert.equal(canApplyDeliveryAction('accepted','reject'),true);});
test('pickup requires acceptance',()=>{assert.equal(canApplyDeliveryAction('accepted','pickup'),true);assert.equal(canApplyDeliveryAction('assigned','pickup'),false);});
test('transit requires pickup and completion requires transit',()=>{assert.equal(canApplyDeliveryAction('picked_up','transit'),true);assert.equal(canApplyDeliveryAction('in_transit','complete'),true);assert.equal(canApplyDeliveryAction('picked_up','complete'),false);});
test('delivered delivery cannot be changed again',()=>{for(const action of Object.keys(DELIVERY_TRANSITIONS))assert.equal(canApplyDeliveryAction('delivered',action),false);});
