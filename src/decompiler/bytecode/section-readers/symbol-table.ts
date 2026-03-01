import { BCInternTable } from "../../../ir/compiler/bytecode/intern-table.js";
import { readUint16, readUint32 } from "../../../shared/utils/binary/reader.js";

export function readSymbolTable(buf: Uint8Array, offset: number): BCInternTable {
    const symbol_table = new Map<number, string>();
    const symbol_count = readUint32(buf, offset);
    offset += 4;

    for (let symbols_read = 0; symbols_read < symbol_count; symbols_read++) {
        const id = readUint32(buf, offset);
        offset += 4;

        const length = readUint16(buf, offset);
        offset += 2;

        const encoded = new Uint8Array(buf.slice(offset, offset + length));
        offset += length;

        const result = new TextDecoder().decode(encoded);
        symbol_table.set(id, result);
    }

    return new BCInternTable(symbol_table);
}

