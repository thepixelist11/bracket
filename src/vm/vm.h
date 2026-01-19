#ifndef VM_H
#define VM_H

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#define EXIT_FILE_READ 2

#define BVM_MAGIC 0x54524B42 // BRKT

typedef struct {
    uint32_t magic;
    uint16_t version;
    uint8_t  word_size;
    uint8_t  flags;
    uint8_t  padding[16];
} BVMHeader;

typedef struct {
    uint8_t  tag;
    uint32_t offset;
    uint32_t size;
} BVMSectionEntry;

typedef struct {
    uint32_t id;
    uint16_t name_len;
    char*    name;
} BVMSymbol;

typedef struct {
    uint8_t  tag;
    uint16_t size;
    void*    data;
} BVMConstant;

typedef struct {
    uint32_t  entry_pc;
    uint16_t  arity;
    uint16_t  local_count;
    uint16_t  free_count;
    uint32_t* free_vars;
} BVMProcedure;

typedef struct {
    uint8_t  opcode;
    uint8_t* operand;
} BVMInstruction;

typedef struct {
    uint16_t tag;
    uint32_t size;
    void*    data;
} BVMDebugSubsection;

typedef struct {
    uint16_t            subsection_count;
    BVMDebugSubsection* subsections;
} BVMDebugInfo;

typedef struct {
    uint32_t start_pc;
    uint32_t end_pc;
    uint32_t source_file_id;
    uint32_t procedure_idx;
    uint8_t  flags;
} BVMSourceMapEntry;

typedef struct {
    uint32_t start_pc;
    uint32_t end_pc;
    uint32_t file_id;
    uint32_t start_line;
    uint32_t instruction_count;
    uint8_t* line_program_data;
} BVMLineInfoEntry;

typedef struct {
    BVMHeader          header;
    uint8_t            section_count;
    BVMSectionEntry*   sections;
    uint32_t           symbol_count;
    BVMSymbol*         symbols;
    uint32_t           constant_count;
    BVMConstant*       constants;
    uint32_t           procedure_count;
    BVMProcedure*      procedures;
    uint32_t           instruction_count;
    BVMInstruction*    bytecode;
    BVMDebugInfo       debug_info;
    uint32_t           source_map_count;
    BVMSourceMapEntry* source_map;
    uint32_t           line_info_count;
    BVMLineInfoEntry*  line_info;
} BVM;

#endif
