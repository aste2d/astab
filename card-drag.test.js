'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function scene({ rejectSave = false } = {}) {
  const handlers = {}, saves = [], messages = []; let renders = 0;
  function node(key) {
    return { dataset: key ? { groupId: key } : {}, hidden: false, style: {}, classList: { add() {}, remove() {} },
      setAttribute() {}, focus() {}, scrollIntoView() {},
      remove() { const index = this.parentElement?.children.indexOf(this); if(index >= 0) this.parentElement.children.splice(index,1); },
      get nextSibling() { return this.parentElement.children[this.parentElement.children.indexOf(this)+1] || null; },
      getBoundingClientRect() { return { left: 10, top: this.parentElement.children.filter(item=>!item.hidden).indexOf(this)*100, width: 400, height: 90 }; },
      cloneNode() { return node(); }, querySelector() { return this.handle; },
      closest(selector) { return selector === '.mission-card' || selector.includes('#openTabsMissions >') ? this : null; } };
  }
  const list = { children: [], querySelectorAll() { return this.children.filter(item => item.dataset.groupId); },
    append(item) { this.insertBefore(item,null); },
    insertBefore(item,target) { item.remove(); const index=target ? this.children.indexOf(target) : this.children.length; this.children.splice(index,0,item);item.parentElement=this; } };
  for(const key of ['a','b','c']) { const card=node(key); card.handle={focus(){},closest(selector){ return selector.includes('mission-heading') ? this : selector === '.mission-card' ? card : null; }};list.append(card); }
  const body={classList:{add(){},remove(){}},append(item){item.parentElement={children:[item]};}};
  const context=vm.createContext({Date, Math, innerHeight: 800, requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    document:{body,createElement:()=>node(), addEventListener:(name,fn)=>{handlers[name]=fn;}},
    window:{addEventListener:(name,fn)=>{handlers[name]=fn;},scrollBy(){}},
    groupOrderState:{},domainGroups:['a','b','c'].map(domain=>({domain})),
    saveGroupOrder:async state=>{if(rejectSave)throw Error('quota');saves.push(state);},
    showToast:message=>messages.push(message),queueRenderDashboard:()=>{renders++;} });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'card-drag.js'),'utf8'),context);
  const fire=async(name,overrides={})=>{handlers[name]({target:list.children[0],button:0,pointerId:1,clientX:30,clientY:30,preventDefault(){},stopImmediatePropagation(){},...overrides});for(let i=0;i<15;i++)await Promise.resolve();};
  return {list,fire,context,saves,messages,order:()=>list.children.map(item=>item.dataset.groupId).filter(Boolean),renders:()=>renders};
}
test('pointer drag persists card order and defers a concurrent dashboard refresh',async()=>{
  const s=scene(), card=s.list.children[0];
  await s.fire('pointerdown',{target:card});
  assert.equal(s.context.AstabCardDrag.deferRender(),true);
  await s.fire('pointermove',{clientY:250});
  await s.fire('pointerup');
  assert.deepEqual(s.order(),['b','c','a']);assert.deepEqual(Array.from(s.saves[0].sessionOrder),['b','c','a']);
  assert.equal(s.context.AstabCardDrag.deferRender(),false);assert.equal(s.renders(),1);
});
test('Escape cancels a drag without saving or leaving hidden cards',async()=>{
  const s=scene(),card=s.list.children[0];
  await s.fire('pointerdown',{target:card});await s.fire('pointermove',{clientY:250});await s.fire('keydown',{key:'Escape'});
  assert.deepEqual(s.order(),['a','b','c']);assert.equal(s.saves.length,0);assert.equal(card.hidden,false);
});
test('keyboard movement saves on Enter and rolls back when storage fails',async()=>{
  for(const rejectSave of [false,true]) {
    const s=scene({rejectSave}),target=s.list.children[0].handle;
    await s.fire('keydown',{target,key:' '});await s.fire('keydown',{target,key:'ArrowDown'});await s.fire('keydown',{target,key:'Enter'});
    assert.deepEqual(s.order(),rejectSave?['a','b','c']:['b','a','c']);
    assert.equal(s.saves.length,rejectSave?0:1);assert.equal(s.messages.length,rejectSave?1:0);
  }
});

test('tab title text and row whitespace can drag the whole card', async()=>{
 for(const area of ['.chip-text','.mission-pages','.actions']){
   const s=scene(),card=s.list.children[0];
   const target={closest(selector){if(selector.includes('#openTabsMissions >'))return card;return selector.split(',').includes(area)?this:null;}};
   await s.fire('pointerdown',{target});await s.fire('pointermove',{clientY:250});await s.fire('pointerup');
   assert.deepEqual(s.order(),['b','c','a']);
 }
});
test('functional buttons and tab icons never start whole-card dragging',async()=>{
 for(const area of ['button','.chip-favicon','input','a']){
   const s=scene(),card=s.list.children[0];
   const target={closest(selector){if(selector.includes('#openTabsMissions >'))return card;return selector.split(',').includes(area)?this:null;}};
   await s.fire('pointerdown',{target});await s.fire('pointermove',{clientY:250});await s.fire('pointerup');
   assert.deepEqual(s.order(),['a','b','c']);assert.equal(s.saves.length,0);
 }
});
