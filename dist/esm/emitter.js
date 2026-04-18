export class TypedEmitter {
    constructor() {
        this._listeners = new Map();
    }
    on(event, listener) {
        if (!this._listeners.has(event))
            this._listeners.set(event, new Set());
        this._listeners.get(event).add(listener);
        return this;
    }
    once(event, listener) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            listener(...args);
        };
        return this.on(event, wrapper);
    }
    off(event, listener) {
        this._listeners.get(event)?.delete(listener);
        return this;
    }
    emit(event, ...args) {
        const set = this._listeners.get(event);
        if (!set || set.size === 0)
            return false;
        for (const fn of set)
            fn(...args);
        return true;
    }
    removeAllListeners(event) {
        if (event === undefined)
            this._listeners.clear();
        else
            this._listeners.delete(event);
        return this;
    }
    listenerCount(event) {
        return this._listeners.get(event)?.size ?? 0;
    }
}
//# sourceMappingURL=emitter.js.map