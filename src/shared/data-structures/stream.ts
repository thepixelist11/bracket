export class Stream<T> {
    private readonly _data: T[];
    private _idx: number;

    constructor(data: Iterable<T> = [], start: number = 0, end?: number) {
        if (Array.isArray(data))
            this._data = data.slice(start, end);
        else
            this._data = [...data].slice(start, end);

        this._idx = 0;
    }

    get idx() { return this._idx }
    get is_done(): boolean { return this._idx >= this.size }
    get size() { return this._data.length }

    public peek(): T | null {
        return this._data[this._idx] ?? null;
    }

    public peekN(n: number): T[] {
        if (n <= 0) return [];
        const take = Math.min(n, this.size - this.idx);
        return this._data.slice(this._idx, this._idx + take);
    }

    public next(): T | null {
        if (this.is_done) return null;
        return this._data[this._idx++];
    }

    public nextN(n: number): T[] {
        let result = [];
        while (n > 0 && !this.is_done) {
            result.push(this.next()!);
            n--;
        }
        return result;
    }

    public readUntil(pred: (item: T) => boolean): T[] {
        let start = this._idx;
        while (!this.is_done) {
            const item = this.peek();
            if (item === null || !pred(item)) break;
            this._idx++;
        }
        return this._data.slice(start, this._idx);
    }

    public consumeIf(pred: (item: T) => boolean): T | null {
        const item = this.peek();
        if (item === null) return null;
        return pred(item) ? this.next() : null;
    }

    public expect(pred: (item: T) => boolean, msg?: string): T {
        const item = this.peek();
        if (item == null)
            throw new Error(`expect error; ${msg ?? "stream ended"}`);
        if (!pred(item))
            throw new Error(`expect error; ${msg ?? "predicate failed"}`);
        return this.next()!;
    }

    public mark(): number {
        return this.idx;
    }

    public restore(mark: number): void {
        this._idx = Math.min(this.size, Math.max(0, mark));
    }
}

