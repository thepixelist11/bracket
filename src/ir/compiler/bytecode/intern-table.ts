export type CompilerSymbol = number;

// NOTE: All primitives must be interned before any other symbols are interned.
// Otherwise, the other symbols will be improperly offset.
export class BCInternTable extends Map<number, string> {
    primitive_offset = 0;
    private __next_sym_id: number = 0;
    constructor(symbols: Iterable<readonly [number, string]> = []) {
        super(symbols);
    }

    getNextSym() { return this.__next_sym_id++; }
    getCurrentSym() { return this.__next_sym_id; }

    getFromString(sym: string) { return (Array.from(this).find(e => e[1] === sym) ?? [undefined])[0]; }

    internBCSymbol(sym_id: number, name = `g${sym_id.toString()}`, primitive = false): CompilerSymbol {
        if (this.has(sym_id)) return sym_id;

        const new_sym_id = this.getNextSym();
        this.set(new_sym_id, name);

        if (primitive)
            this.primitive_offset = Math.max(this.primitive_offset, new_sym_id) + 1;

        return new_sym_id;
    }
}

