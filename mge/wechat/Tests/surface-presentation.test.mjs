import {test} from 'bun:test';
import assert from 'node:assert/strict';
import {surfacePresentation} from '../Host/surface-presentation.mjs';
const phone={windowWidth:844,windowHeight:390,screenWidth:390,screenHeight:844,pixelRatio:3,safeArea:{left:0,top:47,right:390,bottom:810,width:390,height:763}};
test('portrait-upright iPhone safeArea rotates into each current landscape direction',()=>{
 const a=surfacePresentation(phone,'landscape','ios'),b=surfacePresentation(phone,'landscapeReverse','ios');
 assert.deepEqual([a.width,a.height,a.left,a.top,a.right,a.bottom],[2532,1170,141,0,102,0]);
 assert.deepEqual([b.left,b.top,b.right,b.bottom],[102,0,141,0]);
 const portrait=surfacePresentation({...phone,windowWidth:390,windowHeight:844},'portrait','ios');assert.deepEqual([portrait.left,portrait.top,portrait.right,portrait.bottom],[0,141,0,102]);
});
test('DevTools and explicitly oriented native rectangles are not rotated twice',()=>{
 const info={...phone,screenWidth:844,screenHeight:390,safeArea:{left:47,top:0,right:797,bottom:369}};
 for(const platform of ['devtools','android']){const s=surfacePresentation(info,'landscape',platform);assert.deepEqual([s.left,s.top,s.right,s.bottom],[141,0,141,63]);}
});
test('missing safeArea uses full window; invalid values fail instead of poisoning layout',()=>{
 const full=surfacePresentation({...phone,safeArea:undefined},'landscapeReverse','ios');assert.deepEqual([full.left,full.top,full.right,full.bottom],[0,0,0,0]);
 assert.throws(()=>surfacePresentation({...phone,safeArea:{left:0,top:NaN,right:390,bottom:810}}));
 assert.throws(()=>surfacePresentation({...phone,windowWidth:0}));
});
