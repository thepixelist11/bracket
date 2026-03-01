import { toByteString } from "../../cli/formatting.js";
import { BCData, BCDataTag } from "../../ir/compiler/bytecode/data.js";
import { BCInternTable } from "../../ir/compiler/bytecode/intern-table.js";

export function BCDataNumArrToString(data: number[]) {
    const [tag, ...raw] = data;

    switch (tag >> 3) {
        case BCDataTag.INT: {
            const buffer = new DataView(new Uint8Array(raw).buffer);
            return buffer.getInt32(0, true).toString();
        }

        case BCDataTag.FLOAT: {
            const buffer = new DataView(new Uint8Array(raw).buffer);
            return buffer.getFloat64(0, true).toString();
        }

        case BCDataTag.NIL:
            return "nil";

        case BCDataTag.IDENT:
        case BCDataTag.SYM: { // TODO: Intern table lookups
            const buffer = new DataView(new Uint8Array(raw).buffer);
            return buffer.getInt32(0, true).toString();
        }

        case BCDataTag.STR: {
            const length = raw[0];
            const encoded = new Uint8Array(raw.slice(1, 1 + length));
            return new TextDecoder().decode(encoded);
        }

        case BCDataTag.BOOL: {
            return (tag & 1) === 1 ? "#t" : "#f";
        }

        case BCDataTag.PAIR:
        case BCDataTag.PROC:
            throw new Error("not yet implemented");
    }

    return toByteString(data);
}

export function BCDataToString(data: BCData, symbol_table: BCInternTable): string {
    switch (data.tag) {
        case BCDataTag.INT:
        case BCDataTag.FLOAT:
            return data.value.toString();

        case BCDataTag.IDENT:
        case BCDataTag.SYM:
            return symbol_table.get(data.value) ?? "undef";

        case BCDataTag.STR:
            return data.value;

        case BCDataTag.BOOL:
            return data.value ? "#t" : "#f";

        case BCDataTag.NIL:
            return "nil";
    }
}

