import { ANF, ANFProgram } from "./anf.js";
import { BYTECODE_BUFFER_SIZE_FACTOR, BYTECODE_PROGRAM_MAX_SIZE } from "./globals.js";
import { printDeep, toByteString } from "./utils.js";

export const enum BCInstrCode {
    RETURN, LOAD_CONST, LOAD_VAR,
    STORE_VAR, JMP, JMP_TRUE,
    JMP_FALSE, LABEL, CALL,
    TAILCALL, MAKE_CLOSURE, LOAD_CLOSURE,
    STORE_CLOSURE, POP, HALT,
    ADD, SUB, MUL,
    DIV, NEG, AND,
    OR, NOT, XOR,
    CMP_EQ, CMP_LT, CMP_GT,
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
        return this.args.map(a => a.raw());
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
    [BCInstrCode.LABEL, 1],
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

    const emit: EmitFn = (instr) => {
        if (instr.op === BCInstrCode.LABEL) {
            if (instr.args[0].tag !== BCDataTag.STR)
                throw new Error("expected a string argument for label");
            label_positions.set(instr.args[0].value, instructions.length);
        }

        instructions.push(instr);

        if (
            instr.op === BCInstrCode.JMP ||
            instr.op === BCInstrCode.JMP_TRUE ||
            instr.op === BCInstrCode.JMP_FALSE
        ) {
            if (typeof (instr as any).target === "string") {
                pending.push({ index: instructions.length - 1, name: (instr as any).target })
            }
        }
    }

    const label = (name: string) => emit(new BCInstr(BCInstrCode.LABEL, new BCString(name)));
    const patch_labels = () => {
        for (const patch of pending) {
            const target = label_positions.get(patch.name);
            if (target === undefined)
                throw new Error(`unknown label: ${patch.name}`);

            instructions[patch.index].args = {
                ...instructions[patch.index].args,
                0: new BCInteger(target),
            };
        }
    };

    return { instructions, emit, label, patch_labels };
}

class BCInternTable extends Map<number, string> {
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

type CompilerSymbol = number;

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
        const length = encoded.length;
        const data = new Uint8Array(length + 1);
        data[0] = length;
        data.set(encoded, 1);
        super(BCDataTag.STR, length + 1, Array.from(data));
    }

    get value(): string {
        const length = this.data[0];
        const encoded = new Uint8Array(this.data.slice(1, 1 + length));
        return new TextDecoder().decode(encoded);
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

export type BCData =
    | BCInteger & BCDataBase<BCDataTag.INT>
    | BCFloat & BCDataBase<BCDataTag.FLOAT>
    | BCSymbol & BCDataBase<BCDataTag.SYM>
    | BCIdent & BCDataBase<BCDataTag.IDENT>
    | BCString & BCDataBase<BCDataTag.STR>
    | BCBoolean & BCDataBase<BCDataTag.BOOL>;

export class BCCompiler {
    intern_table: BCInternTable = new BCInternTable();

    compileInstructions(anf: ANFProgram): BCInstr[] {
        const { emit, label, patch_labels, instructions } = createEmitter();

        emit(new BCInstr(BCInstrCode.LOAD_CONST, new BCInteger(10)));
        emit(new BCInstr(BCInstrCode.STORE_VAR, new BCIdent("x", this.intern_table)));

        label("loop");
        emit(new BCInstr(BCInstrCode.LOAD_VAR, new BCIdent("x", this.intern_table)));
        emit(new BCInstr(BCInstrCode.LOAD_CONST, new BCInteger(0)));
        emit(new BCInstr(BCInstrCode.CMP_GT));
        emit(new BCInstr(BCInstrCode.LOAD_CONST, new BCBoolean(true)));
        emit(new BCInstr(BCInstrCode.JMP_FALSE, new BCString("end"))); // TODO: Do not use strings here

        emit(new BCInstr(BCInstrCode.LOAD_VAR, new BCIdent("x", this.intern_table)));
        emit(new BCInstr(BCInstrCode.LOAD_CONST, new BCInteger(1)));
        emit(new BCInstr(BCInstrCode.SUB));
        emit(new BCInstr(BCInstrCode.STORE_VAR, new BCIdent("x", this.intern_table)));
        emit(new BCInstr(BCInstrCode.JMP, new BCString("loop")));

        label("end");
        emit(new BCInstr(BCInstrCode.HALT));

        patch_labels();
        return instructions;
    }

    compile(anf: ANFProgram): Uint8Array {
        const instructions = this.compileInstructions(anf);
        let buf = new Uint8Array(1024);
        let offset = 0;

        const write = (...bytes: Byte[]) => {
            if (offset + bytes.length >= buf.length) {
                const new_size = Math.floor(buf.length * BYTECODE_BUFFER_SIZE_FACTOR);

                if (new_size > BYTECODE_PROGRAM_MAX_SIZE)
                    throw new Error(`compiler out of memory; max: ${BYTECODE_PROGRAM_MAX_SIZE}`);

                const new_buf = new Uint8Array(new_size);
                new_buf.set(buf);
                buf = new_buf;
            }

            bytes.forEach(b => buf[offset++] = b);
        }

        for (const instr of instructions) {
            const op_code = instr.op;

            const args = instr.rawArgs().flat();
            write(op_code, ...args);
        }

        return buf.slice(0, offset);
    }
}
