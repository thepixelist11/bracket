import { BCInternTable } from "../../../ir/compiler/bytecode/intern-table.js";
import { ConstantPool } from "../../../ir/compiler/sections/constant-pool.js";
import { BCDataToString } from "../data-to-string.js";

export function constPoolToString(pool: ConstantPool, sym_table: BCInternTable) {
    let out = "";
    for (const idx in pool) {
        const datum = pool[idx];
        const datum_string = BCDataToString(datum, sym_table);
        out += `${idx.padEnd(6)}${datum_string}\n`;
    }
    return out;
}

