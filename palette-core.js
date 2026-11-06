'use strict';
(function (scope) {
  const fields = { background: '--paper', surface: '--card-bg', text: '--ink', muted: '--muted', accent: '--workspace-accent' };
  function normalize(input, fallback) {
    return Object.fromEntries(Object.entries(fields).map(([key, variable]) =>
      [key, /^#[0-9a-f]{6}$/i.test(input?.[key] || '') ? input[key].toLowerCase() : fallback[variable]]));
  }
  function mix(first, second, ratio) {
    return '#' + [1, 3, 5].map(index => Math.round(parseInt(first.slice(index,index+2),16) * (1-ratio) + parseInt(second.slice(index,index+2),16) * ratio).toString(16).padStart(2,'0')).join('');
  }
  function luminance(hex) {
    const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
    return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
  }
  function contrast(a,b) { const first=luminance(a),second=luminance(b);return (Math.max(first,second)+.05)/(Math.min(first,second)+.05); }
  function build(input, fallback) {
    const color=normalize(input,fallback);
    return { ...fallback, ...Object.fromEntries(Object.entries(fields).map(([key,variable])=>[variable,color[key]])),
      '--warm-gray': mix(color.surface,color.text,.2),
      '--accent-sage': color.accent,
      '--workspace-accent-soft': mix(color.surface,color.accent,.15),
      '--workspace-accent-border': mix(color.surface,color.accent,.5),
      '--workspace-accent-contrast': contrast(color.accent,'#ffffff') >= contrast(color.accent,'#171717') ? '#ffffff' : '#171717' };
  }
  function hsl(h,s,l) {
    s/=100;l/=100;
    const a=s*Math.min(l,1-l);
    const channel=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};
    return '#' + channel(0)+channel(8)+channel(4);
  }
  function random(dark=false, rng=Math.random) {
    const hue=Math.floor(rng()*360), saturation=25+rng()*20;
    return {background:hsl(hue,18,dark?10:95),surface:hsl(hue,14,dark?15:99),text:hsl(hue,20,dark?94:12),muted:hsl(hue,12,dark?72:39),accent:hsl((hue+20+rng()*40)%360,saturation,dark?70:33)};
  }
  const api={fields,normalize,build,random,contrast};
  if(typeof module!=='undefined')module.exports=api;
  scope.AstabPalette=api;
})(globalThis);
