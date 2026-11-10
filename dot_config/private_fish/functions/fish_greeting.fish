function fish_greeting --description 'Show a random syscall or C library function to learn'
    # Sections 2 (syscalls) and 3 (C library) of the Linux man-pages package.
    # The file list is cached for a week because pacman -Ql takes a moment.
    set -l cache ~/.cache/fish/manpages-23
    if not test -s $cache; or test (math (date +%s) - (path mtime $cache)) -gt 604800
        mkdir -p (path dirname $cache)
        pacman -Qlq man-pages 2>/dev/null | string match -r '.*/man[23]/[^/]+$' >$cache
    end
    test -s $cache; or return

    # Alias pages (".so" redirects) have no NAME line, so try a few times.
    for i in (seq 5)
        set -l page (shuf -n1 $cache)
        set -l desc (zcat -f $page 2>/dev/null | sed -n '/^\.SH NAME/{n;p;q}' |
            string replace -a '\\-' '—' | string replace -ar '\\\\f.' '')
        test -n "$desc"; or continue

        set -l parts (string split -m1 ' — ' $desc)
        set -l sec (string match -r '/man([23])/' $page)[2]
        set -l name (path basename $page | string replace -r '\.[^.]+(\.gz)?$' '')

        set_color bd93f9 --bold; echo -n "  $parts[1]"
        set_color normal; echo -n " — $parts[2]"
        set_color 6272a4; echo "   man $sec $name"
        set_color normal
        return
    end
end
