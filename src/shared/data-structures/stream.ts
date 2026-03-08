/**
 * Stream<T> provides a cursor-based abstraction over a finite sequence of
 * elements for use in lexing and parsing stages. It encapsulates consumption,
 * lookahead, and backtracking semantics over an eagerly materialized iterable.
 *
 * The underlying iterable is eagerly converted to an internal array at
 * construction time for O(1) indexing and mark/restore for recursive-descent
 * and speculative parsing. Stream is not lazy and is not intended for
 * unbounded or infinite inputs.
 *
 * The stream maintains a single mutable cursor. Elements are consumed by
 * advancing this cursor. The underlying data is immutable once constructed.
 *
 * --- Exhaustion Semantics
 * peek() and next() return Stream.Done when the stream is exhausted and will
 *                   not advance beyond size. (that is, idx == size is the
 *                   exhausted position).
 * expect() and expectN() throws if the stream is exhausted or a predicate
 * fails.
 *
 * Stream.Done is a unique sentinel value used to mark the end of a stream.
 * This should never be returned by the underlying data.
 *
 * --- Backtracking
 * mark() returns the current cursor position as a numeric index and registers
 *        the index in a set of all marked indices. An index must be marked to
 *        be returned to.
 * restore(mark) resets the cursor to the provided index. Throws if the index
 *               was not marked.
 * unmark(mark) deletes a stored mark, returning true if the mark existed and
 *              was removed.
 *
 * Note that restore(mark) does not use advance, and thus may need to be
 * overridden in subclasses that attack additional positional metadata.
 *
 * --- Lookahead
 * peek() returns the current element without consuming it, or Stream.Done if
 *        exhausted.
 * peekN(n) returns up to n elements from the current cursor as an array
 *          without advancing it. The returned array length is
 *          min(n, size - idx). This array will not include Stream.Done.
 * peekWhile(pred) returns a slice from the current element (inclusive) to the
 *                 first element where pred fails, or the end of the stream
 *                 (exclusive).
 * peekWhileN(pred, n) returns a slice of up to n characters from the current
 *                     element (inclusive) to the first element where pred
 *                     fails, or the end of the stream (exclusive).
 *
 * --- Consumption
 * next() consumes and returns the current element or Stream.Done if exhausted.
 * nextN(n) consumes and returns up to n elements as an array. The returned
 *          array length is min(n, size - idx). This array will not include
 *          Stream.Done.
 * consumeIf(pred) consumes the current element only if pred(element) holds.
 * expect(pred, msg?) consumes the current element if the stream is not
 *                    exhausted and pred(element) holds, otherwise throws with
 *                    an optional message and does not consume.
 * expect(pred, n, msg?) consumes the current element if the stream is not
 *                       exhausted and pred(element) holds, otherwise throws
 *                       with an optional message and does not consume. `n`
 *                       indicates the number of elements to pass to the
 *                       predicate and to consume if the predicate is
 *                       successful.
 * readWhile(pred) consumes elements while pred(element) holds and returns the
 *                 consumed slice. Does not advance beyond the element which
 *                 causes pred(element) to fail.
 * readWhileN(pred, n) consumes up to n elements while pred(element) holds and
 *                     returns the consumed slice. Does not advance beyond the
 *                     element which causes pred(element) to fail.
 *
 * Cursor advancement is centralized via a protected advance(count) method. All
 * consuming operations delegate to this method, allowing subclasses to extend
 * cursor-mutation behaviour.
 *
 * Stream additionally has a [Symbol.iterator], which will return all values
 * from the current position to the end, automatically returning to the
 * original position upon completion.
 */
export class Stream<T> {
    protected readonly _data: T[];
    protected _idx: number;
    private _mark_set: Set<number> = new Set();

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

    protected advance(count = 1): void {
        this._idx = Math.min(this.size, this._idx + count);
    }

    public peek(): T | typeof Stream.Done {
        if (this.is_done) return Stream.Done;
        return this._data[this._idx];
    }

    public peekN(n: number): T[] {
        if (n <= 0) return [];
        const take = Math.min(n, this.size - this.idx);
        return this._data.slice(this._idx, this._idx + take);
    }

    public next(): T | typeof Stream.Done {
        if (this.is_done) return Stream.Done;

        const value = this._data[this._idx];
        this.advance(1);
        return value;
    }

    public nextN(n: number): T[] {
        const take = Math.min(n, this.size - this._idx);
        const result = this._data.slice(this._idx, this._idx + take);
        this.advance(take);
        return result;
    }

    public readWhile(pred: (item: T) => boolean): T[] {
        let start = this._idx;

        while (
            !this.is_done &&
            pred(this._data[this._idx])
        ) {
            this.advance(1);
        }

        return this._data.slice(start, this._idx);
    }

    public readWhileN(pred: (item: T) => boolean, n: number): T[] {
        let count = 0;
        let start = this._idx;

        while (
            !this.is_done &&
            pred(this._data[this._idx]) &&
            (count++) < n
        ) {
            this.advance(1);
        }

        return this._data.slice(start, this._idx);
    }

    public peekWhile(pred: (item: T) => boolean): T[] {
        let start = this._idx;
        let end = start;

        while (
            !this.is_done &&
            pred(this._data[this._idx])
        ) {
            end++;
        }

        return this._data.slice(start, end);
    }

    public peekWhileN(pred: (item: T) => boolean, n: number): T[] {
        let count = 0;
        let start = this._idx;
        let end = start;

        while (
            !this.is_done &&
            pred(this._data[this._idx]) &&
            (count++) < n
        ) {
            end++;
        }

        return this._data.slice(start, end);
    }

    public consumeIf(pred: (item: T) => boolean): T | undefined {
        const item = this.peek();
        if (item === Stream.Done) return undefined;
        return pred(item as T) ? this.next() as T : undefined;
    }

    public expect(pred: (item: T) => boolean, msg?: string): T {
        const item = this.peek();
        if (item === Stream.Done)
            throw new Error(`expect failed at ${this.idx}; ${msg ?? "stream ended"} `);
        if (!pred(item as T))
            throw new Error(`expect failed at ${this.idx}; ${msg ?? "predicate failed"} `);
        return this.next() as T;
    }

    public expectN(pred: (item: T[]) => boolean, n: number, msg?: string): T {
        const item = this.peekN(n);
        if (item.length === 0)
            throw new Error(`expect failed at ${this.idx}; ${msg ?? "stream ended"} `);
        if (!pred(item as T[]))
            throw new Error(`expect failed at ${this.idx}; ${msg ?? "predicate failed"} `);
        return this.nextN(n) as T;
    }

    public mark(): number {
        this._mark_set.add(this.idx);
        return this.idx;
    }

    public unmark(mark: number): boolean {
        return this._mark_set.delete(mark);
    }

    public restore(mark: number): void {
        if (!this._mark_set.has(mark))
            throw new Error(`restore failed; index ${mark} was not marked`);

        this._idx = mark;
    }

    static Done = Symbol("StreamDone");

    public *[Symbol.iterator]() {
        const start = this.mark();

        while (!this.is_done) {
            yield this.next() as T;
        }

        this.restore(start);
    }
}

export class PositionalStream extends Stream<string> {
    private _position: Position;
    private _marks: Map<number, Position> = new Map();

    constructor(
        src: string,
        private new_line_pattern = /\n/,
        file: string = "",
        start = 0,
        end?: number
    ) {
        super(src, start, end);
        this._position = {
            row: 0,
            col: 0,
            idx: 0,
            file
        };
    }

    get position() {
        return { ...this._position };
    }

    protected advance(count = 1): void {
        for (let i = 0; i < count && !this.is_done; i++) {
            const ch = this._data[this.idx];
            super.advance(1);
            this.updatePosition(ch);
        }
    }

    public mark(): number {
        this._marks.set(this.idx, this.position);
        return super.mark();
    }

    public unmark(mark: number): boolean {
        this._marks.delete(mark);
        return super.unmark(mark);
    }

    public restore(mark: number): void {
        const mark_pos = this._marks.get(mark);
        if (!mark_pos)
            throw new Error(`restore failed; mark not set: ${mark} `);

        this._idx = mark;
        this._position = mark_pos;
    }

    public updatePosition(ch: string) {
        this._position.idx++;

        if (this.new_line_pattern.test(ch)) {
            this._position.col = 0;
            this._position.row++;
        } else {
            this._position.col++;
        }
    }
}

export interface Position {
    row: number;
    col: number;
    idx: number;
    file: string;
};

