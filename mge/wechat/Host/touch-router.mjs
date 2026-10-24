// WeChat only guarantees identifier stability within a gesture. Never marshal
// its native numeric value directly into the managed Int32 pointer contract.
export function createTouchRouter(deliver) {
    const ids = new Map();
    let next = 1;
    function cancel(nativeId) {
        const id = ids.get(nativeId);
        if (id === undefined) return;
        ids.delete(nativeId);
        deliver(4, id, 0, 0);
    }
    return {
        clear() { ids.clear(); },
        accept(kind, event) {
            const changed = event.changedTouches || [];
            if (Array.isArray(event.touches)) {
                const alive = new Set(event.touches.map(p => p.identifier));
                const changing = new Set(changed.map(p => p.identifier));
                for (const nativeId of ids.keys())
                    if (!alive.has(nativeId) && !changing.has(nativeId)) cancel(nativeId);
            }
            for (const p of changed) {
                const nativeId = p.identifier;
                if (kind === 1) {
                    if (ids.has(nativeId)) cancel(nativeId);
                    if (next > 2147483647) {
                        if (ids.size) throw Error('Managed touch identifier space exhausted');
                        next = 1;
                    }
                    ids.set(nativeId, next++);
                }
                const id = ids.get(nativeId);
                // Desktop hover / late callbacks after cancellation are not presses.
                if (id === undefined) continue;
                deliver(kind, id, p.clientX, p.clientY);
                if (kind === 2 || kind === 4) ids.delete(nativeId);
            }
        }
    };
}
