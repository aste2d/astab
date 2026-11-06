'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function controls(){
 const events={},timers=new Map(),scopeEvents={};let id=0;
 const scope={addEventListener:(name,fn)=>{scopeEvents[name]=fn;},removeEventListener:name=>{delete scopeEvents[name];}};
 const button=action=>({innerHTML:action,textContent:'',dataset:{action},style:{minWidth:''},classList:{add(){},remove(){}},contains(target){return target===this;},getAttribute:()=>null,setAttribute(){},removeAttribute(){},getBoundingClientRect:()=>({width:100}),closest:()=>scope});
 const context=vm.createContext({document:{getElementById:()=>scope,addEventListener:(name,fn)=>{events[name]=fn;}},window:{addEventListener:(name,fn)=>{events[name]=fn;}},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'close-confirm.js'),'utf8'),context);
 return {api:context.AstabCloseConfirm,button,events,timers,scopeEvents};
}
test('group and all-tabs actions require two clicks on the same control',()=>{
 for(const action of ['close-domain-tabs','close-all-open-tabs']){const s=controls(),button=s.button(action);assert.equal(s.api.confirm(button),false);assert.equal(button.textContent,'Confirm close');assert.equal(s.api.confirm(button),true);assert.equal(s.timers.size,0);}
});
test('confirmation resets on another action, pointer exit, Escape, timeout or losing focus',()=>{
 for(const cancel of [s=>s.events.click({target:{}}),s=>s.scopeEvents.mouseleave(),s=>s.events.keydown({key:'Escape'}),s=>[...s.timers.values()][0](),s=>s.events.blur()]){
 const s=controls(),button=s.button('close-domain-tabs');s.api.confirm(button);cancel(s);assert.equal(s.api.confirm(button),false);}
 const s=controls(),a=s.button('close-domain-tabs'),b=s.button('close-all-open-tabs');assert.equal(s.api.confirm(a),false);assert.equal(s.api.confirm(b),false);assert.equal(s.api.confirm(a),false);
});
