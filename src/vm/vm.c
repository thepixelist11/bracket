#include "vm.h"
#include "array.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char* readFile(const char* path, size_t* out_size) {
    FILE* file = fopen(path, "rb");
    if (file == NULL) {
        fprintf(stderr, "could not open file \"%s\"", path);
        exit(EXIT_FILE_READ);
    }

    fseek(file, 0L, SEEK_END);
    size_t file_size = ftell(file);
    rewind(file);

    char* buffer = (char*)malloc(file_size + 1);
    if (buffer == NULL) {
        fprintf(stderr, "not enough memory to read \"%s\"", path);
        exit(EXIT_FILE_READ);
    }

    size_t bytes_read = fread(buffer, sizeof(char), file_size, file);
    if (bytes_read < file_size) {
        fprintf(stderr, "could not read file \"%s\"", path);
        exit(EXIT_FILE_READ);
    }

    buffer[bytes_read] = '\0';
    fclose(file);

    *out_size = (size_t)file_size;
    return buffer;
}

uint8_t read_uint8(Reader* r) {
    if (r->cur + 1 > r->end) {
        fprintf(stderr, "attempted to read out of bounds\n");
        exit(EXIT_READ_OUT_OF_BOUNDS);
    }

    const uint8_t* p = r->cur;
    r->cur += 1;

    return p[0];
}

uint16_t read_uint16(Reader* r) {
    if (r->cur + 2 > r->end) {
        fprintf(stderr, "attempted to read out of bounds\n");
        exit(EXIT_READ_OUT_OF_BOUNDS);
    }

    const uint8_t* p = r->cur;
    r->cur += 2;

    return ((uint16_t)p[0]) | ((uint16_t)p[1] << 8);
}

uint32_t read_uint32(Reader* r) {
    if (r->cur + 4 > r->end) {
        fprintf(stderr, "attempted to read out of bounds\n");
        exit(EXIT_READ_OUT_OF_BOUNDS);
    }

    const uint8_t* p = r->cur;
    r->cur += 4;

    return ((uint32_t)p[0]) | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) |
           ((uint32_t)p[3] << 24);
}

uint8_t* read_bytes(Reader* r, size_t bytes) {
    if (r->cur + bytes > r->end) {
        fprintf(stderr, "attempted to read out of bounds\n");
        exit(EXIT_READ_OUT_OF_BOUNDS);
    }

    uint8_t* b = (uint8_t*)malloc(bytes);
    if (b == NULL) {
        fprintf(stderr, "failed to create read byte buffer\n");
        exit(EXIT_FAILURE);
    }

    memcpy(b, r->cur, bytes);
    r->cur += bytes;
    return b;
}

void skip_bytes(Reader* r, size_t bytes) {
    r->cur += bytes;
}

BVMConstant read_datum(Reader* r) {
    uint8_t tag = read_uint8(r);

    switch (tag >> 3) {
        case TAG_BOOL:
        case TAG_NIL: {
            return (BVMConstant){ .tag = tag, .size = 0, .data = NULL };
        }

        case TAG_IDENT:
        case TAG_SYM:
        case TAG_INT: {
            uint8_t* result = (uint8_t*)malloc(4);
            uint8_t* read   = read_bytes(r, 4);
            memcpy(result, read, 4);
            free(read);
            return (BVMConstant){ .tag = tag, .size = 4, .data = result };
        }

        case TAG_FLOAT: {
            uint8_t* result = (uint8_t*)malloc(8);
            uint8_t* read   = read_bytes(r, 8);
            memcpy(result, read, 8);
            free(read);
            return (BVMConstant){ .tag = tag, .size = 8, .data = result };
        }

        case TAG_STR: {
            uint16_t length    = read_uint16(r);
            uint8_t* result    = (uint8_t*)malloc(length + sizeof(uint16_t));
            uint8_t* read      = read_bytes(r, length);
            *(uint16_t*)result = length;
            memcpy(result + sizeof(uint16_t), read, length);
            free(read);
            return (BVMConstant){ .tag  = tag,
                                  .size = length + sizeof(uint16_t),
                                  .data = result };
        }
    }

    fprintf(stderr, "failed to read datum; invalid tag: %u", tag);
    exit(EXIT_FAILURE);
}

array_const read_datums(Reader* r, size_t count) {
    array_const result;
    result.length   = 0;
    result.capacity = count;
    result.data     = malloc(count * sizeof(BVMConstant));

    for (size_t i = 0; i < count; i++) {
        result.data[i] = read_datum(r);
        result.length++;
    }

    return result;
}

uint8_t opArity(BVMInstrCode code) {
    switch (code) {
        case OP_RETURN: return 0;
        case OP_POP: return 0;
        case OP_HALT: return 0;
        case OP_ADD: return 0;
        case OP_SUB: return 0;
        case OP_MUL: return 0;
        case OP_DIV: return 0;
        case OP_NEG: return 0;
        case OP_AND: return 0;
        case OP_OR: return 0;
        case OP_NOT: return 0;
        case OP_XOR: return 0;
        case OP_CMP_EQ: return 0;
        case OP_CMP_LT: return 0;
        case OP_CMP_GT: return 0;

        case OP_LOAD_CONST: return 1;
        case OP_LOAD_VAR: return 1;
        case OP_STORE_VAR: return 1;
        case OP_JMP: return 1;
        case OP_JMP_TRUE: return 1;
        case OP_JMP_FALSE: return 1;
        case OP_LABEL: return 1;
        case OP_CALL: return 1;
        case OP_TAILCALL: return 1;
        case OP_LOAD_CLOSURE: return 1;
        case OP_STORE_CLOSURE: return 1;

        case OP_MAKE_CLOSURE: return 2;
    }

    return 0;
}

void initBVMProgram(const void* bin, size_t bin_size, BVMProgram* bvm) {
    Reader reader = {
        .start = (const uint8_t*)bin,
        .cur   = (const uint8_t*)bin,
        .end   = (const uint8_t*)bin + bin_size,
    };

    uint32_t magic = read_uint32(&reader);

    if (magic != BVM_MAGIC) {
        fprintf(stderr, "malformed BVM binary; incorrect magic bytes\n");
        exit(EXIT_INVALID_MAGIC);
    }

    /* ======================= Header ========================= */

    uint16_t version   = read_uint16(&reader);
    uint8_t  word_size = read_uint8(&reader);
    uint8_t  flags     = read_uint8(&reader);
    skip_bytes(&reader, 16);

    bvm->header = (BVMHeader){ .magic     = magic,
                               .version   = version,
                               .word_size = word_size,
                               .flags     = flags };

    bool flag_optimized  = flags & 0b00000001;
    bool flag_debug      = flags & 0b00000010;
    bool flag_source_map = flags & 0b00000100;
    bool flag_attribute  = flags & 0b00001000;
    bool flag_line_info  = flags & 0b00010000;
    bool flag_type_info  = flags & 0b00100000;

    /* ================== Section Table ======================= */

    uint8_t section_count = read_uint8(&reader);
    bvm->section_count    = section_count;
    bvm->sections         = (BVMSection*)malloc(section_count * sizeof(BVMSection));
    if (bvm->sections == NULL) {
        fprintf(stderr, "failed to create BVM section table\n");
        exit(EXIT_FAILURE);
    }

    for (size_t i = 0; i < section_count; i++) {
        uint8_t  section_tag    = read_uint8(&reader);
        uint32_t section_offset = read_uint32(&reader);
        uint32_t section_size   = read_uint32(&reader);
        bvm->sections[i]        = (BVMSection){ .tag    = section_tag,
                                                .offset = section_offset,
                                                .size   = section_size };
    }

    /* ================== Section Reading ===================== */

    for (size_t i = 0; i < section_count; i++) {
        BVMSection section = bvm->sections[i];
        reader.cur         = reader.start + section.offset;

        switch (section.tag) {
            case S_TAG_SYMBOL_TABLE: {
                uint32_t        symbol_count = read_uint32(&reader);
                BVMSymbolEntry* symbols =
                  (BVMSymbolEntry*)malloc(symbol_count * sizeof(BVMSymbolEntry));

                for (size_t symbols_idx = 0; symbols_idx < symbol_count; symbols_idx++) {
                    uint32_t id     = read_uint32(&reader);
                    uint16_t length = read_uint16(&reader);
                    char*    data   = (char*)read_bytes(&reader, length);

                    symbols[symbols_idx] = (BVMSymbolEntry){
                        .id       = id,
                        .name_len = length,
                        .name     = data,
                    };
                }

                bvm->symbol_count = symbol_count;
                bvm->symbols      = symbols;
                break;
            }

            case S_TAG_CONSTANT_POOL: {
                uint32_t     constant_count = read_uint32(&reader);
                BVMConstant* constant_pool =
                  (BVMConstant*)malloc(constant_count * sizeof(BVMConstant));

                for (size_t constant_idx = 0; constant_idx < constant_count;
                     constant_idx++) {
                    uint8_t tag = read_uint8(&reader);

                    if ((tag >> 3) == TAG_BOOL) {
                        uint8_t* data = (uint8_t*)malloc(1);
                        data[0]       = tag & 1;
                        constant_pool[constant_idx] =
                          (BVMConstant){ .tag = tag, .size = 1, .data = data };
                    } else if ((tag >> 3) == TAG_NIL) {
                        constant_pool[constant_idx] =
                          (BVMConstant){ .tag = tag, .size = 0, .data = NULL };
                    } else {
                        uint16_t size = read_uint16(&reader);
                        uint8_t* data = read_bytes(&reader, size);

                        constant_pool[constant_idx] =
                          (BVMConstant){ .tag = tag, .size = size, .data = data };
                    }
                }

                bvm->constant_count = constant_count;
                bvm->constants      = constant_pool;
                break;
            }

            case S_TAG_PROCEDURE_TABLE: break;

            case S_TAG_BYTECODE: {
                uint8_t* bytecode = read_bytes(&reader, section.size);

                Reader count_r = { .start = bytecode,
                                   .cur   = bytecode,
                                   .end   = bytecode + section.size };

                size_t instruction_count = 0;
                while (count_r.cur < count_r.end) {
                    BVMInstrCode opcode = read_uint8(&count_r);
                    uint8_t      arity  = opArity(opcode);

                    for (uint8_t i = 0; i < arity; i++) {
                        (void)read_datum(&count_r);
                    }

                    instruction_count++;
                }

                BVMInstruction* instructions =
                  (BVMInstruction*)malloc(instruction_count * sizeof(BVMInstruction));
                if (!instructions) {
                    fprintf(stderr, "failed to allocate instruction array\n");
                    exit(EXIT_FAILURE);
                }

                Reader bcr = (Reader){ .start = bytecode,
                                       .cur   = bytecode,
                                       .end   = bytecode + section.size };

                for (size_t i = 0; i < instruction_count; i++) {
                    BVMInstrCode opcode = read_uint8(&bcr);
                    uint8_t      arity  = opArity(opcode);

                    array_const args = read_datums(&bcr, arity);
                    instructions[i] =
                      (BVMInstruction){ .opcode = opcode, .operand = args.data };
                }

                bvm->instruction_count = instruction_count;
                bvm->bytecode          = instructions;

                free(bytecode);
                break;
            }

            case S_TAG_SOURCE_MAP: break;
            case S_TAG_LINE_INFO: break;
            case S_TAG_TYPE_INFO: break;
            case S_TAG_ATTRIBUTES: break;
            case S_TAG_VENDOR: break;

            default: break;
        }
    }
}

void freeBVMProgram(BVMProgram* bvm) {}

void initBVM(BVM* bvm, const BVMProgram* program) {
    if (bvm == NULL || program == NULL) {
        fprintf(stderr, "initBVMExec: invalid arguments\n");
        exit(EXIT_FAILURE);
    }

    memset(bvm, 0, sizeof(BVM));

    bvm->program = program;

    /* ================== Instruction State ===================== */

    bvm->halted = 0;
    bvm->error  = 0;

    /* ======================== Stack =========================== */

    bvm->stack.capacity = 256;
    bvm->stack.top      = 0;
    bvm->stack.data     = (BVMValue*)malloc(bvm->stack.capacity * sizeof(BVMValue));

    if (bvm->stack.data == NULL) {
        fprintf(stderr, "failed to allocate VM stack\n");
        exit(EXIT_FAILURE);
    }

    /* ===================== Environment ======================== */

    bvm->env_capacity = 64;
    bvm->env_count    = 1;

    bvm->envs = (BVMEnv*)malloc(bvm->env_capacity * sizeof(BVMEnv));

    if (bvm->envs == NULL) {
        fprintf(stderr, "failed to allocate environment store\n");
        exit(EXIT_FAILURE);
    }

    /* ======================= Global =========================== */

    bvm->envs[0].parent = UINT32_MAX;
    bvm->envs[0].size   = (uint16_t)program->symbol_count;
    bvm->envs[0].slots  = (BVMValue*)calloc(program->symbol_count, sizeof(BVMValue));

    if (bvm->envs[0].slots == NULL) {
        fprintf(stderr, "failed to allocate global environment\n");
        exit(EXIT_FAILURE);
    }

    bvm->global_env  = 0;
    bvm->current_env = 0;

    /* ==================== Entry Frame ========================= */

    bvm->frame_capacity = 64;
    bvm->frame_count    = 1;
    bvm->frames         = malloc(bvm->frame_capacity * sizeof(BVMFrame));
    bvm->frames[0]      = (BVMFrame){
             .return_pc  = UINT32_MAX,
             .env_idx    = bvm->global_env,
             .stack_base = 0,
    };
}

void freeBVM(BVM* bvm) {
    if (bvm == NULL) return;

    free(bvm->stack.data);
    free(bvm->frames);

    for (uint32_t i = 0; i < bvm->env_count; i++) {
        free(bvm->envs[i].slots);
    }

    free(bvm->envs);
}

BVMValue makeValueFromConstant(BVMConstant* c) {
    switch (c->tag >> 3) {
        case TAG_INT: return (BVMValue){ .tag = TAG_INT, .as.i = *(int32_t*)c->data };

        case TAG_FLOAT: return (BVMValue){ .tag = TAG_FLOAT, .as.f = *(double*)c->data };

        case TAG_SYM:
            return (BVMValue){ .tag = TAG_SYM, .as.sym.sym_id = *(uint32_t*)c->data };

        case TAG_IDENT:
            return (BVMValue){ .tag = TAG_IDENT, .as.sym.sym_id = *(uint32_t*)c->data };

        case TAG_BOOL: return (BVMValue){ .tag = TAG_BOOL, .as.b = c->tag & 1 };

        case TAG_NIL: return (BVMValue){ .tag = TAG_NIL };

        case TAG_STR: {
            uint16_t len  = *(uint16_t*)c->data;
            char*    data = (char*)malloc(len);
            if (data == NULL) {
                fprintf(stderr, "out of memory creating string constant\n");
                exit(EXIT_FAILURE);
            }

            memcpy(data, (uint8_t*)c->data + sizeof(uint16_t), len);

            return (BVMValue){ .tag = TAG_STR, .as.str.len = len, .as.str.data = data };
        }
    }

    fprintf(stderr, "invalid constant tag: %u\n", c->tag >> 3);
    exit(EXIT_FAILURE);
};

BVMValue popStack(BVMStack* stack) {
    if (stack->top == 0) {
        fprintf(stderr, "stack underflow\n");
        exit(EXIT_FAILURE);
    }

    return stack->data[--stack->top];
}

// TODO: Dynamic stack
void pushStack(BVMStack* stack, BVMValue val) {
    if (stack->top >= stack->capacity) {
        fprintf(stderr, "stack overflow\n");
        exit(EXIT_FAILURE);
    }
    stack->data[stack->top++] = val;
}

static inline BVMConstant* operand_at(BVMInstruction* instr, uint8_t index) {
    if (!instr->operand) {
        fprintf(stderr, "instruction has no operands\n");
        exit(EXIT_FAILURE);
    }

    return &instr->operand[index];
}

void executeBVM(BVM* bvm) {
    BVMInstruction* code_start = bvm->program->bytecode;
    BVMInstruction* pc         = code_start;
    BVMInstruction* code_end   = code_start + bvm->program->instruction_count;

    while (!bvm->error && !bvm->halted) {
        if (pc < code_start || pc >= code_end) {
            fprintf(stderr, "program counter out of bounds\n");
            bvm->error = 1;
            break;
        }

        switch (pc->opcode) {
            case OP_HALT: {
                bvm->halted = 1;
                break;
            }

            case OP_POP: {
                popStack(&bvm->stack);
                pc++;
                break;
            }

            case OP_LOAD_CONST: {
                BVMConstant* op = operand_at(pc, 0);

                if (op->size < sizeof(uint32_t)) {
                    fprintf(stderr, "invalid operand size for LOAD_CONST\n");
                    exit(EXIT_FAILURE);
                }

                uint32_t idx = *(uint32_t*)op->data;

                BVMConstant* c = &bvm->program->constants[idx];
                BVMValue     v = makeValueFromConstant(c);
                pushStack(&bvm->stack, v);
                pc++;
                break;
            }

            case OP_LOAD_VAR: {
                BVMConstant* op     = operand_at(pc, 0);
                uint32_t     sym_id = *(uint32_t*)op->data;

                BVMEnv* env = &bvm->envs[bvm->current_env];

                if (sym_id >= env->size) {
                    fprintf(stderr, "symbol id out of range in LOAD_VAR\n");
                    exit(EXIT_FAILURE);
                }

                pushStack(&bvm->stack, env->slots[sym_id]);
                pc++;
                break;
            }

            case OP_STORE_VAR: {
                BVMConstant* op = operand_at(pc, 0);

                if (op->size < sizeof(uint32_t)) {
                    fprintf(stderr, "invalid operand size for STORE_VAR\n");
                    exit(EXIT_FAILURE);
                }

                uint32_t sym_id = *(uint32_t*)op->data;

                BVMEnv* env = &bvm->envs[bvm->current_env];

                if (sym_id >= env->size) {
                    fprintf(stderr, "symbol id is out of range in STORE_VAR\n");
                    exit(EXIT_FAILURE);
                }

                BVMValue value     = popStack(&bvm->stack);
                env->slots[sym_id] = value;

                pc++;
                break;
            }

            case OP_ADD: {
                BVMValue b = popStack(&bvm->stack);
                BVMValue a = popStack(&bvm->stack);
                pushStack(&bvm->stack,
                          (BVMValue){ .tag = TAG_INT, .as.i = a.as.i + b.as.i });
                pc++;
                break;
            }

            case OP_SUB: {
                BVMValue b = popStack(&bvm->stack);
                BVMValue a = popStack(&bvm->stack);
                pushStack(&bvm->stack,
                          (BVMValue){ .tag = TAG_INT, .as.i = a.as.i - b.as.i });
                pc++;
                break;
            }

            case OP_MUL: {
                BVMValue b = popStack(&bvm->stack);
                BVMValue a = popStack(&bvm->stack);
                pushStack(&bvm->stack,
                          (BVMValue){ .tag = TAG_INT, .as.i = a.as.i * b.as.i });
                pc++;
                break;
            }

            case OP_DIV: {
                BVMValue b = popStack(&bvm->stack);
                BVMValue a = popStack(&bvm->stack);
                pushStack(&bvm->stack,
                          (BVMValue){ .tag = TAG_INT, .as.i = a.as.i / b.as.i });
                pc++;
                break;
            }

            case OP_CMP_LT: {
                BVMValue b = popStack(&bvm->stack);
                BVMValue a = popStack(&bvm->stack);
                pushStack(&bvm->stack,
                          (BVMValue){ .tag = TAG_BOOL, .as.b = (a.as.i < b.as.i) });
                pc++;
                break;
            }

            case OP_CMP_GT: {
                BVMValue b = popStack(&bvm->stack);
                BVMValue a = popStack(&bvm->stack);
                pushStack(&bvm->stack,
                          (BVMValue){ .tag = TAG_BOOL, .as.b = (a.as.i > b.as.i) });
                printf("checking %zu > %zu\n", a.as.i, b.as.i);
                pc++;
                break;
            }

            case OP_CMP_EQ: {
                BVMValue b = popStack(&bvm->stack);
                BVMValue a = popStack(&bvm->stack);
                pushStack(&bvm->stack,
                          (BVMValue){ .tag = TAG_BOOL, .as.b = (a.as.i == b.as.i) });
                pc++;
                break;
            }

            case OP_JMP: {
                BVMConstant* op     = operand_at(pc, 0);
                int32_t      offset = *(int32_t*)op->data;
                pc += offset;
                break;
            }

            case OP_JMP_TRUE: {
                BVMConstant* op     = operand_at(pc, 0);
                int32_t      offset = *(int32_t*)op->data;
                BVMValue     cond   = popStack(&bvm->stack);
                if (cond.as.b) {
                    pc += offset;
                } else {
                    pc++;
                }
                break;
            }

            case OP_JMP_FALSE: {
                BVMConstant* op     = operand_at(pc, 0);
                int32_t      offset = *(int32_t*)op->data;
                BVMValue     cond   = popStack(&bvm->stack);
                if (cond.as.b) {
                    pc++;
                } else {
                    pc += offset;
                }
                break;
            }

            case OP_RETURN: {
                BVMValue ret   = popStack(&bvm->stack);
                BVMFrame frame = bvm->frames[--bvm->frame_count];

                if (frame.return_pc == UINT32_MAX) {
                    bvm->halted = 1;
                    break;
                }

                bvm->current_env = frame.env_idx;
                bvm->stack.top   = frame.stack_base;

                pushStack(&bvm->stack, ret);
                pc = code_start + frame.return_pc;
                break;
            }

            case OP_LABEL: {
                fprintf(stderr, "unexpected LABEL operator in bytecode\n");
                bvm->error = 1;
                break;
            }

            default: {
                fprintf(stderr, "unknown opcode: %u\n", pc->opcode);
                bvm->error = 1;
                break;
            }
        }
    }
}

int main(int argc, char* argv[]) {
    if (argc <= 1) {
        fprintf(stderr, "usage: bvm [file]\n");
        exit(EXIT_SUCCESS);
    }

    BVMProgram bvm_program;
    BVM        bvm;

    const char* path = argv[1];
    size_t      bin_size;
    char*       bin = readFile(path, &bin_size);
    initBVMProgram(bin, bin_size, &bvm_program);
    initBVM(&bvm, &bvm_program);

    executeBVM(&bvm);

    freeBVM(&bvm);
    freeBVMProgram(&bvm_program);
}
