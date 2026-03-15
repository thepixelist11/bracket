import { IterValue } from "../util/types.js";

export class Result<T = unknown, E = unknown> implements Iterable<
    IterValue<T>
> {
    private constructor(
        public readonly ok: boolean,
        private readonly _val?: T,
        private readonly _err?: E,
    ) { }

    static Ok<T>(val: T): Result<T, never> {
        return new Result(true, val);
    }

    static Err<E>(err: E): Result<never, E> {
        return new Result(false, undefined as never, err);
    }

    public is_ok(): this is OkResult<T> {
        return this.ok;
    }

    public is_err(): this is ErrResult<E> {
        return !this.ok;
    }

    public val(): T {
        if (!this.ok)
            throw new Error(`called val on Err with err: ${this.err}`);
        return this._val as T;
    }

    public err(): E {
        if (this.ok) throw new Error(`called err on Ok with val: ${this.val}`);
        return this._err as E;
    }

    public map<U>(fn: (v: T) => U): Result<U, E> {
        return this.ok
            ? Result.Ok(fn(this._val as T))
            : Result.Err(this._err as E);
    }

    public map_err<F>(fn: (e: E) => F): Result<T, F> {
        return this.ok
            ? Result.Ok(this._val as T)
            : Result.Err(fn(this._err as E));
    }

    public and_then<U, F>(fn: (v: T) => Result<U, F>): Result<U, E | F> {
        return this.ok ? fn(this._val as T) : Result.Err(this._err as E);
    }

    public unwrap(): T {
        if (this.ok) return this._val as T;
        throw this._err;
    }

    public expect(msg: string): T {
        if (this.ok) return this._val as T;
        throw new Error(`${msg}: ${String(this._err)}`);
    }

    public *[Symbol.iterator](): Generator<IterValue<T>> {
        if (!this.ok) return;
        const val = this._val;

        if (
            val != null &&
            typeof (val as any)[Symbol.iterator] === "function"
        ) {
            yield* val as unknown as Iterable<IterValue<T>>;
        }
    }
}

type OkResult<T> = Result<T, never> & {
    ok: true;
};

type ErrResult<E> = Result<never, E> & {
    ok: false;
};

export function Ok<T = undefined>(val?: T) {
    return Result.Ok(val!);
}

export function Err<E>(err: E) {
    return Result.Err(err);
}
