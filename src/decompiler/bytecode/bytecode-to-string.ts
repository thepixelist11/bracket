import { toByteString } from "../../cli/formatting.js";
import { BCDataTag } from "../../ir/compiler/bytecode/data.js";
import { BCInternTable } from "../../ir/compiler/bytecode/intern-table.js";
import { BCInstrArityMap, BCInstrCode, BCInstrPrintMap } from "../../ir/compiler/bytecode/opcodes.js";
import { ConstantPool } from "../../ir/compiler/sections/constant-pool.js";
import { BCDataNumArrToString, BCDataToString } from "./data-to-string.js";

export function BCToString(bytecode: Uint8Array, sym_table: BCInternTable, const_pool: ConstantPool) {
    let offset = 0;
    let out = "";

    const offset_print_len = bytecode.length.toString().length;

    const read = (bytes: number): number[] => {
        if (bytes + offset > bytecode.length)
            throw new Error(`attempted to read out of bytecode buffer bounds`);

        const arr = Array.from(bytecode.slice(offset, offset + bytes));
        offset += bytes;

        return arr;
    }

    const readDatum = (count: number): number[][] => {
        if (count === 0) return [];

        let results: number[][] = [];

        for (let i = 0; i < count; i++) {
            const tag = read(1)[0];

            results.push([tag]);

            switch (tag >> 3) {
                case BCDataTag.IDENT:
                case BCDataTag.SYM:
                case BCDataTag.INT:
                    results[results.length - 1].push(...read(4));
                    break;

                case BCDataTag.FLOAT:
                    results[results.length - 1].push(...read(8));
                    break;

                case BCDataTag.STR:
                    const len = read(1)[0];
                    results[results.length - 1].push(len, ...read(len));

                case BCDataTag.BOOL:
                case BCDataTag.NIL:
                    break;

                case BCDataTag.PAIR:
                case BCDataTag.PROC:
                    throw new Error("not yet implemented");
            }
        }

        return results;
    }

    while (offset < bytecode.length) {
        const instr_offset = offset;
        const op_code = read(1)[0];
        const op_name = BCInstrPrintMap.get(op_code);
        const arity = BCInstrArityMap.get(op_code);

        if (!op_name || arity === undefined)
            throw new Error(`undefined instruction: ${toByteString(op_code)} (${op_code}) at ${instr_offset}`);

        if (op_code === BCInstrCode.LABEL)
            throw new Error(`illegal LABEL instruction found in bytecode`);

        const args = readDatum(arity).map(BCDataNumArrToString);

        if (op_code === BCInstrCode.LOAD_CONST) {
            args[0] = `${args[0]} (${BCDataToString(const_pool[parseInt(args[0])], sym_table)})`;
        }

        if (
            op_code === BCInstrCode.LOAD_VAR ||
            op_code === BCInstrCode.STORE_VAR
        ) {
            args[0] = `${args[0]} (${sym_table.get(parseInt(args[0]))})`;
        }

        out += `${instr_offset.toString().padStart(offset_print_len)}`;
        out += ` ${op_name}`;
        out += ` ${args.join(" ")}`;
        out += "\n";
    }

    return out;
}

