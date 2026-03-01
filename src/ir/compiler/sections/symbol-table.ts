import { Byte } from "../../../shared/utils/binary/types.js";
import { splitUint16, splitUint32 } from "../../../shared/utils/binary/writer.js";
import { BCInternTable } from "../bytecode/intern-table.js";

//            Symbol Table (0x01)            Defines a canonical mapping between numerical symbol
//  Symbol Count ------------- 4 bytes         identifiers and their textual names. Each symbol is
//  Symbol Count Times:                        uniquely defined by its symbol ID. Symbol names are
//   Symbol ID --------------- 4 bytes         length-prefixed and UTF-8 encoded. This section is 
//   Name Length ------------- 2 bytes         required.
//   Name (UTF8) ------------- Length bytes

export function symbolTable(table: BCInternTable): Uint8Array {
    const tmp: Byte[] = [...splitUint32(table.size)];
    for (const [id, name] of table) {
        const encoded = new TextEncoder().encode(name);

        if (encoded.length >= (1 << 16))
            throw new Error(`symbol name was of length ${encoded.length}; max allowed length is ${(1 << 16) - 1}`);

        tmp.push(...splitUint32(id));
        tmp.push(...splitUint16(encoded.length));
        tmp.push(...encoded);
    }
    return new Uint8Array(tmp);
}

