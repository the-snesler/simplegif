#!/usr/bin/env bash
# Generates test fixtures into e2e/fixtures/out (requires system ffmpeg).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out/seq
O=out
q() { ffmpeg -v error -y "$@"; }
pal='split[a][b];[a]palettegen[p];[b][p]paletteuse'
# GIFs: ffmpeg's encoder emits sub-rectangle frames and transparency diffs (realistic files)
q -f lavfi -i "testsrc2=s=160x120:r=10:d=2.4" -vf "$pal" $O/small.gif
q -f lavfi -i "testsrc2=s=480x360:r=15:d=4" -vf "$pal" $O/medium.gif
q -f lavfi -i "testsrc2=s=1280x720:r=15:d=8" -vf "$pal" $O/large.gif
q -f lavfi -i "testsrc=s=200x150:r=10:d=2" -vf "$pal" -gifflags -offsetting-transdiff $O/full-frames.gif
# Real transparency: a moving opaque box over a transparent background
q -f lavfi -i "color=c=black@0.0:s=120x90:r=10:d=2,format=rgba" -f lavfi -i "color=c=red:s=30x30:r=10:d=2" \
  -filter_complex "[0][1]overlay=x='t*40':y=30,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128" $O/transparent.gif
# Videos
q -f lavfi -i "testsrc2=s=640x360:r=30:d=3" -c:v libx264 -pix_fmt yuv420p $O/clip.mp4
q -f lavfi -i "testsrc2=s=1280x720:r=30:d=6" -c:v libx264 -pix_fmt yuv420p $O/clip720.mp4
q -f lavfi -i "testsrc2=s=640x360:r=30:d=3" -c:v libvpx-vp9 -b:v 1M -deadline realtime $O/clip.webm
q -f lavfi -i "testsrc2=s=320x240:r=25:d=2" -c:v libvpx -b:v 1M -deadline realtime $O/clip-vp8.webm
q -i $O/clip.mp4 -c copy -metadata:s:v:0 rotate=90 $O/clip-rotated.mp4
q -f lavfi -i "testsrc2=s=320x240:r=25:d=2" -c:v mpeg4 $O/clip.avi
# Image sequence + single image
q -f lavfi -i "testsrc2=s=320x240:r=10:d=2" $O/seq/frame_%02d.png
q -f lavfi -i "testsrc2=s=300x200:r=1:d=1" -frames:v 1 $O/single.png

# Reference frames (ffmpeg auto-rotates) as raw RGBA for orientation checks
q -i $O/clip-rotated.mp4 -frames:v 1 -f rawvideo -pix_fmt rgba $O/clip-rotated.frame0.rgba
q -i $O/clip.mp4 -frames:v 1 -f rawvideo -pix_fmt rgba $O/clip.frame0.rgba
