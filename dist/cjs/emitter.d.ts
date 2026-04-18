/**
 * Minimal, typed EventEmitter — zero dependencies, no Node.js built-in required.
 * Works in browser, Deno, Bun, edge runtimes, and Node.
 */
export type ListenerMap = Record<string, unknown[]>;
type Listener<Args extends unknown[]> = (...args: Args) => void;
export declare class TypedEmitter<Events extends ListenerMap> {
    private readonly _listeners;
    on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this;
    once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this;
    off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this;
    emit<K extends keyof Events>(event: K, ...args: Events[K]): boolean;
    removeAllListeners<K extends keyof Events>(event?: K): this;
    listenerCount<K extends keyof Events>(event: K): number;
}
export {};
//# sourceMappingURL=emitter.d.ts.map