// Adapt the asynchronous WeChat CSPRNG to the synchronous WebCrypto interface.
// Exhaustion fails explicitly; bytes are never reused or replaced with Math.random.
exports.installSecureRandom = async function(wxApi, scope) {
    let pool = new Uint8Array(0), pending = null, failure = null;
    const manager = wxApi.getUserCryptoManager();
    function refill() {
        if (pending) return pending;
        pending = new Promise((resolve,reject)=>manager.getRandomValues({
            length:65536,
            success(result) {
                const fresh=new Uint8Array(result.randomValues);
                if (fresh.length!==65536) {reject(new Error('Invalid WeChat entropy length'));return;}
                const next=new Uint8Array(pool.length+fresh.length);
                next.set(pool);next.set(fresh,pool.length);pool=next;
                resolve();
            },
            fail:reject,
        })).finally(()=>{pending=null;});
        return pending;
    }
    await refill();
    scope.crypto = {
        getRandomValues(view) {
            if (!ArrayBuffer.isView(view) || view instanceof DataView || view instanceof Float32Array || view instanceof Float64Array)
                throw new TypeError('getRandomValues requires an integer TypedArray');
            if (view.byteLength>65536) throw new RangeError('getRandomValues exceeds 65536 bytes');
            if (view.byteLength>pool.length) throw new Error('WeChat secure entropy unavailable: '+String(failure||'pool exhausted'));
            new Uint8Array(view.buffer,view.byteOffset,view.byteLength).set(pool.subarray(0,view.byteLength));
            pool.fill(0,0,view.byteLength);
            pool=pool.slice(view.byteLength);
            if (pool.length<32768) refill().catch(error=>{failure=error;});
            return view;
        },
    };
};
