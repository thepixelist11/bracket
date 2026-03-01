import { splitUint16, splitUint32 } from "../../../shared/utils/binary/writer.js";
import { BCProcedure } from "../compiler.js";

//           Procedure Table (0x03)          The procedure table defines all callable procedures in
// Procedure Count ----------- 4 bytes         the file and describes execution environments. Free   
// Procedure Count Times:                      variables are represented by symbol references for    
//  Entry PC ----------------- 4 bytes         closure construction and lexical scoping. This section
//  Arity -------------------- 2 bytes         is required.
//  Local Count -------------- 2 bytes
//  Free Variable Count ------ 2 bytes
//  Free Variables ----------- Free Var Count * 4 bytes

export function procedureTable(procs: BCProcedure[]): Uint8Array {
    const tmp: number[] = [...splitUint32(procs.length)];
    for (const proc of procs) {
        tmp.push(...splitUint32(proc.entry));
        tmp.push(...splitUint16(proc.arity));
        tmp.push(...splitUint16(proc.locals));

        if (proc.free_vars.length >= (1 << 16))
            throw new Error(`too many free vars: ${proc.free_vars.length}; max allowed length is ${(1 << 16) - 1}`);

        tmp.push(...splitUint16(proc.free_vars.length));
        for (const sym of proc.free_vars)
            tmp.push(...splitUint32(sym));
    }

    return new Uint8Array(tmp);
}

