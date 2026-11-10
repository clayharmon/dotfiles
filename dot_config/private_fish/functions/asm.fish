function asm --description 'Show the assembly a .c, .go or .rs file compiles to'
    # usage: asm FILE [extra compiler flags]
    #   asm sq.c          optimized (-O2)
    #   asm sq.c -O0      unoptimized: compare the two!
    # A local Compiler Explorer (godbolt.org).
    # Rust: only `pub fn`s show up, and tiny ones get inlined away (rustc
    # leaves them for the caller), so mark those #[inline(never)].
    if test (count $argv) -lt 1
        echo 'usage: asm FILE.{c,go,rs} [flags]' >&2
        return 1
    end
    set -l src $argv[1]
    set -l flags $argv[2..]

    # Intel syntax ("mov dst, src", gdb is set to match) only exists on x86;
    # Apple Silicon Macs are ARM, which has a single syntax.
    set -l x86 (test (uname -m) = x86_64; and echo yes)

    switch $src
        case '*.c'
            # -S: stop after compiling to assembly.  No unwind tables: drops .cfi noise.
            set -l intel; test -n "$x86"; and set intel -masm=intel
            set out (cc -O2 -S $intel -fno-asynchronous-unwind-tables $flags -o - $src)
        case '*.go'
            # Go has its own (Plan 9 style) assembly syntax. Drop the GC
            # metadata (FUNCDATA/PCDATA), raw hex dumps and long file paths.
            set out (go build -gcflags=-S $flags -o /dev/null $src 2>&1 |
                string match -rv '\t(FUNCDATA|PCDATA)\t|^\t0x[0-9a-f]{4} ([0-9a-f]{2} )+' |
                string replace -r '^\t0x[0-9a-f]+ \d+ \(.*/([^/]+:\d+)\)' '\t($1)')
        case '*.rs'
            # c++filt turns mangled symbol names back into sq2::sq.
            set -l intel; test -n "$x86"; and set intel -C llvm-args=-x86-asm-syntax=intel
            set out (rustc -O --crate-type=lib --emit=asm=- $intel $flags $src |
                c++filt | string replace -r '::h[0-9a-f]{16}' '')
        case '*'
            echo "asm: don't know how to compile $src" >&2
            return 1
    end
    or return  # compile failed: the errors are already on screen

    # Hide assembler bookkeeping directives, as godbolt does (Linux and macOS ones).
    printf '%s\n' $out |
        string match -rv '^\s+\.(file|ident|section|size|type|p2align|align|text|globl|addrsig\w*|cfi_\w+|build_version|subsections_via_symbols|loh)\b' |
        nvim -R -c 'set ft=asm' -
end
