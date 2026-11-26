import assert from 'node:assert/strict';
import {workspaceMessageDirectory} from '../vercel/message-directory.js';
const access={workspace:'owner',seats:[{name:'Teammate',email:'TEAM@example.invalid',role:'Employee'},{name:'Pending',email:'pending@example.invalid',role:'Employee'},{name:'Banned',email:'banned@example.invalid',role:'Employee'}],state:{people:[{name:'Admin',role:'Administrator'}]}};
let args;
const DB={prepare(sql){assert.ok(sql.includes('deleted_at is null'));return {bind(...values){args=values;return {all:async()=>({results:[{id:'owner',email:'owner@example.invalid',email_confirmed_at:'2026-01-01'},{id:'team',email:'team@example.invalid',email_confirmed_at:'2026-01-01'},{id:'banned',email:'banned@example.invalid',email_confirmed_at:'2026-01-01',banned_until:'2099-01-01'}]})}}}}};
const first=await workspaceMessageDirectory(access,DB),second=await workspaceMessageDirectory(access,DB);
assert.deepEqual(first,second);assert.equal(first.length,4);assert.equal(first.find(p=>p.id==='team').available,true);assert.equal(first.find(p=>p.name==='Pending').available,false);assert.match(first.find(p=>p.name==='Pending').id,/^seat-[a-f0-9]{32}$/);assert.equal(first.find(p=>p.id==='banned').available,false);assert.equal(first.find(p=>p.id==='owner').role,'Super Admin');assert.deepEqual(args,['team@example.invalid','pending@example.invalid','banned@example.invalid','owner']);
console.log('PASS: configured seats and owner included; normalized parameterized lookup; stable pending IDs; unconfirmed and banned accounts unavailable.');
