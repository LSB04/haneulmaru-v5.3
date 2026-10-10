import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScene} from './scene-settings.js';
test('phone and PC accept the same bounded scene settings',()=>{
 assert.deepEqual(validateScene({count:30,quality:'high',speed:.25,sun:25,top:true,paused:false}),{count:30,quality:'high',speed:.25,sun:25,top:true,paused:false});
 for(const value of [{count:201},{count:true},{sun:NaN},{speed:4},{quality:'invalid'},{spawn:true},{mission:'game'},{target:'real'},[]])assert.throws(()=>validateScene(value));
});
