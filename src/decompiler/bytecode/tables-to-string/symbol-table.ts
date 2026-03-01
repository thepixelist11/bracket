import { BCInternTable } from "../../../ir/compiler/bytecode/intern-table.js";

export function symbolTableToString(table: BCInternTable) {
    let out = "";
    let max_sym_length = 3;
    for (const sym of table.values())
        max_sym_length = Math.max(max_sym_length, sym.length);

    for (const [id, sym] of table) {
        out += `${id.toString().padEnd(max_sym_length - sym.length + 1)}${sym}\n`;
    }

    return out;
}

