// Bracket Virtual Machine (BVM) binary files are of the following format:
//
//             File Header                   The file header identifies critical information
//  Magic Bytes (BRKT) ------- 4 bytes         about the file structure and build status including
//  Version ID --------------- 2 bytes         the word size (either 4 or 8 bytes), any flags
//  Word Size (4 or 8) ------- 1 byte          relating to the optimization level, debug mode, etc.
//  Flags -------------------- 1 byte          as well as magic bytes to correctly identify the file
//  Padding ------------------ 16 bytes        as being a proper Bracket binary file. This must be
//                                             placed directly at the start of the file.
//
//           Section Table                   The section table is used to position sections in the
//  Section Count ------------ 1 byte          file. These consist of a tag, the absolute file offset
//  Count Times:                               in bytes, and the size of the section. This must be
//   Section Tag ------------- 1 byte          placed immediately after the header.
//   Absolute Offset --------- 4 bytes
//   Size -------------------- 4 bytes
//
//            Symbol Table (0x01)            Defines a canonical mapping between numerical symbol
//  Symbol Count ------------- 4 bytes         identifiers and their textual names. Each symbol is
//  Symbol Count Times:                        uniquely defined by its symbol ID. Symbol names are
//   Symbol ID --------------- 4 bytes         length-prefixed and UTF-8 encoded. This section is 
//   Name Length ------------- 2 bytes         required.
//   Name (UTF8) ------------- Length bytes
//
//            Constant Pool (0x02)           The constant pool stores all literal values referenced
// Constant Count ------------ 4 bytes         by the bytecode. Constants are indexed implicitly
// Constant Count Times:                       by their position in the pool. Every constant entry
//  Constant Tag ------------- 1 byte          is self-describing through a 5-bit type tag and size.
//  Constant Size ------------ 2 bytes         This section is required.
//  Data --------------------- Size bytes
//
//           Procedure Table (0x03)          The procedure table defines all callable procedures in
// Procedure Count Times:                      the file and describes execution environments. Free
//  Entry PC ----------------- 4 bytes         variables are represented by symbol references for
//  Arity -------------------- 2 bytes         closure construction and lexical scoping. This section
//  Local Count -------------- 2 bytes         is required.
//  Free Variable Count ------ 2 bytes
//  Free Variables ----------- Free Var Count * 4 bytes
//
//             Bytecode (0x04)               The bytecode section contains the executable instruction
// Instruction Count Times:                    stream for the program. Control flow is expressed through
//  Opcode ------------------- 1 byte          relative jumps encoded as operands. THe instruction set
//  Operand ------------------ Varies          is defined externally according to the BVM specification.
//
//           Debug Info (0x10)               The debug info section contains auxiliary information
// Debug Subsection Count ---- 2 bytes         intended for diagnostics and tooling. This does not
// Count Times:                                affect program execution and is optional. This section
//  Subsection Tag ----------- 2 bytes         associates compiled procedures, variables, and symbols
//  Subsection Size ---------- 4 bytes         with human-readable metadata such as names, source
//  Subsection Data ---------- Size bytes      locations, and lexical scopes. This may be only
//                                             partially populated. Subsections are defined below.
//
//           Source Map (0x11)               The source map defines a mapping between regions of
// Mapping Count ------------- 4 bytes         bytecode and source files or source units. This
// Count Times:                                section is used to determine what source file produced
//  Start PC ----------------- 4 bytes         a given range of bytecode and which procedure or
//  End PC ------------------- 4 bytes         compilation unit a bytecode region originated from.
//  Source File ID ----------- 4 bytes         This section is optional.
//  Procedure Index ---------- 4 bytes
//  Flags -------------------- 1 byte          0: procedure body, 1: top-level or module initializer,
//                                             2: synthesized or compiler-generated, 3: inlined code
//
//           Line Info (0x12)                The line info section provides instruction-to-source line
// Line Program Count -------- 4 bytes         mappings for step-through debugging and runtime error
// Count Times:                                reporting. This establishes a relationship between
//  Start PC ----------------- 4 bytes         bytecode program counters and source line numbers.
//  End PC ------------------- 4 bytes         These are expected to be dense and sequential. This may
//  Initial File ID ---------- 4 bytes         depend on the source map or debug info for file
//  Initial Line ------------- 4 bytes         identification, but remains logically independent.
//  Instruction Count -------- 4 bytes
//  Line Program Data -------- varies
//
//           Type Info (0x13)
//          Not Yet Specified
//
//
//           Attributes (0x20)
//          Not Yet Specified
//
//         Custom/Vendor (0xFF)              The vendor section is reserved for experimental, third-party,
//                                             or domain-specific extensions. THis allows embedding
//                                             proprietary data without modifying the core format. The
//                                             runtime will skip this section unconditionally and execution
//                                             does not depend on it. Multiple custom/vendor sections may
//                                             exist, differentiated by internal tags or conventions within
//                                             the core vendor section.
//
// Debug Subsections:
//
//         Source File Table (0x01)          Defines the set of source files referenced by debug metadata.
// File Count ---------------- 4 bytes
// Count Times:
//  File ID ------------------ 4 bytes
//  Path Length -------------- 2 bytes
//  Path (UTF-8) ------------- Length bytes
//
//
//      Procedure Debug Records (0x02)       Associates procedures with human-readable names and source-level
// Record Count -------------- 4 bytes         location information.
// Count Times:
//  Procedure Index ---------- 4 bytes
//  Name Symbol ID ----------- 4 bytes
//  Source File ID ----------- 4 bytes
//  Start Line --------------- 4 bytes
//  End Line ----------------- 4 bytes
//
//      Variable Debug Records (0x03)        Provides source-level names and scope information for parameters,
// Record Count -------------- 4 bytes         locals, and free variables.
// Count Times:
//  Procedure Index ---------- 4 bytes
//  Variable Kind ------------ 1 byte         (0 = parameter, 1 = local, 2 = free)
//  Variable Index ----------- 2 bytes
//  Name Symbol ID ----------- 4 bytes
//  Scope Start PC ----------- 4 bytes
//  Scope End PC ------------- 4 bytes
//
//     Lexical Scope Records (0x04)          Encodes hierarchical lexical scope information for debuggers
// Scope Count --------------- 4 bytes         and static analysis tools.
// Count Times:
//  Procedure Index ---------- 4 bytes
//  Scope ID ----------------- 4 bytes
//  Parent Scope ID ---------- 4 bytes        (or 0xFFFFFFFF if none)
//  Start PC ----------------- 4 bytes
//  End PC ------------------- 4 bytes
//
//  Furthermore, BVM binaries are little endian and are byte-aligned.

import { ANF, ANFProgram } from "./anf.js";
import { BYTECODE_BUFFER_SIZE_FACTOR, BYTECODE_FLAGS, BYTECODE_HEADER_SIZE, BYTECODE_MAGIC_BYTES, BYTECODE_PROGRAM_MAX_SIZE, BYTECODE_SECTION_TAG_BYTECODE, BYTECODE_SECTION_TAG_CONSTANT_POOL, BYTECODE_SECTION_TAG_PROCEDURE_TABLE, BYTECODE_SECTION_TAG_SYMBOL_TABLE, BYTECODE_WORD_SIZE, VERSION_ID } from "./globals.js";
import { printDeep, splitInt32, splitUint16, splitUint32, splitUint8, toByteString } from "./utils.js";

export const enum BCInstrCode {
    RETURN = 0x00,
    LOAD_CONST = 0x01,
    LOAD_VAR = 0x02,
    STORE_VAR = 0x03,
    JMP = 0x04,
    JMP_TRUE = 0x05,
    JMP_FALSE = 0x06,
    LABEL = 0x07,
    CALL = 0x08,
    TAILCALL = 0x09,
    MAKE_CLOSURE = 0x0a,
    LOAD_CLOSURE = 0x0b,
    STORE_CLOSURE = 0x0c,
    POP = 0x0d,
    HALT = 0x0e,
    ADD = 0x0f,
    SUB = 0x10,
    MUL = 0x11,
    DIV = 0x12,
    NEG = 0x13,
    AND = 0x14,
    OR = 0x15,
    NOT = 0x16,
    XOR = 0x17,
    CMP_EQ = 0x18,
    CMP_LT = 0x19,
    CMP_GT = 0x1a,
};

export const BCInstrPrintMap = new Map<Byte, string>([
    [BCInstrCode.RETURN, "RETURN"],
    [BCInstrCode.LOAD_CONST, "LOAD_CONST"],
    [BCInstrCode.LOAD_VAR, "LOAD_VAR"],
    [BCInstrCode.STORE_VAR, "STORE_VAR"],
    [BCInstrCode.JMP, "JMP"],
    [BCInstrCode.JMP_TRUE, "JMP_TRUE"],
    [BCInstrCode.JMP_FALSE, "JMP_FALSE"],
    [BCInstrCode.LABEL, "LABEL"],
    [BCInstrCode.CALL, "CALL"],
    [BCInstrCode.TAILCALL, "TAILCALL"],
    [BCInstrCode.MAKE_CLOSURE, "MAKE_CLOSURE"],
    [BCInstrCode.LOAD_CLOSURE, "LOAD_CLOSURE"],
    [BCInstrCode.STORE_CLOSURE, "STORE_CLOSURE"],
    [BCInstrCode.POP, "POP"],
    [BCInstrCode.HALT, "HALT"],
    [BCInstrCode.ADD, "ADD"],
    [BCInstrCode.SUB, "SUB"],
    [BCInstrCode.MUL, "MUL"],
    [BCInstrCode.DIV, "DIV"],
    [BCInstrCode.NEG, "NEG"],
    [BCInstrCode.AND, "AND"],
    [BCInstrCode.OR, "OR"],
    [BCInstrCode.NOT, "NOT"],
    [BCInstrCode.XOR, "XOR"],
    [BCInstrCode.CMP_EQ, "CMP_EQ"],
    [BCInstrCode.CMP_LT, "CMP_LT"],
    [BCInstrCode.CMP_GT, "CMP_GT"],
]);

class BCInstr {
    args: BCData[];

    constructor(
        public readonly op: BCInstrCode,
        ...args: BCData[]
    ) { this.args = args; }

    rawArgs() {
        return this.args.map(a => Array.from(a.raw()));
    }
}

export const BCInstrArityMap = new Map<BCInstrCode, number>([
    [BCInstrCode.MAKE_CLOSURE, 2],

    [BCInstrCode.LOAD_CONST, 1],
    [BCInstrCode.LOAD_VAR, 1],
    [BCInstrCode.STORE_VAR, 1],
    [BCInstrCode.JMP, 1],
    [BCInstrCode.JMP_TRUE, 1],
    [BCInstrCode.JMP_FALSE, 1],
    [BCInstrCode.CALL, 1],
    [BCInstrCode.TAILCALL, 1],
    [BCInstrCode.LOAD_CLOSURE, 1],
    [BCInstrCode.STORE_CLOSURE, 1],

    [BCInstrCode.RETURN, 0],
    [BCInstrCode.POP, 0],
    [BCInstrCode.HALT, 0],
    [BCInstrCode.ADD, 0],
    [BCInstrCode.SUB, 0],
    [BCInstrCode.MUL, 0],
    [BCInstrCode.DIV, 0],
    [BCInstrCode.NEG, 0],
    [BCInstrCode.AND, 0],
    [BCInstrCode.OR, 0],
    [BCInstrCode.NOT, 0],
    [BCInstrCode.XOR, 0],
    [BCInstrCode.CMP_EQ, 0],
    [BCInstrCode.CMP_LT, 0],
    [BCInstrCode.CMP_GT, 0],
]);

export const enum BCDataTag {
    INT = 0x01,
    FLOAT = 0x02,
    SYM = 0x03,
    STR = 0x04,
    BOOL = 0x05,
    NIL = 0x06,
    LIST = 0x07,
    PAIR = 0x08,
    PROC = 0x09,
    IDENT = 0x0a,
};

type EmitFn = (instr: BCInstr) => void;

export function createEmitter(): {
    instructions: BCInstr[];
    emit: EmitFn;
    label(name: string): void;
    patch_labels(): void;
} {
    const instructions: BCInstr[] = [];
    const label_positions = new Map<string, number>();
    const pending: { index: number; name: string }[] = [];
    const instr_offsets: number[] = [];

    let byte_offset = 0;

    const emit: EmitFn = (instr) => {
        if (instr.op !== BCInstrCode.LABEL) {
            const expected = BCInstrArityMap.get(instr.op) ?? 0;
            if (instr.args.length !== expected)
                throw new Error(`arity mismatch: opcode ${instr.op} expected ${expected} args; got ${instr.args.length}`);
        }

        if (instr.op === BCInstrCode.LABEL) {
            const arg = instr.args[0];
            if (!(arg instanceof BCString))
                throw new Error("expected a string label");

            label_positions.set(arg.value, byte_offset);
            return;
        }

        if (
            instr.op === BCInstrCode.JMP ||
            instr.op === BCInstrCode.JMP_TRUE ||
            instr.op === BCInstrCode.JMP_FALSE
        ) {
            const arg = instr.args[0];

            if (arg instanceof BCString) {
                pending.push({
                    index: instructions.length,
                    name: arg.value
                });

                // We overwrite the string argument with an integer placeholder
                // to ensure that the byte offset is correct, as the final value
                // will be an integer.
                instr.args[0] = new BCInteger(0);
            } else if (arg instanceof BCInteger) {
                console.log("INT");
            }
        }

        instr_offsets.push(byte_offset);
        instructions.push(instr);

        byte_offset++;
        for (const arg of instr.args)
            byte_offset += arg.raw().length;
    }

    const label = (name: string) => emit(new BCInstr(BCInstrCode.LABEL, new BCString(name)));
    const patch_labels = () => {
        for (const patch of pending) {
            const target = label_positions.get(patch.name);
            if (target === undefined)
                throw new Error(`unknown label: ${patch.name}`);

            const instr = instructions[patch.index];
            const instr_offset = instr_offsets[patch.index];
            const rel = target - instr_offset;

            instr.args[0] = new BCInteger(rel);
        }
    };

    return { instructions, emit, label, patch_labels };
}

export class BCInternTable extends Map<number, string> {
    private __next_sym_id: number = 0;
    constructor(symbols: Iterable<readonly [number, string]> = []) {
        super(symbols);
    }

    getNextSym() { return this.__next_sym_id++; }
    getCurrentSym() { return this.__next_sym_id; }

    getFromString(sym: string) { return (Array.from(this).find(e => e[1] === sym) ?? [undefined])[0]; }

    internNamedBCSymbol(name: string): CompilerSymbol {
        let sym = this.getFromString(name);
        if (sym === undefined) {
            sym = this.getNextSym();
            this.set(sym, name);
        }

        return sym;
    }

    internBCSymbol(sym_id: number): CompilerSymbol {
        if (!this.has(sym_id)) {
            let sym = this.getNextSym();
            this.set(sym, sym_id.toString());
            return sym;
        }

        return sym_id;
    }
}

class ConstantTable {
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

type CompilerSymbol = number;
export type BCSection = { tag: number, offset: number, size: number };
export type Byte = number;

class BCDataBase<Tag extends BCDataTag = BCDataTag, const T extends number = number> {
    constructor(
        public readonly tag: Tag,
        public readonly size: T,
        public data: Byte[],
    ) { }

    raw(): Byte[] {
        const tag_byte = this.tag << 3;
        switch (this.tag) {
            case BCDataTag.STR:
            case BCDataTag.SYM:
            case BCDataTag.IDENT:
            case BCDataTag.FLOAT:
            case BCDataTag.INT:
                return [tag_byte, ...this.data];

            case BCDataTag.BOOL:
            case BCDataTag.NIL:
                return [tag_byte | this.data[0]];

            case BCDataTag.LIST:
            case BCDataTag.PAIR:
            case BCDataTag.PROC:
                throw new Error("not yet implemented");
        }
    }
}

export class BCInteger extends BCDataBase<BCDataTag.INT, 4> {
    constructor(value: number) {
        const data = new Uint8Array(4);
        const view = new DataView(data.buffer);
        view.setInt32(0, value, true);
        super(BCDataTag.INT, 4, Array.from(data));
    }

    get value(): number {
        const view = new DataView(new Uint8Array(this.data).buffer);
        return view.getInt32(0, true);
    }
}

export class BCFloat extends BCDataBase<BCDataTag.FLOAT, 8> {
    constructor(value: number) {
        const data = new Uint8Array(8);
        const view = new DataView(data.buffer);
        view.setFloat64(0, value, true);
        super(BCDataTag.FLOAT, 8, Array.from(data));
    }

    get value(): number {
        const view = new DataView(new Uint8Array(this.data).buffer);
        return view.getFloat64(0, true);
    }
}

export class BCSymbol extends BCDataBase<BCDataTag.SYM, 4> {
    constructor(value: string, intern_table: BCInternTable) {
        const sym = intern_table.internNamedBCSymbol(value);
        const data = new Uint8Array(4);
        const view = new DataView(data.buffer);
        view.setInt32(0, sym, true);
        super(BCDataTag.SYM, 4, Array.from(data));
    }

    get value(): number {
        const view = new DataView(new Uint8Array(this.data).buffer);
        return view.getInt32(0, true);
    }
}

export class BCIdent extends BCDataBase<BCDataTag.IDENT, 4> {
    constructor(value: string, intern_table: BCInternTable) {
        const sym = intern_table.internNamedBCSymbol(value);
        const data = new Uint8Array(4);
        const view = new DataView(data.buffer);
        view.setInt32(0, sym, true);
        super(BCDataTag.IDENT, 4, Array.from(data));
    }

    get value(): number {
        const view = new DataView(new Uint8Array(this.data).buffer);
        return view.getInt32(0, true);
    }
}

export class BCString extends BCDataBase<BCDataTag.STR, number> {
    constructor(value: string) {
        const encoded = new TextEncoder().encode(value);
        if (encoded.length >= (1 << 16))
            throw new Error(`string of length ${encoded.length} exceeds the max length of ${1 << 16}`);

        const data = new Uint8Array(encoded.length + 2);
        const view = new DataView(data.buffer);
        view.setUint16(0, encoded.length, true);
        data.set(encoded, 2);

        super(BCDataTag.STR, data.length, Array.from(data));
    }

    get value(): string {
        const view = new DataView(new Uint8Array(this.data).buffer);
        const length = view.getUint16(0, true);
        return new TextDecoder().decode(
            new Uint8Array(this.data.slice(2, 2 + length))
        );
    }
}

export class BCBoolean extends BCDataBase<BCDataTag.BOOL, 1> {
    constructor(value: boolean) {
        const data = new Uint8Array(1);
        data[0] = value ? 1 : 0;
        super(BCDataTag.BOOL, 1, Array.from(data));
    }

    get value(): boolean {
        return this.data[0] === 1;
    }
}

export class BCNil extends BCDataBase<BCDataTag.NIL, 0> {
    constructor() {
        super(BCDataTag.NIL, 0, []);
    }

    get value(): null { return null; }
}

export type BCData =
    | BCInteger & BCDataBase<BCDataTag.INT>
    | BCFloat & BCDataBase<BCDataTag.FLOAT>
    | BCSymbol & BCDataBase<BCDataTag.SYM>
    | BCIdent & BCDataBase<BCDataTag.IDENT>
    | BCString & BCDataBase<BCDataTag.STR>
    | BCNil & BCDataBase<BCDataTag.NIL>
    | BCBoolean & BCDataBase<BCDataTag.BOOL>;

export interface BCProcedure {
    entry: number;
    arity: number;
    locals: number;
    free_vars: number[];
}

export type ConstantPool = { [key: number]: BCData };

export class BCCompiler {
    intern_table: BCInternTable = new BCInternTable();

    compileInstructions(anf: ANFProgram, consts: ConstantTable): BCInstr[] {
        const { emit, label, patch_labels, instructions } = createEmitter();

        emit(new BCInstr(BCInstrCode.LOAD_CONST, new BCInteger(consts.intern(new BCInteger(10)))));
        emit(new BCInstr(BCInstrCode.STORE_VAR, new BCIdent("x", this.intern_table)));

        label("loop");
        emit(new BCInstr(BCInstrCode.LOAD_VAR, new BCIdent("x", this.intern_table)));
        emit(new BCInstr(BCInstrCode.LOAD_CONST, new BCInteger(consts.intern(new BCInteger(0)))));
        emit(new BCInstr(BCInstrCode.CMP_GT));
        emit(new BCInstr(BCInstrCode.JMP_FALSE, new BCString("end")));

        emit(new BCInstr(BCInstrCode.LOAD_VAR, new BCIdent("x", this.intern_table)));
        emit(new BCInstr(BCInstrCode.LOAD_CONST, new BCInteger(consts.intern(new BCInteger(1)))));
        emit(new BCInstr(BCInstrCode.SUB));
        emit(new BCInstr(BCInstrCode.STORE_VAR, new BCIdent("x", this.intern_table)));
        emit(new BCInstr(BCInstrCode.JMP, new BCString("loop")));

        label("end");
        emit(new BCInstr(BCInstrCode.HALT));

        patch_labels();
        return instructions;
    }

    header(): Uint8Array {
        let head = new Uint8Array(BYTECODE_HEADER_SIZE);
        head.set(BYTECODE_MAGIC_BYTES, 0);                      // magic bytes
        head.set(splitUint16(VERSION_ID), 4);                   // version id
        head.set(splitUint8(BYTECODE_WORD_SIZE), 6);            // word size
        head.set(splitUint8(BYTECODE_FLAGS), 7);                // bit flags
        head.set(Array.from({ length: 16 }, () => 0), 8);       // padding to allow for future header properties
        return head;
    }

    symbolTable(table: BCInternTable): Uint8Array {
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

    constantPool(table: ConstantTable): Uint8Array {
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

    procedureTable(procs: BCProcedure[]): Uint8Array {
        const tmp: number[] = [];
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

    sectionTable(sections: BCSection[]) {
        if (sections.length >= 256)
            throw new Error(`got ${sections.length} sections; expected at most 255 sections`);

        const section_table_size = sections.length * 9 + 1;

        const current_sections = new Set();
        const tmp: number[] = [...splitUint8(sections.length)];
        for (const sec of sections) {
            if (current_sections.has(sec.tag)) {
                console.warn(`duplicate section with tag ${sec.tag}; skipping`);
                continue;
            }

            tmp.push(...splitUint8(sec.tag));
            tmp.push(...splitUint32(sec.offset + section_table_size));
            tmp.push(...splitUint32(sec.size));
        }
        return new Uint8Array(tmp);
    }

    compile(anf: ANFProgram): Uint8Array {
        const consts = new ConstantTable();
        const procs: BCProcedure[] = [];

        const instructions = this.compileInstructions(anf, consts);

        let buf = new Uint8Array(1024);
        let pc = 0;

        const write = (...bytes: Byte[]) => {
            if (pc + bytes.length > buf.length) {
                const new_size = Math.floor(buf.length * BYTECODE_BUFFER_SIZE_FACTOR);

                if (new_size > BYTECODE_PROGRAM_MAX_SIZE)
                    throw new Error(`compiler out of memory; max: ${BYTECODE_PROGRAM_MAX_SIZE}`);

                const new_buf = new Uint8Array(new_size);
                new_buf.set(buf);
                buf = new_buf;
            }

            for (const b of bytes) buf[pc++] = b;
        }

        for (const instr of instructions) {
            write(instr.op);
            for (const arg of instr.args)
                write(...arg.raw());
        }


        const head = this.header();
        const symbols = this.symbolTable(this.intern_table);
        const constants = this.constantPool(consts);
        const procedures = this.procedureTable(procs);
        const bytecode = buf.slice(0, pc);

        let section_offset = BYTECODE_HEADER_SIZE;
        const symbol_section: BCSection = { tag: BYTECODE_SECTION_TAG_SYMBOL_TABLE, size: symbols.length, offset: section_offset };
        section_offset += symbols.length;
        const constants_section: BCSection = { tag: BYTECODE_SECTION_TAG_CONSTANT_POOL, size: constants.length, offset: section_offset };
        section_offset += constants.length;
        const procedures_section: BCSection = { tag: BYTECODE_SECTION_TAG_PROCEDURE_TABLE, size: procedures.length, offset: section_offset };
        section_offset += procedures.length;
        const bytecode_section: BCSection = { tag: BYTECODE_SECTION_TAG_BYTECODE, size: bytecode.length, offset: section_offset };
        section_offset += bytecode.length;

        const section_table = this.sectionTable([
            symbol_section,
            constants_section,
            procedures_section,
            bytecode_section
        ]);

        const out = new Uint8Array(
            head.length +
            section_table.length +
            symbols.length +
            constants.length +
            procedures.length +
            bytecode.length
        );

        let offset = 0;
        for (const section of [head, section_table, symbols, constants, procedures, bytecode]) {
            out.set(section, offset);
            offset += section.length;
        }

        return out;
    }
}
