import { Byte } from "../../../shared/utils/binary/types.js";
import { splitUint16, splitUint32, splitUint8 } from "../../../shared/utils/binary/writer.js";
import { BCData } from "../bytecode/data.js";

//            Constant Pool (0x02)           The constant pool stores all literal values referenced
// Constant Count ------------ 4 bytes         by the bytecode. Constants are indexed implicitly
// Constant Count Times:                       by their position in the pool. Every constant entry
//  Constant Tag ------------- 1 byte          is self-describing through a 5-bit type tag and size.
//  Constant Size ------------ 2 bytes         This section is required.
//  Data --------------------- Size bytes

export type ConstantPool = { [key: number]: BCData };

export class ConstantTable {
    private map = new Map<string, number>();
    private list: BCData[] = [];

    intern(c: BCData) {
        const raw = c.raw();
        const key = Buffer.from(raw).toString("base64");
        let idx = this.map.get(key);
        if (idx === undefined) {
            idx = this.list.length;
            this.map.set(key, idx);
            this.list.push(c);
        }
        return idx;
    }

    values(): BCData[] { return this.list; }
}

export function constantPool(table: ConstantTable): Uint8Array {
    const constants = table.values();
    const tmp: Byte[] = [...splitUint32(constants.length)];
    for (const c of constants) {
        const raw = c.raw();
        const tag = raw[0];
        const data = raw.slice(1);

        if (data.length >= (1 << 16))
            throw new Error(`constant data too large: ${data.length}; max allowed length is ${(1 << 16) - 1}`)

        tmp.push(...splitUint8(tag));
        tmp.push(...splitUint16(data.length));
        tmp.push(...data);
    }

    return new Uint8Array(tmp);
}

