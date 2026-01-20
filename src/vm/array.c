#include "array.h"
#include "stdio.h"
#include "vm.h"

void* reallocate(void* ptr, size_t old_size, size_t new_size) {
    if (new_size == 0) {
        free(ptr);
        return NULL;
    }

    void* result = realloc(ptr, new_size);

    if (result == NULL) exit(EXIT_FAILURE);

    return result;
}

// array_uint8_t

void array_uint8_t_push(array_uint8_t* array, uint8_t val) {
    if (array->length >= array->capacity) {
        size_t old_cap  = array->capacity;
        array->capacity = GROW_CAP(old_cap);
        array->data     = GROW_ARR(uint8_t, array->data, old_cap, array->capacity);
    }

    array->data[array->length] = val;
    array->length++;
}

void array_uint8_t_init(array_uint8_t* array) {
    array->capacity = 4;
    array->length   = 0;
    array->data     = (uint8_t*)malloc(array->capacity * sizeof(uint8_t));
}

void array_uint8_t_free(array_uint8_t* array) {
    FREE_ARRAY(uint8_t, array, array->capacity);
}

// array_ptr

void array_ptr_push(array_ptr* array, void* val) {
    if (array->length >= array->capacity) {
        size_t old_cap  = array->capacity;
        array->capacity = GROW_CAP(old_cap);
        array->data     = GROW_ARR(void*, array->data, old_cap, array->capacity);
    }

    array->data[array->length] = val;
    array->length++;
}

void array_ptr_init(array_ptr* array) {
    array->capacity = 4;
    array->length   = 0;
    array->data     = (void**)malloc(array->capacity * sizeof(void*));
}

void array_ptr_free(array_ptr* array) {
    FREE_ARRAY(void*, array, array->capacity);
}

// array_const

void array_const_push(array_const* array, BVMConstant val) {
    if (array->length >= array->capacity) {
        size_t old_cap  = array->capacity;
        array->capacity = GROW_CAP(old_cap);
        array->data     = GROW_ARR(BVMConstant, array->data, old_cap, array->capacity);
    }

    array->data[array->length] = val;
    array->length++;
}

void array_const_init(array_const* array) {
    array->capacity = 4;
    array->length   = 0;
    array->data     = (BVMConstant*)malloc(array->capacity * sizeof(void*));
}

void array_const_free(array_const* array) {
    FREE_ARRAY(BVMConstant, array, array->capacity);
}
