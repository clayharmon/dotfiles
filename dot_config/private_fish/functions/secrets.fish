function secrets --description 'Export API keys from ~/.config/fish/secrets.env.age into this shell'
    set -l key ~/.config/sops/age/shell.txt
    set -l file ~/.config/fish/secrets.env.age

    switch "$argv[1]"
        case edit
            # Decrypt to a temp file, open in $EDITOR, re-encrypt, wipe the temp file.
            set -l tmp (mktemp -t secrets)
            if test -e $file
                age -d -i $key $file > $tmp; or return 1
            end
            $EDITOR $tmp
            age -e -i $key -o $file $tmp
            rm -P $tmp
            echo "encrypted -> $file"
            return 0
        case ''
        case '*'
            echo "usage: secrets [edit]" >&2
            return 2
    end

    if not test -e $file
        echo "no $file yet. Run: secrets edit" >&2
        return 1
    end

    set -l n 0
    for line in (age -d -i $key $file)
        test -n "$line"; or continue
        string match -q '#*' -- $line; and continue
        set -l kv (string split -m1 = -- $line)
        set -gx $kv[1] $kv[2]
        set n (math $n + 1)
    end
    echo "exported $n variables"
end
