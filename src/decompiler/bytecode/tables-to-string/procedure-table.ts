import { BCProcedure } from "../../../ir/compiler/compiler.js";

export function procedureTableToString(table: BCProcedure[]) {
    let out = "";

    const max_idx_length = (table.length - 1).toString().length;

    for (let i = 0; i < table.length; i++) {
        const proc = table[i];
        if (proc.entry === -1) continue;
        out += `${i.toString().padStart(max_idx_length)}: entry: ${proc.entry}, arity: ${proc.arity}, free vars: ${proc.free_vars.join(" ")}\n`
    }

    return out;
}

