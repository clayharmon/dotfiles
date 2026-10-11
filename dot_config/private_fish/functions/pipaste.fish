function pipaste --description 'Copy the clipboard image to the Pi and print an @path for Claude Code'
    # Claude Code on the Pi cannot read the Mac clipboard over SSH (no display
    # server, so no xclip/wl-paste). Ship the image as a file and reference it.
    # The Pi ages files out of ~/inbox after 7 days (~/.config/user-tmpfiles.d).
    set -l host raspberrypi
    set -l dir inbox

    switch "$argv[1]"
        case clean
            # Wipe every pasted image now, without waiting for the 7-day sweep.
            ssh $host "rm -f ~/$dir/*.png"
            return
        case ''
        case '*'
            echo "usage: pipaste [clean]" >&2
            return 2
    end

    set -l name (date +%Y%m%d-%H%M%S).png
    set -l tmp (mktemp -t pipaste).png

    pngpaste $tmp
    or begin
        echo "pipaste: no image on the clipboard" >&2
        rm -f $tmp
        return 1
    end

    ssh $host mkdir -p -m 700 $dir
    and scp -q $tmp $host:$dir/$name
    or begin
        rm -f $tmp
        return 1
    end
    rm -f $tmp

    set -l remote_home (ssh $host 'echo $HOME')
    echo "@$remote_home/$dir/$name"
end
