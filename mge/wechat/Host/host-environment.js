const encoding = require('./vendor/encoding.js');

// TextEncoder.encodeInto is newer than the encoding polyfill. Never split a UTF-8 sequence.
function encodeInto(input, destination) {
    let read=0,written=0;
    for(const scalar of String(input)) {
        const bytes=this.encode(scalar);
        if(written+bytes.length>destination.length)break;
        destination.set(bytes,written);written+=bytes.length;read+=scalar.length;
    }
    return {read,written};
}

exports.installHostEnvironment=function(wx,scope) {
    const installed=[];
    if(typeof scope.TextEncoder!=='function'){scope.TextEncoder=encoding.TextEncoder;installed.push('TextEncoder');}
    if(typeof scope.TextEncoder.prototype.encodeInto!=='function') {
        const Base=scope.TextEncoder;
        scope.TextEncoder=class extends Base {encodeInto(input,destination){return encodeInto.call(this,input,destination);}};
        installed.push('TextEncoder.encodeInto');
    }
    if(typeof scope.TextDecoder!=='function'){scope.TextDecoder=encoding.TextDecoder;installed.push('TextDecoder');}
    let source='native performance.now',unit='milliseconds';
    if(typeof scope.performance?.now!=='function') {
        const clock=wx.getPerformance();
        if(typeof clock?.now!=='function')throw new Error('Missing wx.getPerformance().now');
        const info=typeof wx.getDeviceInfo==='function'?wx.getDeviceInfo():wx.getSystemInfoSync();
        if(!info.platform)throw new Error('Missing platform for WeChat performance clock conversion');
        // Official Performance.now is microseconds on devices; DevTools uses milliseconds.
        const divisor=info.platform==='devtools'?1:1000;
        const origin=clock.now();
        scope.performance={timeOrigin:Date.now(),now:()=> (clock.now()-origin)/divisor};
        source='wx.getPerformance().now';unit=divisor===1000?'microseconds converted to milliseconds':'DevTools milliseconds';
        installed.push('performance.now');
    }
    const first=scope.performance.now(),second=scope.performance.now();
    if(!Number.isFinite(first)||!Number.isFinite(second)||second<first)throw new Error('Invalid monotonic performance clock');
    const text='微信😀';const bytes=new scope.TextEncoder().encode(text);
    if(new scope.TextDecoder('utf-8',{fatal:true}).decode(bytes)!==text)throw new Error('UTF-8 host adapter self-test failed');
    return {installed,clockSource:source,inputClockUnit:unit,outputClockUnit:'milliseconds'};
};
