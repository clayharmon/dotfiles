function ccs --description 'Strict C compile: warnings, debug info, sanitizers'
    # usage: ccs file.c [more files/flags]      then run ./a.out
    #   -Wall -Wextra   warn about common mistakes
    #   -g              debug info: line numbers in errors and gdb
    #   -fsanitize=...  crash loudly at the exact line on overflows,
    #                   use-after-free and undefined behavior
    # Prints the full command first so you learn the flags by seeing them.
    set -l cmd cc -Wall -Wextra -g -fsanitize=address,undefined $argv
    set_color 6272a4; echo $cmd; set_color normal
    $cmd
end
