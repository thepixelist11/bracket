import { BCProcedure } from "../../../ir/compiler/compiler.js";
import { readUint16, readUint32 } from "../../../shared/utils/binary/reader.js";

export function readProcedureTable(buf: Uint8Array, offset: number) {
    const procedure_table: BCProcedure[] = [];
    const procedure_count = readUint32(buf, offset);
    offset += 4;

    for (let proc_idx = 0; proc_idx < procedure_count; proc_idx++) {
        const entry = readUint32(buf, offset);
        offset += 4;

        const arity = readUint16(buf, offset);
        offset += 2;

        const locals = readUint16(buf, offset);
        offset += 2;

        const free_var_count = readUint16(buf, offset);
        offset += 2;

        const free_vars: number[] = [];
        for (let i = 0; i < free_var_count; i++) {
            free_vars.push(readUint32(buf, offset));
            offset += 4;
        }

        const procedure: BCProcedure = { entry, arity, locals, free_vars };

        procedure_table.push(procedure);
    }

    return procedure_table;
}

