#include "vm.h"

char* readFile(const char* path) {
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
    return buffer;
}

void initBVM(char* bin, BVM* bvm) {}

void freeBVM(BVM* bvm) {}

int main(int argc, char* argv[]) {
    if (argc <= 1) {
        fprintf(stderr, "usage: bvm [file]\n");
        exit(EXIT_SUCCESS);
    }

    BVM bvm;

    const char* path = argv[1];
    char*       bin  = readFile(path);
    initBVM(bin, &bvm);
}
