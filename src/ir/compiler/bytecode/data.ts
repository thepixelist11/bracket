import { RuntimeSymbol } from "../../../parser/token.js";
import { Byte } from "../../../shared/utils/binary/types.js";
import { BCInternTable } from "./intern-table.js";

export const enum BCDataTag {
    INT = 0x01,
    FLOAT = 0x02,
    SYM = 0x03,
    STR = 0x04,
    BOOL = 0x05,
    NIL = 0x06,
    PAIR = 0x07,
    PROC = 0x08,
    IDENT = 0x09,
};

class BCDataBase<Tag extends BCDataTag = BCDataTag, const T extends number = number> {
    constructor(
        public readonly tag: Tag,
        public readonly size: T,
        public data: Byte[],
    ) { }

    raw(): Byte[] {
        const tag_byte = this.tag << 3;
        switch (this.tag) {
            case BCDataTag.STR:
            case BCDataTag.SYM:
            case BCDataTag.IDENT:
            case BCDataTag.FLOAT:
            case BCDataTag.INT:
                return [tag_byte, ...this.data];

            case BCDataTag.BOOL:
            case BCDataTag.NIL:
                return [tag_byte | this.data[0]];

            case BCDataTag.PAIR:
            case BCDataTag.PROC:
                throw new Error("not yet implemented");
        }
    }
}

export class BCInteger extends BCDataBase<BCDataTag.INT, 4> {
    constructor(value: number) {
        const data = new Uint8Array(4);
        const view = new DataView(data.buffer);
        view.setInt32(0, value, true);
        super(BCDataTag.INT, 4, Array.from(data));
    }

    get value(): number {
        const view = new DataView(new Uint8Array(this.data).buffer);
        return view.getInt32(0, true);
    }
}

export class BCFloat extends BCDataBase<BCDataTag.FLOAT, 8> {
    constructor(value: number) {
        const data = new Uint8Array(8);
        const view = new DataView(data.buffer);
        view.setFloat64(0, value, true);
        super(BCDataTag.FLOAT, 8, Array.from(data));
    }

    get value(): number {
        const view = new DataView(new Uint8Array(this.data).buffer);
        return view.getFloat64(0, true);
    }
}

export class BCSymbol extends BCDataBase<BCDataTag.SYM, 4> {
    constructor(sym: RuntimeSymbol) {
        // let sym_id;
        //
        // if (sym.interned) {
        //     sym_id = intern_table.getFromString(sym.name);
        //     if (sym_id === undefined) {
        //         sym_id = intern_table.getNextSym();
        //         intern_table.set(sym_id, sym.name);
        //     }
        //
        // } else {
        //     sym_id = sym.id;
        // }

        const data = new Uint8Array(4);
        const view = new DataView(data.buffer);
        view.setInt32(0, sym.id, true);
        super(BCDataTag.SYM, 4, Array.from(data));
    }

    get value(): number {
        const view = new DataView(new Uint8Array(this.data).buffer);
        return view.getInt32(0, true);
    }
}

export class BCIdent extends BCDataBase<BCDataTag.IDENT, 4> {
    constructor(sym: RuntimeSymbol, intern_table: BCInternTable, primitive = false) {
        const sym_id = primitive ? sym.id : sym.id + intern_table.primitive_offset;

        // if (sym.interned)
        //     intern_table.internBCSymbol(sym_id, sym.name, primitive);

        const data = new Uint8Array(4);
        const view = new DataView(data.buffer);
        view.setInt32(0, sym_id, true);
        super(BCDataTag.IDENT, 4, Array.from(data));
    }

    get value(): number {
        const view = new DataView(new Uint8Array(this.data).buffer);
        return view.getInt32(0, true);
    }
}

export class BCString extends BCDataBase<BCDataTag.STR, number> {
    constructor(value: string) {
        const encoded = new TextEncoder().encode(value);
        if (encoded.length >= (1 << 16))
            throw new Error(`string of length ${encoded.length} exceeds the max length of ${1 << 16}`);

        const data = new Uint8Array(encoded.length + 2);
        const view = new DataView(data.buffer);
        view.setUint16(0, encoded.length, true);
        data.set(encoded, 2);

        super(BCDataTag.STR, data.length, Array.from(data));
    }

    get value(): string {
        const view = new DataView(new Uint8Array(this.data).buffer);
        const length = view.getUint16(0, true);
        return new TextDecoder().decode(
            new Uint8Array(this.data.slice(2, 2 + length))
        );
    }
}

export class BCBoolean extends BCDataBase<BCDataTag.BOOL, 1> {
    constructor(value: boolean) {
        const data = new Uint8Array(1);
        data[0] = value ? 1 : 0;
        super(BCDataTag.BOOL, 1, Array.from(data));
    }

    get value(): boolean {
        return this.data[0] === 1;
    }
}

export class BCNil extends BCDataBase<BCDataTag.NIL, 0> {
    constructor() {
        super(BCDataTag.NIL, 0, []);
    }

    get value(): null { return null; }
}

export type BCData =
    | BCInteger & BCDataBase<BCDataTag.INT>
    | BCFloat & BCDataBase<BCDataTag.FLOAT>
    | BCSymbol & BCDataBase<BCDataTag.SYM>
    | BCIdent & BCDataBase<BCDataTag.IDENT>
    | BCString & BCDataBase<BCDataTag.STR>
    | BCNil & BCDataBase<BCDataTag.NIL>
    | BCBoolean & BCDataBase<BCDataTag.BOOL>;

