import { BCBoolean, BCData, BCDataTag, BCFloat, BCIdent, BCInteger, BCNil, BCString, BCSymbol } from "../../../ir/compiler/bytecode/data.js";
import { BCInternTable } from "../../../ir/compiler/bytecode/intern-table.js";
import { RuntimeSymbol } from "../../../parser/token.js";
import { readFloat64, readInt32, readString, readUint16, readUint32 } from "../../../shared/utils/binary/reader.js";

export function readConstantPool(buf: Uint8Array, sym_table: BCInternTable, offset: number) {
    const constant_pool: { [key: number]: BCData } = {};
    const constant_count = readUint32(buf, offset);
    offset += 4;

    for (let constants_read = 0; constants_read < constant_count; constants_read++) {
        const tag_raw = buf[offset++];

        if (tag_raw >> 3 === BCDataTag.BOOL) {
            constant_pool[constants_read] = new BCBoolean((tag_raw & 1) === 1);
            offset += 2; // read 2 byte length;
            continue;
        }

        if (tag_raw >> 3 === BCDataTag.NIL) {
            constant_pool[constants_read] = new BCNil();
            offset += 2; // read 2 byte length;
            continue;
        }

        const length = readUint16(buf, offset);
        offset += 2;

        const data = new Uint8Array(length);
        for (let i = 0; i < length; i++)
            data[i] = buf[offset++];

        let bcdata: BCData = new BCNil();
        switch (tag_raw >> 3 as BCDataTag) {
            case BCDataTag.INT:
                bcdata = new BCInteger(readInt32(data));
                break;

            case BCDataTag.FLOAT:
                bcdata = new BCFloat(readFloat64(data));
                break;

            case BCDataTag.SYM: {
                const id = readInt32(data);
                const name = sym_table.get(id);
                if (!name)
                    throw new Error(`symbol ${id} missing in intern table`);
                const sym: RuntimeSymbol = { id, name };
                bcdata = new BCSymbol(sym);
                break;
            }

            case BCDataTag.IDENT: {
                const id = readInt32(data);
                const name = sym_table.get(id);
                if (!name)
                    throw new Error(`symbol ${id} missing in intern table`);
                const sym: RuntimeSymbol = { id, name };
                bcdata = new BCIdent(sym, sym_table);
                break;
            }

            case BCDataTag.STR: {
                bcdata = new BCString(readString(data));
                break;
            }

            case BCDataTag.PAIR:
            case BCDataTag.PROC:
                throw new Error("not yet implemented");
        }

        constant_pool[constants_read] = bcdata;
    }

    return constant_pool;
}

