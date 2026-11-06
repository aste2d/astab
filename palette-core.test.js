'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const palette=require('./palette-core.js');
const fallback={'--paper':'#eef2eb','--card-bg':'#fafcf8','--ink':'#172018','--muted':'#7f8c81','--workspace-accent':'#4f7657'};
test('custom palette retains each selected color and rejects invalid CSS values',()=>{
 const normalized=palette.normalize({background:'#112233',surface:'url(https://example.com)',accent:'#AABBCC'},fallback);
 assert.equal(normalized.background,'#112233');assert.equal(normalized.surface,'#fafcf8');assert.equal(normalized.accent,'#aabbcc');
 const vars=palette.build(normalized,fallback);assert.equal(vars['--paper'],'#112233');assert.equal(vars['--workspace-accent'],'#aabbcc');
});
test('generated light and dark palettes keep readable text and muted text',()=>{
 for(const dark of [false,true])for(let i=0;i<50;i++){
   const colors=palette.random(dark,()=>i/50);
   assert.ok(Object.values(colors).every(color=>/^#[a-f0-9]{6}$/.test(color)));
   assert.ok(palette.contrast(colors.text,colors.surface)>=7);
   assert.ok(palette.contrast(colors.muted,colors.surface)>=4.5);
   assert.ok(palette.contrast(colors.accent,colors.surface)>=4.5);
 }
});
